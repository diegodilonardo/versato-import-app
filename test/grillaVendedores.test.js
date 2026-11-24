const test=require('node:test'),assert=require('node:assert/strict');
const {prepararFilas}=require('../src/services/grillaVendedores');
test('grilla comercial suma depósitos por identidad sin mezclar códigos distintos',()=>{
 const r={marca:'VIZZANO',codigo:'123',alfa:'ALFA',modelo:'1122-806-7286',codigoColor:'15745',color:'NEGRO',curva:'35:1',tipo:'Módulo',paresUnidad:1,precios:{'03':100},cantidad:2,deposito:'7',nombreDeposito:'MODULOS'};
 const datos={filas:[r,{...r,deposito:'203',cantidad:3},{...r,codigo:'456',alfa:'OTRO',cantidad:4}]};
 const sumado=prepararFilas(datos,false);
 assert.equal(sumado.length,2);assert.equal(sumado.find(f=>f.codigo==='123').cantidad,5);
 assert.equal(sumado[0].productoFoto,'1122.806.7286.15745');
 assert.equal(prepararFilas(datos,true).length,3);
});
