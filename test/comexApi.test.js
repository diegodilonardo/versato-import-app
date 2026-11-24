const {test}=require('node:test'),assert=require('node:assert/strict');let lecturasFTP=0,guardados=0,binarios=0;
const mock=(name,exports)=>{const id=require.resolve('../src/services/'+name);require.cache[id]={id,filename:id,loaded:true,exports};};
const resultado={facturas:['8814/2025'],analisis:{id:'guardado',confirmado:true},comex:{pedidos:{nombre:'SALIDA PEDIDOS APP COMEX.XLSX',total:1,bloqueada:false,columnas:['numero_factura'],filas:[{cod_alfa:'2511V0000181000',po:'8814/2025',price:12,quantity:1}]},masterData:{nombre:'SALIDA MASTER DATA APP COMEX.XLSX',total:1,bloqueada:false,columnas:['numero_factura'],filas:[{cod_alfa:'2511V0000181000',po:'8814/2025',price:12,quantity:1}]}}};
mock('sqlServer',{habilitada:()=>true});mock('actualizarMaestro',{actualizarMaestro:async()=>{lecturasFTP++;return{disponible:true};}});
mock('repositorioSQL',{crearRepositorioSQL:()=>({obtener:async id=>id==='guardado'?resultado:null,archivo:async(id,nombre)=>{binarios++;assert.equal(id,'guardado');assert.equal(nombre,'SALIDA PEDIDOS APP COMEX.XLSX');return Buffer.from('archivo guardado');},actualizarCOMEX:async(id,maestro)=>{assert.equal(id,'guardado');assert.equal(maestro.disponible,true);guardados++;}})});
const app=require('../src/app');
test('API COMEX: solo guardados, archivo conservado, bloqueo de errores y actualización explícita',async()=>{const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/importaciones/analisis/';try{
 let r=await fetch(base+'guardado/comex/pedidos');assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/8814-2025/);const wb=require('xlsx').read(Buffer.from(await r.arrayBuffer()),{type:'buffer'});const rows=require('xlsx').utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});assert.equal(rows[0].includes('numero_factura'),false);assert.equal(binarios,0);assert.equal(lecturasFTP,0);assert.equal(guardados,0);
 assert.equal((await fetch(base+'vista-previa/comex/pedidos')).status,410);assert.equal((await fetch(base+'guardado/comex/no-valido')).status,400);
 resultado.comex.pedidos.bloqueada=true;assert.equal((await fetch(base+'guardado/comex/pedidos')).status,422);assert.equal(binarios,0);resultado.comex.pedidos.bloqueada=false;
 assert.equal((await fetch(base+'guardado/comex/preparar',{method:'POST',headers:{Origin:'http://ajeno.test'}})).status,403);assert.equal(guardados,0);assert.equal(lecturasFTP,0);
 assert.equal((await fetch(base+'no-existe/comex/preparar',{method:'POST'})).status,404);assert.equal(lecturasFTP,0);
 assert.equal((await fetch(base+'guardado/comex/preparar',{method:'POST'})).status,200);assert.equal(guardados,1);assert.equal(lecturasFTP,1);
 }finally{await new Promise(r=>server.close(r));}});
