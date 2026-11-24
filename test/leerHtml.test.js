const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectarArchivo } = require('../src/services/detectarArchivo');
const { vistaPreviaOtros } = require('../src/services/vistaPreviaOtros');
const { vistaPrevia } = require('../src/services/vistaPrevia');
const { leerLibro } = require('../src/services/leerLibro');
const tabla = (rows) => '<table>' + rows.map((r, i) => '<tr>' + r.map(v => `<${i ? 'td' : 'th'}>${v}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>';
const headers = ['Descrição Marca', 'Lin/Ref', 'Cabedal', 'Cor', 'Numeração Ext.', 'Ean13', 'Qtd. Pares'];
const row = ['VIZZANO', '001.02', '003', '004', '36/37', '7900294899270', '3'];
for (const encoding of ['utf8', 'latin1', 'utf16le']) test(`HTML ${encoding}: tablas múltiples, acentos, identificadores y cantidades`, () => {
  const html = ' \uFEFF<html><head><script>throw new Error("No ejecutar");</script></head><body>' + tabla([['Resumen'], ['Factura']]) + tabla([headers, row, row]) + '</body></html>';
  const buffer = Buffer.from(encoding === 'latin1' ? html.replace('\uFEFF', '') : encoding === 'utf16le' ? '\uFEFF' + html : html, encoding);
  const d = detectarArchivo(buffer);
  assert.equal(d.tipo, 'EAN'); assert.equal(d.hoja, 'Sheet2');
  const p = vistaPreviaOtros(buffer, d);
  assert.equal(p.resumen.total, 2); assert.equal(p.resumen.conErrores, 0);
  assert.equal(p.filas[0].datos.STYLE, '001.02'); assert.equal(p.filas[0].datos.CABEDAL, '003');
  assert.equal(p.agrupacion.grupos[0].PARES, 6);
});
test('HTML con BOM después de espacios: Códigos conserva filas, listas de cantidades y fórmulas como texto', () => {
  const h = ['Caja Master','Linha','Referência','Cabedal','Cor','Tamanho Externo','Quantidade Grade','Total Pares','Lojas','Invoice','Código de Barra Versato','Código De Barras'];
  const data = ['001','5500','103','9569','15745','36 37','2 3','5','10771','7623/2025','5500.103.9569.15745.1','=1+1'];
  const b = Buffer.from(' \uFEFF' + tabla([h, data]));
  const d = detectarArchivo(b); const p = vistaPrevia(b, d);
  assert.equal(d.tipo, 'CODIGOS_BARRA'); assert.equal(p.resumen.validos, 1);
  assert.equal(p.filas[0].datos.CAJA_MASTER, '001'); assert.equal(p.filas[0].datos.CODIGO_CAJA, '=1+1');
});
test('HTML: lee más de 100 filas y aplica límite de vista previa', () => {
  const b = Buffer.from(tabla([headers, ...Array.from({length: 150}, () => row)]));
  const p = vistaPreviaOtros(b, detectarArchivo(b));
  assert.equal(p.resumen.total, 150); assert.equal(p.filas.length, 20);
});
test('No confunde texto, CSV ni una página sin tablas con Excel', () => {
  for (const s of ['a,b,c', '<html><p>Sin datos</p></html>', '<html><script>"<table><td>falso</td></table>"</script></html>']) {
    assert.throws(() => leerLibro(Buffer.from(s)), /contenido/);
  }
});
