const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { detectarArchivo } = require('../src/services/detectarArchivo');
const { vistaPrevia } = require('../src/services/vistaPrevia');
const headers = ['Caja Master', 'Linha', 'Referência', 'Cabedal', 'Cor', 'Tamanho Externo', 'Quantidade Grade', 'Total Pares', 'Lojas', 'Invoice', 'Código de Barra Versato', 'Código De Barras'];
const row = [1, '05500', '103', '9569', '15745', '36 37', '2 3', 5, '10771', '4814/2026', 'repetible', 'caja-1'];
function analizar(rows, extension = 'xlsx') {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([['Titulo'], headers, ...rows]), 'Datos');
  const b = XLSX.write(w, { type: 'buffer', bookType: extension });
  return vistaPrevia(b, detectarArchivo(b));
}
for (const extension of ['xls', 'xlsx', 'xlsm']) test(`Vista previa ${extension}: mapeo, texto y lectura más allá de fila 100`, () => {
  const rows = Array.from({ length: 150 }, (_, i) => { const r = [...row]; r[11] = `caja-${i}`; return r; });
  const p = analizar(rows, extension);
  assert.equal(p.resumen.total, 150); assert.equal(p.resumen.validos, 150);
  assert.equal(p.filas.length, 20); assert.equal(p.filas[0].fila, 3);
  assert.equal(p.filas[0].datos.LINHA, '05500');
  assert.equal(p.filas[0].datos.Factura, '4814/2026');
  assert.equal(p.totalProblemas, 0);
});
test('Campos vacíos, cantidades inválidas, discrepancia de talles y suma', () => {
  const vacio = [...row]; vacio[1] = '';
  const cantidad = [...row]; cantidad[6] = '-2 tres';
  const talles = [...row]; talles[5] = '36';
  const suma = [...row]; suma[7] = 6;
  const p = analizar([vacio, cantidad, talles, suma]);
  assert.equal(p.resumen.conErrores, 4);
  assert.match(p.problemas[0].errores.join(), /obligatorio/);
  assert.match(p.problemas[1].errores.join(), /enteros/);
  assert.match(p.problemas[2].errores.join(), /talles/);
  assert.match(p.problemas[3].errores.join(), /suma/);
});
test('Duplicados físicos: advertencia en ambas filas, limitada a factura', () => {
  const otra = [...row]; otra[9] = 'otra';
  const p = analizar([row, row, otra]);
  assert.equal(p.resumen.validos, 3); assert.equal(p.resumen.conAdvertencias, 2);
  assert.equal(p.filas[2].advertencias.length, 0);
});
test('Libro vacío y filas en blanco', () => {
  assert.equal(analizar([]).resumen.total, 0);
  const p = analizar([row, [], row]);
  assert.equal(p.resumen.total, 2); assert.equal(p.resumen.filasVaciasOmitidas, 1);
});
test('Errores después de la vista previa también se validan', () => {
  const rows = Array.from({ length: 21 }, () => [...row]); rows[20][7] = 9;
  const p = analizar(rows);
  assert.equal(p.filas.length, 20); assert.equal(p.resumen.conErrores, 1);
  assert.equal(p.problemas.at(-1).fila, 23);
});
