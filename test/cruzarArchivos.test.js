const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { comparar, cruzarArchivos } = require('../src/services/cruzarArchivos');
function previews() {
  return {
    PACKING_LIST: { registros: [{ fila: 36, datos: { STYLE: '001.02', MATERIAL_CODE: '03', COLOR_CODE: '04', BOXES: '2', TALLE: '36/37', CANTIDAD: '3' }, errores: [] }] },
    CODIGOS_BARRA: { registros: [2, 3].map(fila => ({ fila, datos: { LINHA: '001', REFERENCIA: '02', CABEDAL: '03', COR: '04', TALLE: '36/37', CANTIDAD: '3' }, errores: [] })) },
    EAN: { registros: [{ fila: 2, datos: { STYLE: '001.02', CABEDAL: '03', COR: '04', TALLE: '36/37', EAN: '7900294899270' }, paresNumericos: 6, errores: [] }] }
  };
}
test('Cruce conserva identificadores y rangos de talle, suma cajas y cantidades', () => {
  const r = comparar(previews());
  assert.equal(r.estado, 'COMPLETO'); assert.equal(r.resumen.coinciden, 1);
  assert.deepEqual(r.resumen.pares, { PACKING_LIST: 6, CODIGOS_BARRA: 6, EAN: 6 });
  assert.deepEqual(r.filas[0].filas.CODIGOS_BARRA, [2, 3]);
});
test('Diferencias de cantidad y EAN ausentes se informan', () => {
  const p = previews(); p.EAN.registros[0].paresNumericos = 5;
  assert.equal(comparar(p).resumen.revisar, 1);
  p.EAN.registros = [];
  assert.equal(comparar(p).resumen.sinEan, 1);
});
test('Cruce parcial excluye filas inválidas y cantidades EAN ausentes', () => {
  const p = previews(); p.PACKING_LIST.registros[0].errores.push('Cantidad inválida');
  p.EAN.registros[0].paresNumericos = null;
  const r = comparar(p);
  assert.equal(r.estado, 'PARCIAL'); assert.equal(r.omitidas.length, 2);
  assert.equal(r.filas[0].PACKING_LIST, null);
});
test('No adivina ceros de códigos ni divide talles combinados', () => {
  const p = previews(); p.EAN.registros[0].datos.STYLE = '1.02';
  assert.equal(comparar(p).resumen.combinaciones, 2);
});
test('Debe recibir tres archivos distintos de los tipos esperados', () => {
  assert.throws(() => cruzarArchivos([]), /tres/);
  const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([['STYLE', 'MATERIAL CODE', 'COLOR CODE', 'SIZE RUN']]), 'Hoja');
  const file = { originalname: 'cualquiera.xlsx', buffer: XLSX.write(w, { type: 'buffer', bookType: 'xlsx' }) };
  assert.throws(() => cruzarArchivos([file, file, file]), /dos archivos/);
});
test('EAN sin movimiento no genera faltantes; cero frente a movimiento sí genera diferencias', () => {
  const p = previews();
  p.EAN.registros.push({ fila: 99, datos: { ...p.EAN.registros[0].datos, TALLE: '34' }, paresNumericos: 0, errores: [] });
  const r = comparar(p);
  assert.equal(r.resumen.coinciden, 1); assert.equal(r.resumen.revisar, 0);
  assert.equal(r.sinMovimiento.length, 1); assert.deepEqual(r.sinMovimiento[0].filas.EAN, [99]);
  p.EAN.registros[0].paresNumericos = 0;
  const distinto = comparar(p);
  assert.equal(distinto.resumen.revisar, 1); assert.equal(distinto.filas[0].EAN, 0);
});
