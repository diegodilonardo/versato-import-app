const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { exportarCruce } = require('../src/services/exportarCruce');
test('Excel completo: todas las filas, números tipados, identificadores de texto, vacíos y trazabilidad', () => {
  const filas = Array.from({ length: 150 }, (_, i) => ({ STYLE: '001.02', MATERIAL: '03', COLOR: '04', TALLE: String(i),
    PACKING_LIST: 3, CODIGOS_BARRA: 3, EAN: i ? 3 : null, eans: i ? ['0123456789012'] : [], estado: i ? 'COINCIDE' : 'REVISAR', problemas: i ? [] : ['Sin EAN'], filas: { PACKING_LIST: [36 + i], CODIGOS_BARRA: [3 + i], EAN: i ? [2 + i] : [] } }));
  const r = { estado: 'PARCIAL', facturas: ['4814/2026'], resumen: { combinaciones: 150, coinciden: 149, revisar: 1, sinEan: 1, filasExcluidas: 1, pares: { PACKING_LIST: 450, CODIGOS_BARRA: 450, EAN: 447 } }, archivos: [], notas: ['nota'], filas, omitidas: [{ tipo: 'EAN', fila: 999, motivos: ['Error'] }] };
  const wb = XLSX.read(exportarCruce(r), { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['Resumen', 'Cruce completo', 'Diferencias', 'Filas excluidas', 'Origen de filas']);
  const ws = wb.Sheets['Cruce completo'];
  assert.equal(XLSX.utils.decode_range(ws['!ref']).e.r, 150);
  assert.equal(ws.A2.v, '001.02'); assert.equal(ws.A2.t, 's');
  assert.equal(ws.E2.t, 'n'); assert.equal(ws.E2.v, 3);
  assert.equal(ws.G2, undefined); assert.equal(ws.H3.v, '0123456789012');
  assert.equal(ws.L2, undefined); assert.equal(ws.L3.v, 0);
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Diferencias).length, 1);
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Origen de filas']).length, 449);
  assert.equal(wb.Sheets['Filas excluidas'].B2.v, 999);
});
