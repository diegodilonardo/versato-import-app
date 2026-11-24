const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function repositorio(){
 const documentos=new Map();let rollback=0;
 class Transaction{async begin(){}async commit(){}async rollback(){rollback++;}}
 class Request{constructor(){this.valores={};}input(k,t,v){this.valores[k]=v;return this;}async query(q){const {clave,contenido}=this.valores;if(q.startsWith('SELECT'))return{recordset:documentos.has(clave)?[{Contenido:documentos.get(clave)}]:[]};documentos.set(clave,contenido);return{rowsAffected:[1]};}}
 const api={sql:{Transaction,Request,ISOLATION_LEVEL:{SERIALIZABLE:1},VarChar:()=>0,NVarChar:()=>0,MAX:1},conectar:async()=>({})};
 const contexto={require:()=>api,module:{exports:{}},Error,JSON};vm.runInNewContext(fs.readFileSync('src/services/documentosAppSQL.js','utf8'),contexto);
 return {...contexto.module.exports,documentos,reversiones:()=>rollback};
}
test('SQL importa una sola vez y una restauración prevalece sobre el archivo local',async()=>{
 const r=repositorio();await r.leer('vistas-stock',()=>[{nombre:'Vista anterior',revision:'a'}]);
 const leido=await r.leer('vistas-stock',()=>{throw Error('El archivo local no existe después de restaurar');});assert.equal(leido[0].nombre,'Vista anterior');
 await r.cambiar('vistas-stock',()=>[],v=>[...v,{nombre:'Vista servidor'}]);assert.equal((await r.leer('vistas-stock',()=>[])).length,2);
});
test('SQL conserva revisiones y no guarda una edición fallida',async()=>{
 const r=repositorio();await r.leer('vistas-stock',()=>[{revision:'actual'}]);await assert.rejects(r.cambiar('vistas-stock',()=>[],()=>{throw Error('Revisión obsoleta');}));assert.equal((await r.leer('vistas-stock',()=>[]))[0].revision,'actual');assert.equal(r.reversiones(),1);
});
test('el maestro recuperado de SQL conserva ceros, domicilios y nombres ambiguos',()=>{
 const analizar=require('../src/services/clientesSQL').analizar;
 const contenido=Buffer.from('00123|Cliente Uno|01|Calle 1\n00123|Cliente Uno|02|Calle 2\n00456|Nombre A||Direccion\n00456|Nombre B||Direccion').toString('base64');
 const r=analizar({contenido,fecha:'2026-11-24T12:00:00Z'});assert.equal(r.maestro.indice.get('00123'),'Cliente Uno');assert.equal(r.maestro.detalleDomicilios.get('00123').length,2);assert.deepEqual(r.maestro.ambiguos,['00456']);
});
