const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const saved=new Map(),fotosGuardadas=new Map();let writes=0,reservas=0,fail=false;
const mock=(name,exports)=>{const id=require.resolve('../src/services/'+name);require.cache[id]={id,filename:id,loaded:true,exports};};
const master={disponible:true};
for(const [module,fn]of [['actualizarMaestro','actualizarMaestro'],['modelos','actualizarModelos'],['marcas','actualizarMarcas'],['rubrosFact','actualizarRubrosFact']])mock(module,{[fn]:async()=>master});
mock('sqlServer',{habilitada:()=>true});
mock('cruzarArchivos',{cruzarArchivos:()=>{const r={estado:'COMPLETO',productos:{listado:[{PRODUCTO:'1122.828.7286.15745'}]},archivos:[],resumen:{}};Object.defineProperty(r,'datosPersistencia',{value:['filas originales']});return r;}});
mock('sueltos',{actualizarSueltos:async()=>master,generarSueltos:()=>({}),completarSueltos:()=>{},prepararSueltos:()=>({listos:0})});
mock('exportarPresea',{prepararPresea:()=>({listos:0})});
mock('productosPresea',{prepararProductosPresea:()=>({filas:[],total:0})});
mock('relacionesDBI',{prepararRelacionesDBI:()=>({modulos:0,componentes:0})});
mock('adicionalesDBI',{prepararAdicionalesDBI:()=>({})});
mock('enviarFTP',{estadoEnvioFTP:()=>({disponible:false})});
mock('repositorioSQL',{reservarModulos:async(p,m,tx)=>{assert.equal(tx,'transaccion');reservas++;},crearRepositorioSQL:()=>({
 fotosDisponibles:async()=>[],
 verificarDuplicados:async()=>{},
 guardar:async(r,files,{preparar,imagenes})=>{assert.equal(files.length,3);assert.deepEqual(r.datosPersistencia,['filas originales']);if(fail)throw new Error('fallo simulado');await new Promise(resolve=>setTimeout(resolve,20));r.analisis={id:require('crypto').randomUUID(),persistente:true};await preparar('transaccion');writes++;saved.set(r.analisis.id,r);fotosGuardadas.set(r.analisis.id,imagenes);return r.analisis;},
 imagen:async(id,producto)=>fotosGuardadas.get(id)?.find(f=>f.PRODUCTO===producto),
 obtener:async id=>saved.get(id),listar:async()=>[...saved.values()]
})});
mock('clientesSQL',{guardarLocal:async()=>{}});const app=require('../src/app');
test('Analizar no guarda ni reserva; aceptación explícita única, origen y reintentos',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
 const preview=async()=>{const form=new FormData();form.append('imagenes',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64')]),'1122-828-7286-15745.png');for(let i=0;i<3;i++)form.append('archivos',new Blob(['test']),'test'+i+'.xls');const response=await fetch(base+'/api/importaciones/cruzar',{method:'POST',body:form});assert.equal(response.status,200);return response.json();};
 const r=await preview();assert.equal(r.analisis.confirmado,false);assert.equal(r.analisis.persistente,false);assert.equal(writes,0);assert.equal(reservas,0);assert.equal(r.imagenes.resumen.conFoto,1);
 const fotoResponse=await fetch(base+'/api/importaciones/vistas-previas/'+r.analisis.id+'/imagenes/1122.828.7286.15745');assert.equal(fotoResponse.status,200);assert.equal(fotoResponse.headers.get('content-type'),'image/png');assert.equal(fotoResponse.headers.get('x-content-type-options'),'nosniff');
 const download=await fetch(base+'/api/importaciones/analisis/'+r.analisis.id+'/presea-completo');assert.equal(download.status,410);
 const url=base+'/api/importaciones/vistas-previas/'+r.analisis.id+'/aceptar';
 assert.equal((await fetch(url,{method:'POST',headers:{Origin:'http://otro-sitio.test'}})).status,403);assert.equal(writes,0);
 const responses=await Promise.all([fetch(url,{method:'POST'}),fetch(url,{method:'POST'})]);const results=await Promise.all(responses.map(r=>r.json()));assert.equal(results[0].analisis.id,results[1].analisis.id);assert.equal(results[0].analisis.confirmado,true);assert.equal(writes,1);assert.equal(reservas,1);
 const persistida=await fetch(base+'/api/importaciones/analisis/'+results[0].analisis.id+'/imagenes/1122.828.7286.15745');assert.equal(persistida.status,200);assert.deepEqual(Buffer.from(await persistida.arrayBuffer()),Buffer.from(await fotoResponse.arrayBuffer()));
 await fetch(url,{method:'POST'});assert.equal(writes,1);
 const retry=await preview();fail=true;const retryUrl=base+'/api/importaciones/vistas-previas/'+retry.analisis.id+'/aceptar';assert.equal((await fetch(retryUrl,{method:'POST'})).status,500);assert.equal(writes,1);fail=false;assert.equal((await fetch(retryUrl,{method:'POST'})).status,200);assert.equal(writes,2);
 assert.equal((await fetch(base+'/api/importaciones/vistas-previas/no-existe/aceptar',{method:'POST'})).status,410);
 }finally{await new Promise(r=>server.close(r));}
});
