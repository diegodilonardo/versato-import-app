const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { detectarArchivo } = require('../src/services/detectarArchivo');
const { vistaPreviaOtros } = require('../src/services/vistaPreviaOtros');
function analizar(rows, extension = 'xlsx') {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(rows), 'Cualquier nombre');
  const b = XLSX.write(libro, { type: 'buffer', bookType: extension });
  return vistaPreviaOtros(b, detectarArchivo(b));
}
const eanHeaders = ['Descrição Marca', 'Linha/Ref', 'Cabedal', 'Cor', 'Numeração Ext', 'Ean 13', 'Qtd. Pares'];
const eanRow = ['VIZZANO', '6531.105', '30158', '105818', '38', '7900294899270', 3];
for (const ext of ['xls', 'xlsx', 'xlsm']) test(`EAN ${ext}: mapeo y duplicados sin invalidar`, () => {
  const p = analizar([eanHeaders, eanRow, eanRow], ext);
  assert.equal(p.resumen.validos, 2); assert.equal(p.resumen.conAdvertencias, 0);
  assert.equal(p.agrupacion.grupos.length, 1); assert.equal(p.agrupacion.grupos[0].PARES, 6);
  assert.equal(p.filas[0].datos.STYLE, '6531.105');
});
test('EAN: longitud, dígito de control, cantidades y obligatorios', () => {
  const mal = [...eanRow]; mal[5] = '7900294899271'; mal[6] = -1; mal[0] = '';
  const corto = [...eanRow]; corto[5] = '123';
  const p = analizar([eanHeaders, mal, corto]);
  assert.equal(p.resumen.conErrores, 2);
  assert.match(p.problemas[0].errores.join(), /control/);
  assert.match(p.problemas[0].errores.join(), /Qtd/);
  assert.match(p.problemas[0].errores.join(), /obligatorio/);
});
const packingHeaders = ['STYLE', 'MATERIAL CODE', 'COLOR CODE', 'SIZE RUN', 'BOXES', 'PAIRS', 'SHOP', '35', '36'];
const packingRow = ['520.59', '21443', '12098', '1', 2, 12, '11714', 2, 4];
for (const ext of ['xls', 'xlsx', 'xlsm']) test(`Packing ${ext}: talles variables, rangos y totales auxiliares`, () => {
  const p = analizar([packingHeaders, packingRow,
    ['', '', '', '', '', '', '', '36/37', '38/39', '40/41'],
    ['520.59', '21443', '12098', '2', 1, 12, '11714', 3, 5, 4],
    ['', '', '', '', '', 24], [], [] ].map((r, i) => [i === 0 ? 'NCM' : i === 5 ? 'TOTAL' : i === 6 ? 'Dirección de fábrica' : '', ...r]), ext);
  assert.equal(p.resumen.total, 2); assert.equal(p.resumen.validos, 2);
  assert.equal(p.resumen.filasAuxiliaresOmitidas, 4);
  assert.equal(p.filas[1].datos.TALLE, '36/37 38/39 40/41');
  assert.equal(p.filas[1].datos.CANTIDAD, '3 5 4');
});
test('Packing: filas incompletas no se omiten y suma incorrecta se informa', () => {
  const incompleta = [...packingRow]; incompleta[0] = '';
  const suma = [...packingRow]; suma[5] = 99;
  const p = analizar([packingHeaders, incompleta, suma]);
  assert.equal(p.resumen.total, 2); assert.equal(p.resumen.conErrores, 2);
  assert.match(p.problemas[0].errores.join(), /STYLE/);
  assert.match(p.problemas[1].errores.join(), /BOXES/);
});
