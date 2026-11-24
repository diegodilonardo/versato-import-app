const fs=require('node:fs/promises');
const {createHash}=require('node:crypto');
function analizar(documento){
 const buffer=Buffer.from(documento.contenido,'base64');let texto;
 try{texto=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{texto=new TextDecoder('windows-1252').decode(buffer);}
 return {maestro:require('./correoFactura').parsearClientes(texto),fecha:documento.fecha};
}
async function local(){
 const f=await fs.open(require('./correoFactura').archivoClientes,'r');
 try{const buffer=await f.readFile(),stat=await f.stat();return {contenido:buffer.toString('base64'),fecha:stat.mtime.toISOString(),huella:createHash('sha256').update(buffer).digest('hex')};}finally{await f.close();}
}
async function leer(){
 const d=require('./sqlServer').habilitada()?await require('./documentosAppSQL').leer('maestro-clientes',async()=>{const d=await local();analizar(d);return d;}):await local();
 return analizar(d);
}
async function guardarLocal(){
 if(!require('./sqlServer').habilitada())return;
 const d=await local();if(!analizar(d).maestro.registros)throw Error('El maestro de clientes está vacío.');
 await require('./documentosAppSQL').cambiar('maestro-clientes',()=>d,anterior=>new Date(anterior.fecha)>new Date(d.fecha)?anterior:d);
}
module.exports={leer,guardarLocal,analizar};
