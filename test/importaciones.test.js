const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const app = require('../src/app');
const formatos = require('../src/config/formatos');
const { detectarArchivo, normalizar } = require('../src/services/detectarArchivo');

function excel(headers, bookType = 'xlsx', multiple = false) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Resumen'], ['Sin productos']]), 'Portada');
  const rows = [['Reporte'], [], headers, headers.map(() => 'dato')];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Hoja arbitraria');
  if (multiple) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Otra');
  return XLSX.write(wb, { type: 'buffer', bookType });
}
for (const formato of formatos) {
  for (const extension of ['xls', 'xlsx', 'xlsm']) {
    test(`${formato.tipo}: ${extension}, hoja arbitraria y encabezados desplazados`, () => {
      const headers = formato.campos.map(a => a[0].toLowerCase().replaceAll(' ', '_'));
      const result = detectarArchivo(excel(headers, extension));
      assert.equal(result.estado, 'DETECTADO');
      assert.equal(result.tipo, formato.tipo);
      assert.equal(result.hoja, 'Hoja arbitraria');
      assert.equal(result.filaEncabezados, 3);
      assert.equal(result.encabezados.length, headers.length);
    });
  }
}
test('Normalización y alias de factura', () => {
  assert.equal(normalizar('  Numeração\nExt. '), 'NUMERACAOEXT');
  const headers = formatos[1].campos.map(a => a.at(-1));
  assert.equal(detectarArchivo(excel(headers)).tipo, 'CODIGOS_BARRA');
});
test('Una columna faltante impide la detección y se informa', () => {
  const result = detectarArchivo(excel(formatos[2].campos.slice(0, -1).map(a => a[0])));
  assert.equal(result.estado, 'NO_RECONOCIDO');
  assert.deepEqual(result.diagnostico[0].faltantes, ['Ean 13']);
});
test('Varias hojas compatibles devuelven ambigüedad', () => {
  const result = detectarArchivo(excel(formatos[0].campos.map(a => a[0]), 'xlsx', true));
  assert.equal(result.estado, 'AMBIGUO'); assert.equal(result.coincidencias.length, 2);
});
test('No acepta texto renombrado ni un ZIP corrupto', () => {
  assert.throws(() => detectarArchivo(Buffer.from('STYLE,MATERIAL CODE,COLOR CODE,SIZE RUN')), /contenido/);
  assert.throws(() => detectarArchivo(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0])), /leer/);
});
test('HTTP: pantalla, carga, errores y límites', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${url}/importaciones`);
  assert.equal(page.status, 200); assert.match(await page.text(), /Detectar archivo/);
  for (const asset of ['/app.js', '/styles.css']) assert.equal((await fetch(`${url}${asset}`)).status, 200);
  async function upload(buffer, name, field = 'archivo') {
    const form = new FormData(); form.append(field, new Blob([buffer]), name);
    const res = await fetch(`${url}/api/importaciones/detectar`, { method: 'POST', body: form });
    return { status: res.status, json: await res.json() };
  }
  for (const extension of ['xls', 'xlsx', 'xlsm']) {
    const response = await upload(excel(formatos[2].campos.map(a => a[0]), extension), `packing-falso.${extension}`);
    assert.equal(response.status, 200); assert.equal(response.json.tipo, 'EAN');
  }
  assert.equal((await upload(Buffer.from('no'), 'archivo.csv')).status, 415);
  assert.equal((await upload(Buffer.from('no'), 'archivo.xlsx')).status, 422);
  assert.equal((await upload(Buffer.alloc(60 * 1024 * 1024 + 1), 'grande.xls')).status, 413);
  assert.equal((await upload(excel(['x']), 'archivo.xlsx', 'otro')).status, 400);
  const missing = await fetch(`${url}/api/importaciones/detectar`, { method: 'POST' });
  assert.equal(missing.status, 400);
});
