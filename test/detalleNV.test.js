const test=require('node:test'),assert=require('node:assert/strict');const {filas}=require('../public/detalleNV');
test('detalle NV cruza modelo y color por código y alfa y mantiene cantidades y textos originales',()=>{
 const r={notasVenta:{clientes:[{cliente:'001',filas:[{CODIGO:'10',COD_ALFA:'001ALFA',MARCA:'VIZZANO',CANTIDAD:2,DOMI_ENTRE:'999'}]}]},comex:{masterData:{filas:[{codigo_interno:'10',cod_alfa:'001ALFA',cod_mod:'1122-806-7286',color:'NEGRO'},{codigo_interno:'20',cod_alfa:'OTRO',cod_mod:'OTRO',color:'BLANCO'}]}}};
 assert.deepEqual(filas(r,'001'),[{marca:'VIZZANO',modelo:'1122-806-7286',color:'NEGRO',codAlfa:'001ALFA',cantidad:2}]);assert.deepEqual(filas(r,'002'),[]);
});
test('sin COMEX usa la asignación exacta del producto; si no hay detalle no inventa color',()=>{
 const r={notasVenta:{clientes:[{cliente:'001',filas:[{CODIGO:'10',COD_ALFA:'A',MARCA:'VIZZANO',CANTIDAD:1}]}]},productos:{asignaciones:[{CODIGO:'10',COD_ALFA:'A',PRODUCTO:'1122.806.7286.15745'}],listado:[{PRODUCTO:'1122.806.7286.15745',colores:['NEGRO']}]}};
 assert.equal(filas(r,'001')[0].color,'NEGRO');assert.equal(filas(r,'001')[0].modelo,'1122-806-7286');r.productos.listado[0].colores.push('ROJO');assert.equal(filas(r,'001')[0].color,'');
});
