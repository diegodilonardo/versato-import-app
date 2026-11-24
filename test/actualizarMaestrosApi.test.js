const {test}=require('node:test'),assert=require('node:assert/strict');
const mock=(name,exports)=>{const id=require.resolve('../src/services/'+name);require.cache[id]={id,filename:id,loaded:true,exports};};
let clientesDisponible=true,disponible=true,guardados=0,reservas=0,preparaciones=0;
const maestro={disponible:true};
for(const [mod,fn]of [['actualizarMaestro','actualizarMaestro'],['modelos','actualizarModelos'],['marcas','actualizarMarcas'],['rubrosFact','actualizarRubrosFact'],['sueltos','actualizarSueltos']])mock(mod,{[fn]:async()=>({...maestro,disponible})});
const correo=require('../src/services/correoFactura');mock('correoFactura',{...correo,actualizarClientes:async()=>({disponible:clientesDisponible})});
mock('sqlServer',{habilitada:()=>true});
mock('prepararResultado',{prepararResultado:r=>{preparaciones++;r.exportacionProductosPresea={total:0};}});
const anterior={analisis:{id:'guardado',persistente:true},archivos:[{archivo:'original.xls'}],productos:{sueltos:{filas:[{estado:'NUEVO'}]}}};
mock('refrescarAnalisis',{recalcularAnalisis:(r,files)=>{assert.equal(r,anterior);assert.equal(files[0].originalname,'original.xls');return {...r,productos:{sueltos:{filas:[{estado:'ENCONTRADO'}]}}};}});
mock('repositorioSQL',{reservarModulos:async(p,m,tx)=>{assert.equal(tx,'transaccion');reservas++;},crearRepositorioSQL:()=>({obtener:async id=>id==='guardado'?anterior:null,actualizarMaestros:async(id,preparar)=>{const r=await preparar(anterior,[{originalname:'original.xls'}],'transaccion');assert.equal(r.productos.sueltos.filas[0].estado,'ENCONTRADO');guardados++;}})});
const app=require('../src/app');
test('Actualización explícita exige análisis y maestros completos; prepara estados y archivos con reserva transaccional',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/importaciones/analisis/';
 try{
  assert.equal((await fetch(base+'guardado/actualizar-maestros',{method:'POST',headers:{Origin:'http://ajeno.test'}})).status,403);
  assert.equal((await fetch(base+'ausente/actualizar-maestros',{method:'POST'})).status,404);
  disponible=false;assert.equal((await fetch(base+'guardado/actualizar-maestros',{method:'POST'})).status,422);assert.equal(guardados,0);assert.equal(reservas,0);
  disponible=true;assert.equal((await fetch(base+'guardado/actualizar-maestros',{method:'POST'})).status,200);assert.equal(guardados,1);assert.equal(reservas,1);assert.equal(preparaciones,1);
  clientesDisponible=false;const falloClientes=await fetch(base+'guardado/actualizar-maestros',{method:'POST'});assert.equal(falloClientes.status,422);assert.match((await falloClientes.json()).error,/Clientes_Versato\.TXT/);assert.equal(guardados,1);assert.equal(reservas,1);assert.equal(preparaciones,1);
  assert.equal(anterior.productos.sueltos.filas[0].estado,'NUEVO');
 }finally{await new Promise(r=>server.close(r));}
});
