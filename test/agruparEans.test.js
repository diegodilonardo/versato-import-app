const { test } = require('node:test');
const assert = require('node:assert/strict');
const { agruparEans } = require('../src/services/agruparEans');
function fila(n, cambios = {}, pares = 3) {
  return { fila: n, datos: { MARCA: 'Marca', STYLE: '001.10', CABEDAL: '02', COR: '03', TALLE: '36/37', EAN: '7900294899270', ...cambios }, paresNumericos: pares, errores: [], advertencias: [] };
}
test('Agrupa y suma sin perder trazabilidad ni ceros de identificadores', () => {
  const a = agruparEans([fila(2), fila(4, {}, 7)]);
  assert.equal(a.grupos[0].PARES, 10);
  assert.equal(a.grupos[0].STYLE, '001.10');
  assert.deepEqual(a.grupos[0].filasOrigen, [2, 4]);
  assert.equal(a.resumen.repeticionesConsolidadas, 1);
});
test('Mismo EAN con distinto talle: todas las filas excluidas por conflicto', () => {
  const rows = [fila(2), fila(3, { TALLE: '38/39' })];
  const a = agruparEans(rows);
  assert.equal(a.conflictos[0].tipo, 'EAN_EN_VARIOS_PRODUCTOS');
  assert.equal(a.grupos.length, 0); assert.equal(a.resumen.filasExcluidas, 2);
  assert.ok(rows.every(r => r.errores.length));
});
test('Mismo producto y talle con varios EAN: conflicto de asignación', () => {
  const a = agruparEans([fila(2), fila(3, { EAN: '7900294899294' })]);
  assert.equal(a.conflictos[0].tipo, 'PRODUCTO_CON_VARIOS_EAN');
  assert.equal(a.resumen.filasExcluidas, 2);
});
test('Errores previos excluidos y cantidades ausentes no se convierten en cero', () => {
  const mal = fila(4); mal.errores.push('Error previo');
  const a = agruparEans([fila(2), fila(3, {}, null), mal]);
  assert.equal(a.grupos[0].PARES, null); assert.equal(a.grupos[0].paresConocidos, 3);
  assert.equal(a.resumen.pares, null); assert.equal(a.resumen.filasExcluidas, 1);
});
test('Marcas discrepantes se conservan y advierten; cero es cantidad conocida', () => {
  const rows = [fila(2, {}, 0), fila(3, { MARCA: 'Otra' }, 0)];
  const a = agruparEans(rows);
  assert.deepEqual(a.grupos[0].MARCAS, ['Marca', 'Otra']);
  assert.equal(a.grupos[0].PARES, 0); assert.ok(rows.every(r => r.advertencias.length));
});
