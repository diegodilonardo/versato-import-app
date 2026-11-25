const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
function crear(opciones={}){
 const archivo=opciones.archivo||path.join(__dirname,'../../data/precios-coeficientes.json');
 const anterior=opciones.anterior||path.join(__dirname,'../../data/precios-vigencias.json');
 const sqlActivo=opciones.sqlActivo||(()=>require('./sqlServer').habilitada());
 const documentos=()=>opciones.documentos||require('./documentosAppSQL');
 async function local(ruta,defecto){try{return JSON.parse((await fs.readFile(ruta,'utf8')).replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT')return defecto;throw e;}}
 function validar(c){if(!c||!Array.isArray(c.historial))throw Object.assign(Error('El historial de coeficientes guardado no es válido.'),{status:422});return c;}
 const inicializar=async()=>validar(await local(archivo,{revision:null,historial:[],decimales:2}));
 async function leer(){return validar(sqlActivo()?await documentos().leer('precios-coeficientes',inicializar):await inicializar());}
 async function cambiar(revision,transformar){
  const aplicar=actual=>{validar(actual);if(revision!==actual.revision)throw Object.assign(Error('El historial cambió. Recargá antes de guardar.'),{status:409});return validar(transformar(actual));};
  if(sqlActivo())return documentos().cambiar('precios-coeficientes',inicializar,aplicar);
  const nueva=aplicar(await inicializar()),tmp=archivo+'.'+randomUUID()+'.tmp';await fs.mkdir(path.dirname(archivo),{recursive:true});
  try{await fs.writeFile(tmp,JSON.stringify(nueva),{flag:'wx'});await fs.rename(tmp,archivo);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}return nueva;
 }
 async function leerAnterior(){const inicio=()=>local(anterior,{historial:[]});return sqlActivo()?documentos().leer('precios-vigencias-anteriores',inicio):inicio();}
 return {leer,cambiar,leerAnterior};
}
module.exports=crear();module.exports.crear=crear;
