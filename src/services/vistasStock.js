const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const ARCHIVO=path.join(__dirname,'../../data/vistas-stock.json');
const error=(mensaje,status=422)=>Object.assign(new Error(mensaje),{status});
function validarProgramacion(p){
 if(p===undefined)return undefined;
 if(!p||typeof p.activa!=='boolean'||typeof p.soloCambios!=='boolean'||typeof p.destino!=='string'||p.destino.length>1024)throw error('La programación de la vista no es válida.');
 const modo=p.modo??'recurrente';if(!['recurrente','unica','semanal'].includes(modo))throw error('Elegí una modalidad de ejecución válida.');
 let dias=[],hora='';
 if(modo==='semanal'){
  if(!Array.isArray(p.dias)||!p.dias.length||p.dias.some(d=>!Number.isInteger(d)||d<0||d>6)||typeof p.hora!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.hora))throw error('Seleccioná al menos un día de la semana y una hora válida.');
  dias=[...new Set(p.dias)].sort((a,b)=>a-b);hora=p.hora;
 }
 const expresion=modo==='semanal'?`${Number(hora.slice(3))} ${Number(hora.slice(0,2))} * * ${dias.join(',')}`:(p.cron||'*/5 * * * *');
 const cron=require('./cronGrillas').parsear(expresion).texto;
 require('./cronGrillas').siguiente(cron);
 let ejecutarEn=null;
 if(modo==='unica'){
  if(typeof p.ejecutarEn!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.ejecutarEn))throw error('Indicá la fecha y hora de la ejecución única.');
  const fecha=new Date(p.ejecutarEn+'-03:00');
  if(!Number.isFinite(fecha.getTime())||new Date(fecha.getTime()-10800000).toISOString().slice(0,16)!==p.ejecutarEn)throw error('La fecha y hora no son válidas.');
  ejecutarEn=fecha.toISOString();if(p.activa&&fecha.getTime()<=Date.now())throw error('La ejecución única debe tener una fecha y hora futuras.');
 }
 const destino=p.destino.trim();
 if((p.activa&&!destino)||(destino&&(!/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(destino)||/[\x00-\x1f]/.test(destino)||/^\\\\[?.]\\/.test(destino))))throw error('Indicá una carpeta de destino local absoluta o una ruta de red UNC.');
 return {activa:p.activa,modo,dias,hora,ejecutarEn,cron,destino:destino?path.win32.normalize(destino):'',soloCambios:p.soloCambios};
}
function leer(archivo=ARCHIVO){
 try{const datos=JSON.parse(fs.readFileSync(archivo,'utf8'));if(datos.version!==1||!Array.isArray(datos.vistas))throw Error();return datos.vistas;}
 catch(e){if(e.code==='ENOENT')return [];throw error('No se pudieron leer las vistas de stock guardadas.');}
}
function escribir(vistas,archivo){
 fs.mkdirSync(path.dirname(archivo),{recursive:true});const temporal=archivo+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(temporal,JSON.stringify({version:1,vistas},null,2),{flag:'wx'});fs.renameSync(temporal,archivo);}
 finally{fs.rmSync(temporal,{force:true});}
}
function validar(entrada){
 if(!entrada||typeof entrada.nombre!=='string'||!entrada.nombre.trim()||entrada.nombre.trim().length>80)throw error('Indicá un nombre de hasta 80 caracteres para la vista.');
 const c=entrada.configuracion;if(!c||typeof c!=='object')throw error('Falta la configuración de la grilla.');
 const salida={};
 for(const k of ['depositos','marcas','listas']){
  if(!Array.isArray(c[k])||!c[k].length||c[k].length>200||c[k].some(v=>typeof v!=='string'||!v.trim()||v.length>100))throw error('Seleccioná al menos un depósito, una marca y una lista.');
  salida[k]=[...new Set(c[k].map(v=>v.trim()))];
 }
 if(salida.depositos.some(v=>!/^\d+$/.test(v))||salida.listas.some(v=>!['03','04','05','980'].includes(v)))throw error('La selección de depósitos o listas no es válida.');
 if(!['','Módulo','Suelto'].includes(c.tipo)||!['si','no'].includes(c.separar)||typeof(c.buscar??'')!=='string'||(c.buscar||'').length>100)throw error('Los filtros de la vista no son válidos.');
 return {nombre:entrada.nombre.trim(),configuracion:{...salida,tipo:c.tipo,separar:c.separar,buscar:(c.buscar||'').trim()}};
}
function guardar(entrada,archivo=ARCHIVO){
 const vistas=leer(archivo),vista=guardarEnVistas(entrada,vistas);escribir(vistas,archivo);return vista;
}
function guardarEnVistas(entrada,vistas){
 const validada=validar(entrada),id=entrada.id,i=id?vistas.findIndex(v=>v.id===id):-1;
 if(id&&i<0)throw error('La vista ya no existe. Actualizá el listado.',404);
 if(id&&entrada.revision!==vistas[i].revision)throw error('La vista cambió en otra ventana. Volvé a cargarla antes de actualizarla.',409);
 if(vistas.some(v=>v.id!==id&&v.nombre.localeCompare(validada.nombre,'es',{sensitivity:'base'})===0))throw error('Ya hay una vista con ese nombre. Elegí otro nombre o actualizá la vista existente.',409);
 const programacion=validarProgramacion(entrada.programacion)??(i>=0?vistas[i].programacion:undefined)??{activa:false,cron:'*/5 * * * *',destino:'',soloCambios:true};
 if(programacion.activa){
  const nombre=require('./grillaVendedores').nombreGrilla(validada.nombre).toLowerCase();
  if(vistas.some(v=>v.id!==id&&v.programacion?.activa&&path.win32.normalize(v.programacion.destino).toLowerCase()===programacion.destino.toLowerCase()&&require('./grillaVendedores').nombreGrilla(v.nombre).toLowerCase()===nombre))throw error('Otra vista ya publica un archivo con ese nombre en la misma carpeta.');
 }
 const vista={...validada,programacion,id:id||randomUUID(),revision:randomUUID(),actualizada:new Date().toISOString()};
 if(i<0)vistas.push(vista);else vistas[i]=vista;return vista;
}
function eliminar(id,revision,archivo=ARCHIVO){
 const vistas=leer(archivo),v=vistas.find(v=>v.id===id);
 if(!v)throw error('La vista ya no existe.',404);
 if(v.revision!==revision)throw error('La vista cambió en otra ventana. Volvé a cargarla antes de eliminarla.',409);
 escribir(vistas.filter(v=>v.id!==id),archivo);
}
const usarSQL=archivo=>!archivo&&require('./sqlServer').habilitada();
module.exports={validar,validarProgramacion,
 leer:archivo=>usarSQL(archivo)?require('./documentosAppSQL').leer('vistas-stock',()=>leer()):leer(archivo),
 guardar:(entrada,archivo)=>{if(!usarSQL(archivo))return guardar(entrada,archivo);let vista;return require('./documentosAppSQL').cambiar('vistas-stock',()=>leer(),vistas=>{vista=guardarEnVistas(entrada,vistas);return vistas;}).then(()=>vista);},
 eliminar:(id,revision,archivo)=>{if(!usarSQL(archivo))return eliminar(id,revision,archivo);return require('./documentosAppSQL').cambiar('vistas-stock',()=>leer(),vistas=>{const v=vistas.find(v=>v.id===id);if(!v)throw error('La vista ya no existe.',404);if(v.revision!==revision)throw error('La vista cambió en otra ventana. Actualizá el listado.',409);return vistas.filter(v=>v.id!==id);});}
};
