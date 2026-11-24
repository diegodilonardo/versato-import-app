const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generarProductos, producto } = require('../src/services/generarProductos');
test('Producto respeta ceros, agrupa talles y conserva códigos sin inventar maestros', () => {
  assert.equal(producto('001.02', '03', '04'), '001.02.03.04');
  const base = { STYLE: '001.02', MATERIAL: '03', COLOR: '04', PACKING_LIST: 3, CODIGOS_BARRA: 3, EAN: 3, eans: ['7900294899270'], estado: 'COINCIDE', problemas: [], filas: {} };
  const cruce = { filas: [{ ...base, TALLE: '36/37' }, { ...base, TALLE: '38/39' }] };
  const p = generarProductos(cruce, { PACKING_LIST: { registros: [{ errores: [], datos: { STYLE: '001.02', MATERIAL_CODE: '03', COLOR_CODE: '04', SIZE_RUN: '7' } }] }, CODIGOS_BARRA: { registros: [{ errores: [], datos: { LINHA: '001', REFERENCIA: '02', CABEDAL: '03', COR: '04', CODIGO_BARRA: 'archivo.7.26' } }] } });
  assert.equal(p.listado.length, 1); assert.equal(p.talles.length, 2);
  assert.equal(p.listado[0].paresPacking, 6);
  assert.equal(p.listado[0].AA, null); assert.equal(p.listado[0].CODIGO, null);
  assert.equal(p.listado[0].estado, 'PENDIENTE_MAESTRO');
  assert.deepEqual(p.listado[0].codigosVersato, ['archivo.7.26']);
  base.estado = 'REVISAR';
  const revisar = generarProductos({ filas: [{ ...base, TALLE: '36' }] }, { PACKING_LIST: { registros: [] }, CODIGOS_BARRA: { registros: [] } });
  assert.equal(revisar.resumen.revisar, 1);
});
