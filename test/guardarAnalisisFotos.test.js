const {test}=require('node:test'),assert=require('node:assert/strict');
const mock=(name,exports)=>{const id=require.resolve('../src/services/'+name);require.cache[id]={id,filename:id,loaded:true,exports};};
let guardadas=[],commit=0;
class Request{constructor() {this.params={};}input(k,t,v){this.params[k]=v;return this;}async query(q){if(q.includes('INSERT versato.ImagenesProducto'))guardadas.push(this.params);return {recordset:[]};}}
class Transaction{async begin(){}async commit(){commit++;}async rollback(){}}
const tipo=()=>{};tipo.MAX=-1;
mock('sqlServer',{sql:{Request,Transaction,NVarChar:tipo,VarChar:tipo,Char:tipo,VarBinary:tipo,UniqueIdentifier:tipo,BigInt:tipo,Int:tipo,Bit:tipo,MAX:-1},conectar:async()=>({})});
const vacio=()=>{throw Object.assign(new Error('Sin registros'),{status:422});};
mock('productosPresea',{exportarProductosDBI:vacio,prepararProductosPresea:()=>({filas:[]})});
mock('adicionalesDBI',{exportarAdicionalDBI:vacio});mock('relacionesDBI',{exportarRelacionesDBI:vacio});mock('comex',{archivosCOMEX:()=>[]});mock('datosArchivosSQL',{guardarDatosArchivos:async()=>{}});
const {crearRepositorioSQL}=require('../src/services/repositorioSQL');
test('guardar conserva las fotos y actualiza detalles sin reemplazar su lista',async()=>{
 for(const conFoto of [false,true]){
 guardadas=[];const r={estado:'COMPLETO',productos:{listado:[{PRODUCTO:'1.2.3.4'}],modulos:{filas:[{DMODC:'1-2-3',DCOLORC:'NEGRO',SIZE_RUN:'1',COD_ALFA:'alfa'}]}}};
 const fotos=conFoto?[{PRODUCTO:'1.2.3.4',nombre:'1-2-3-4.jpg',tipo:'image/jpeg',huella:'a'.repeat(64),bytes:3,buffer:Buffer.from('abc')}]:[];
 await crearRepositorioSQL().guardar(r,[],{imagenes:fotos});
 assert.equal(r.productos.modulos.filas[0].DETALLE,'1-2-3 NEGRO - SZ: 1');assert.equal(guardadas.length,conFoto?1:0);assert.equal(r.imagenes.resumen.conFoto,conFoto?1:0);
 }
 assert.equal(commit,2);
});
