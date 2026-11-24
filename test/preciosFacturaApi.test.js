const test=require('node:test'),assert=require('node:assert/strict');let fallo=false,lectura;
const mock=(n,exports)=>{const id=require.resolve('../src/services/'+n);require.cache[id]={id,filename:id,loaded:true,exports};};
mock('sqlServer',{habilitada:()=>true});mock('listaPreseaSQL',{actualizarCopia:async()=>({})});mock('repositorioSQL',{crearRepositorioSQL:()=>({guardarPreciosNV:async(id,calcular)=>calcular({}),datosNV:async()=>({})})});
mock('listasPrecios',{estado:async(fecha,opciones)=>{lectura=opciones;if(fallo)throw Object.assign(Error('ruta interna no debe mostrarse'),{code:'ENOENT'});return{};}});
mock('actualizarMaestro',{actualizarMaestro:async()=>({disponible:true})});mock('sueltos',{actualizarSueltos:async()=>({disponible:true})});mock('preciosNV',{prepararPreciosNV:()=>({bloqueada:false})});mock('controlPreciosFactura',{controlarPreciosFactura:async()=>({resumen:{iguales:3}})});
const app=require('../src/app');
test('calcular precios usa consolidado sin fuentes locales y comunica la etapa de un fallo',async()=>{
 const servidor=app.listen(0,'127.0.0.1');await new Promise(r=>servidor.once('listening',r));try{const url='http://127.0.0.1:'+servidor.address().port+'/api/importaciones/analisis/prueba/precios-nv/preparar';let r=await fetch(url,{method:'POST'});assert.equal(r.status,200);assert.equal(lectura.incluirFuentes,false);assert.equal((await r.json()).comprobacionMaestro.resumen.iguales,3);
 fallo=true;r=await fetch(url,{method:'POST'});assert.equal(r.status,503);const d=await r.json();assert.match(d.error,/consolidado y los coeficientes/);assert.doesNotMatch(d.error,/ruta interna/);
 }finally{await new Promise(r=>servidor.close(r));}
});
