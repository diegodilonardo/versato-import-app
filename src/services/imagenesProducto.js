const {createHash}=require('node:crypto');
const MAX_FOTO=5*1024*1024,MAX_TOTAL=150*1024*1024;
const error=mensaje=>Object.assign(new Error(mensaje),{status:422});
function productoDelNombre(nombre){
 const m=/^(\d+)-(\d+)-(\d+)-(\d+)\.(jpe?g|png|webp)$/i.exec(nombre);
 return m?m.slice(1,5).join('.'):null;
}
function tipoImagen(buffer){
 if(buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&buffer.toString('ascii',12,16)==='IHDR')return 'image/png';
 if(buffer.length>=12&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255&&buffer.at(-2)===255&&buffer.at(-1)===217)return 'image/jpeg';
 if(buffer.length>=20&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'&&buffer.readUInt32LE(4)+8===buffer.length&&['VP8 ','VP8L','VP8X'].includes(buffer.toString('ascii',12,16)))return 'image/webp';
 return null;
}
function validarFotos(files=[]){
 if(files.length>300)throw error('Seleccioná hasta 300 fotos por análisis.');
 if(files.reduce((n,f)=>n+f.buffer.length,0)>MAX_TOTAL)throw error('Las fotos superan los 150 MB en total.');
 const productos=new Map();
 return files.map(file=>{
  if(file.buffer.length>MAX_FOTO)throw error(file.originalname+': la foto supera los 5 MB.');
  const tipo=tipoImagen(file.buffer),extension=/\.([^.]+)$/.exec(file.originalname)?.[1].toLowerCase();
  if(!tipo||({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'})[extension]!==tipo)throw error(file.originalname+': usá una imagen JPG, PNG o WebP válida.');
  const PRODUCTO=productoDelNombre(file.originalname),huella=createHash('sha256').update(file.buffer).digest('hex');
  if(PRODUCTO&&productos.has(PRODUCTO)&&productos.get(PRODUCTO)!==huella)throw error('Hay fotos diferentes para '+PRODUCTO+'. Seleccioná una sola foto por producto.');
  if(PRODUCTO)productos.set(PRODUCTO,huella);
  return {PRODUCTO,nombre:file.originalname,tipo,bytes:file.buffer.length,huella,buffer:file.buffer};
 });
}
function asociarFotos(resultado,files){
 const productos=new Set((resultado.productos?.listado||[]).map(p=>p.PRODUCTO));
 const fotos=[],noCoincidentes=[],vistos=new Set();let repetidas=0;
 for(const foto of files){
  if(!foto.PRODUCTO||!productos.has(foto.PRODUCTO)){noCoincidentes.push({nombre:foto.nombre,motivo:foto.PRODUCTO?'El producto no está en este análisis.':'El nombre debe tener el formato 1122-828-7286-15745.jpg.'});continue;}
  if(vistos.has(foto.PRODUCTO)){repetidas++;continue;}
  vistos.add(foto.PRODUCTO);fotos.push(foto);
 }
 resultado.imagenes={fotos:fotos.map(({buffer,...meta})=>meta),noCoincidentes,resumen:{cargadas:files.length,conFoto:fotos.length,sinFoto:productos.size-fotos.length,noCoincidentes:noCoincidentes.length,repetidas}};
 return fotos;
}
function reutilizarFotos(resultado,disponibles,nuevas=[]){
 const productos=new Set((resultado.productos?.listado||[]).map(p=>p.PRODUCTO));
 const imagenes=resultado.imagenes||{fotos:[],noCoincidentes:[],resumen:{cargadas:0,noCoincidentes:0,repetidas:0}};
 const todas=new Map(disponibles.filter(f=>productos.has(f.PRODUCTO)).map(f=>[f.PRODUCTO,f]));
 const reutilizadas=todas.size;const guardar=[];let omitidas=0;
 for(const f of nuevas){if(todas.has(f.PRODUCTO)){omitidas++;continue;}const {buffer,...meta}=f;todas.set(f.PRODUCTO,meta);guardar.push(f);}
 imagenes.fotos=[...todas.values()];Object.assign(imagenes.resumen,{conFoto:todas.size,sinFoto:productos.size-todas.size,reutilizadas,omitidasExistentes:omitidas});resultado.imagenes=imagenes;
 return guardar;
}
async function guardarFotos(tx,id,fotos){
 const {sql}=require('./sqlServer');
 for(const f of fotos)await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('producto',sql.NVarChar(254),f.PRODUCTO).input('nombre',sql.NVarChar(260),f.nombre).input('tipo',sql.VarChar(30),f.tipo).input('hash',sql.Char(64),f.huella).input('bytes',sql.Int,f.bytes).input('contenido',sql.VarBinary(sql.MAX),f.buffer).query('INSERT versato.ImagenesProducto(AnalisisId,Producto,Nombre,Tipo,Huella,Bytes,Contenido) VALUES(@id,@producto,@nombre,@tipo,@hash,@bytes,@contenido)');
}
module.exports={productoDelNombre,tipoImagen,validarFotos,asociarFotos,reutilizarFotos,guardarFotos};
