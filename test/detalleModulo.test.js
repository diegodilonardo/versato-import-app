const {test}=require('node:test'),assert=require('node:assert/strict');
const {detalleModulo,actualizarDetallesPropuestos}=require('../src/services/detalleModulo');
test('Detalle sin separadores verticales se aplica a propuestas guardadas y conserva los existentes',()=>{
 const modulo={DMODC:'1122-806-7286',DCOLORC:'BEIGE',SIZE_RUN:'99',COD_ALFA:'PROPUESTO',DETALLE:'detalle anterior'};
 assert.equal(detalleModulo(modulo),'1122-806-7286 BEIGE - SZ: 99');
 const r={productos:{modulos:{filas:[modulo]}},comex:{masterData:{filas:[{cod_alfa:'PROPUESTO',descripcion:'anterior'},{cod_alfa:'EXISTENTE',descripcion:'Texto del maestro'}]}}};
 actualizarDetallesPropuestos(r);assert.equal(modulo.DETALLE,'1122-806-7286 BEIGE - SZ: 99');assert.equal(r.comex.masterData.filas[0].descripcion,modulo.DETALLE);assert.equal(r.comex.masterData.filas[1].descripcion,'Texto del maestro');
});
