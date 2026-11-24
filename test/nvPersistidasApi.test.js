const {test}=require('node:test'),assert=require('node:assert/strict');
const mock=(name,exports)=>{const id=require.resolve('../src/services/'+name);require.cache[id]={id,filename:id,loaded:true,exports};};
let ftp=0;mock('actualizarMaestro',{actualizarMaestro:async()=>{ftp++;return {disponible:false};}});
const correo=require('../src/services/correoFactura');mock('correoFactura',{...correo,actualizarClientes:async()=>{ftp++;return {disponible:false};}});
mock('sqlServer',{habilitada:()=>true});
const nv={preparado:'2026-10-28T15:00:00Z',fecha:'20261028',revision:'r1',correccionesOrigen:'[]',clientes:[{cliente:'7',domicilios:['7','7-1'],requiereDomicilio:true,bloqueada:true,errores:['Elegí un domicilio de entrega del maestro para este cliente.'],filas:[{CLIENTE:'7',DOMI_ENTRE:'',FECHA:'20261028',FECHA_ENT:'20261028'}]}]};
const resultado={notasVenta:nv};let revision=1;
mock('repositorioSQL',{crearRepositorioSQL:()=>({obtener:async()=>structuredClone(resultado),datosNV:async()=>({}),guardarNV:async(id,f)=>{const r=await f(structuredClone(resultado));if(r.revision!==resultado.notasVenta.revision||JSON.stringify(r)!==JSON.stringify(resultado.notasVenta)){r.revision='r'+(++revision);resultado.notasVenta=r;}return r;}})});
const app=require('../src/app');
test('NV guardadas se recuperan sin FTP, fechas se conservan, domicilio persiste y revisiones viejas se rechazan',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/importaciones/analisis/guardado/nv';
 try{
  const a=await fetch(base+'/preparar',{method:'POST'});assert.equal(a.status,200);assert.equal((await a.json()).revision,'r1');assert.equal(ftp,0);
  const guardar=await fetch(base+'/7/domicilio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:'r1',domicilio:'7-1'})});assert.equal(guardar.status,200);const guardada=await guardar.json();assert.equal(guardada.clientes[0].filas[0].DOMI_ENTRE,'7-1');assert.equal(guardada.clientes[0].filas[0].FECHA,'20261028');
  const cambio=await fetch(base+'/7/domicilio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:guardada.revision,domicilio:'7'})});assert.equal(cambio.status,409);assert.equal(resultado.notasVenta.clientes[0].domicilioElegido,'7-1');
  const b=await fetch(base+'/preparar',{method:'POST'});assert.equal((await b.json()).clientes[0].domicilioElegido,'7-1');assert.equal(ftp,0);
  const viejo=await fetch(base+'/7/domicilio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:'r1',domicilio:'7'})});assert.equal(viejo.status,409);
  const lista=await fetch(base+'/actualizar',{method:'POST'});assert.equal(lista.status,200);assert.equal(ftp,0);assert.equal((await lista.json()).revision,resultado.notasVenta.revision);
  resultado.notasVenta.clientes[0].bloqueada=true;
  const fallida=await fetch(base+'/actualizar',{method:'POST'});assert.equal(fallida.status,422);assert.equal(resultado.notasVenta.clientes[0].domicilioElegido,'7-1');
 }finally{await new Promise(r=>server.close(r));}
});
