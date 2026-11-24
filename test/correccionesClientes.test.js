const {test}=require('node:test'),assert=require('node:assert/strict');
const {aplicarCorreccionesClientes,prepararCorreccion}=require('../src/services/correccionesClientes');
const {prepararInforme,predeterminadosCorreo}=require('../src/services/correoFactura');
const previews={PACKING_LIST:{registros:[{datos:{STYLE:'1.2',MATERIAL_CODE:'3',COLOR_CODE:'4',SHOP:'131600',MARCA:'VIZZANO',BOXES:'1',PAIRS:'12'},errores:[]}]},CODIGOS_BARRA:{registros:[{datos:{LINHA:'1',REFERENCIA:'2',CABEDAL:'3',COR:'4',LOJAS:'131600',PARES:'12'},errores:[]}]}};
const maestro={disponible:true,huella:'v1',indice:new Map([['001','CLIENTE UNO'],['002','CLIENTE DOS']]),ambiguos:[]};
const resultado={facturas:['8814/2025'],estado:'COMPLETO',resumen:{revisar:0}};
const entrada={anterior:'131600',nuevo:'001',motivo:'Cliente incorrecto en origen',version:0,huellaMaestro:'v1'};
test('Corrige ambas fuentes sin modificar originales; el correo pasa de stock a clientes con los mismos totales',()=>{
 const original=JSON.stringify(previews),cambio=prepararCorreccion(resultado,previews,maestro,entrada);
 assert.equal(cambio.cajasPacking,1);assert.equal(cambio.paresPacking,12);assert.equal(cambio.nombreNuevo,'CLIENTE UNO');
 const efectivos=aplicarCorreccionesClientes(previews,[cambio]);assert.equal(JSON.stringify(previews),original);
 assert.equal(efectivos.PACKING_LIST.registros[0].datos.SHOP,'001');assert.equal(efectivos.CODIGOS_BARRA.registros[0].datos.LOJAS,'001');
 const informe=prepararInforme(resultado,efectivos,maestro);assert.equal(informe.bloqueada,false);assert.deepEqual(informe.total,{cajas:1,pares:12});assert.equal(informe.clientes[0].nombre,'CLIENTE UNO');assert.equal(predeterminadosCorreo(informe).deposito,'105');
});
test('Reaplica correcciones desde los originales al refrescar; conserva el historial previo sin duplicarlo',()=>{
 const uno=prepararCorreccion(resultado,previews,maestro,entrada);
 const dos=prepararCorreccion({...resultado,correccionesClientes:[uno]},previews,maestro,{...entrada,anterior:'001',nuevo:'002',version:1});
 const r=aplicarCorreccionesClientes(previews,[uno,dos]);assert.equal(r.PACKING_LIST.registros[0].datos.SHOP,'002');assert.equal(r.CODIGOS_BARRA.registros[0].datos.LOJAS,'002');assert.equal(previews.PACKING_LIST.registros[0].datos.SHOP,'131600');
});
test('Bloquea revisiones obsoletas, destino desconocido o ambiguo y motivos vacíos',()=>{
 for(const datos of [{...entrada,version:1},{...entrada,huellaMaestro:'anterior'},{...entrada,nuevo:'999'},{...entrada,motivo:''},{...entrada,nuevo:'131600'}])assert.throws(()=>prepararCorreccion(resultado,previews,maestro,datos));
 assert.throws(()=>prepararCorreccion(resultado,previews,{...maestro,ambiguos:['001']},entrada),{status:422});
 assert.throws(()=>prepararCorreccion(resultado,previews,{...maestro,disponible:false},entrada),{status:422});
});
test('permite cambiar cliente desde una NV pendiente con versión vigente',()=>{
 const p=structuredClone(previews);p.PACKING_LIST.registros[0].datos.SHOP='001';p.CODIGOS_BARRA.registros[0].datos.LOJAS='001';
 const r={...resultado,notasVenta:{revision:'nv1',clientes:[{cliente:'001',requiereDomicilio:true}]}};
 const e={...entrada,anterior:'001',nuevo:'002',desdeNV:true,revisionNV:'nv1'};
 const cambio=prepararCorreccion(r,p,maestro,e);assert.equal(cambio.anterior,'001');assert.equal(cambio.nuevo,'002');assert.equal(cambio.cajasPacking,1);assert.throws(()=>prepararCorreccion(r,p,maestro,{...e,revisionNV:'vieja'}),{status:409});
});
test('bloquea reasignación de NV con domicilio fijado, destino generado o importada',()=>{
 const p=structuredClone(previews);p.PACKING_LIST.registros[0].datos.SHOP='001';p.CODIGOS_BARRA.registros[0].datos.LOJAS='001';const e={...entrada,anterior:'001',nuevo:'002',desdeNV:true,revisionNV:'nv1'};
 for(const r of [
 {...resultado,notasVenta:{revision:'nv1',clientes:[{cliente:'001',requiereDomicilio:false}]}},
 {...resultado,notasVenta:{revision:'nv1',clientes:[{cliente:'001',requiereDomicilio:true},{cliente:'002',requiereDomicilio:false}]}},
 {...resultado,notasVenta:{revision:'nv1',clientes:[{cliente:'001',requiereDomicilio:true}]},controlNVPresea:{filas:[{cliente:'001',importadas:1}]}}
 ])assert.throws(()=>prepararCorreccion(r,p,maestro,e),{status:409});
});
