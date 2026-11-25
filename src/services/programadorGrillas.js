const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const cron=require('./cronGrillas');
async function publicar(destino,contenido,vigente){
 try{const carpeta=await fs.stat(destino);if(!carpeta.isDirectory())throw Error('El destino no es una carpeta.');}
 catch(error){if(error.code==='ENOENT')await fs.mkdir(destino,{recursive:true});else throw error;}
 const final=path.join(destino,contenido.nombre),temporal=path.join(destino,'.'+contenido.nombre+'.'+randomUUID()+'.tmp');
 try{const f=await fs.open(temporal,'wx');try{await f.writeFile(contenido.buffer);await f.sync();}finally{await f.close();}
  if(!await vigente())throw Error('La vista cambió durante la generación. Se conservó el archivo anterior.');
  await fs.rename(temporal,final);return final;
 }finally{await fs.rm(temporal,{force:true}).catch(()=>{});}
}
function crear(opciones={}){
 const vistas=opciones.vistas||require('./vistasStock'),stock=opciones.stock||require('./stock'),exportador=opciones.exportador||require('./grillaVendedores');
 const archivo=opciones.archivo||path.join(__dirname,'../../data/grillas-programadas.json');
 const usarSQL=!opciones.archivo&&require('./sqlServer').habilitada();
 const ahora=opciones.ahora||(()=>new Date());
 let estados={},ftp={},timer,ocupado=false,ultimaConsulta=0;const pendientes=new Map();
 async function persistir(){if(usarSQL){await require('./documentosAppSQL').cambiar('grillas-programadas',()=>({}),()=>({estados,ftp}));return;}await fs.mkdir(path.dirname(archivo),{recursive:true});const tmp=archivo+'.tmp';await fs.writeFile(tmp,JSON.stringify({estados,ftp},null,2));await fs.rename(tmp,archivo);}
 async function refrescar(){try{await stock.actualizar();ftp={fecha:ahora().toISOString(),estado:'Actualizado'};}catch(e){ftp={...ftp,estado:'Error',error:e.message};throw e;}finally{ultimaConsulta=ahora().getTime();}}
 function proxima(p,e={}){if(!p?.activa)return null;if(p.modo==='unica')return e.unicaCompletada===p.ejecutarEn?null:p.ejecutarEn;return e.proxima||cron.siguiente(p.cron,ahora());}
 async function estado(){return {ftp,zona:cron.ZONA,vistas:(await vistas.leer()).map(v=>({...estados[v.id],id:v.id,nombre:v.nombre,programacion:v.programacion,proxima:proxima(v.programacion,estados[v.id])}))};}
 async function ejecutar(id,revision){const v=(await vistas.leer()).find(v=>v.id===id);if(!v||v.revision!==revision)throw Object.assign(Error('La vista cambió. Volvé a cargarla.'),{status:409});if(!v.programacion?.destino)throw Object.assign(Error('Guardá primero una carpeta de destino.'),{status:422});pendientes.set(id,revision);return {encolada:true};}
 async function ciclo(){
  if(ocupado)return;ocupado=true;let cerrojo;
  try{
   if(usarSQL){
    const {sql,conectar}=require('./sqlServer');cerrojo=new sql.Transaction(await conectar());await cerrojo.begin();
    const bloqueo=await new sql.Request(cerrojo).query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'versato-programador-grillas',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=0; SELECT @r resultado");
    if(bloqueo.recordset[0].resultado<0)return;
    const d=await require('./documentosAppSQL').leer('grillas-programadas',()=>({}));estados=d.estados||{};
   }
   if(ahora().getTime()-ultimaConsulta>=600000||!ultimaConsulta){try{await refrescar();}catch{}}
   for(const v of await vistas.leer()){
    const p=v.programacion;if(!p?.destino)continue;
    let e=estados[v.id]||{};
    if(e.revision!==v.revision){e={...e,revision:v.revision,proxima:proxima(p,{unicaCompletada:e.unicaCompletada})};estados[v.id]=e;}
    const manual=pendientes.get(v.id)===v.revision;
    const vencida=p.activa&&e.proxima&&Date.parse(e.proxima)<=ahora().getTime();
    if(!manual&&!vencida)continue;
    if(e.reintentar&&Date.parse(e.reintentar)>ahora().getTime())continue;
    e.intento=ahora().toISOString();e.estado='Generando';e.error=null;await persistir();
    try{
     // Cada generación toma una descarga nueva, aunque todavía no hayan pasado diez minutos.
     await refrescar();
     const c=v.configuracion,datos=await stock.generar({...c,depositos:c.depositos.join(','),marcas:c.marcas.join(','),listas:c.listas.join(',')});
     const recursos=[];
     for(const ruta of ['../../scripts/plantilla-grilla.py','../config/plantillas/Grilla Versato Stock - Vendedores.xlsx']){const s=await fs.stat(path.join(__dirname,ruta));recursos.push([s.size,s.mtimeMs]);}
     const fotos=await fs.readdir(path.join(__dirname,'../../data/repositorio-imagenes')).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
     const huella=createHash('sha256').update(JSON.stringify({nombre:v.nombre,destino:p.destino,c,filas:datos.filas,recursos,fotos:fotos.sort()})).digest('hex');
     let existe=false;if(e.archivo)try{await fs.access(e.archivo);existe=true;}catch{}
     if(p.soloCambios&&huella===e.huella&&existe)e.estado='Sin cambios';
     else{const contenido=await exportador.exportar(datos,{...c,nombreVista:v.nombre});
      const vigente=async()=>(await vistas.leer()).some(a=>a.id===v.id&&a.revision===v.revision);
      e.archivo=await publicar(p.destino,contenido,vigente);e.huella=huella;e.bytes=contenido.buffer.length;e.publicada=ahora().toISOString();e.estado='Publicada';}
     e.error=null;e.reintentar=null;pendientes.delete(v.id);
     if(p.modo==='unica'&&vencida){e.unicaCompletada=p.ejecutarEn;e.estado=e.estado==='Sin cambios'?'Completada · sin cambios':'Completada';}
     e.proxima=p.modo==='unica'?proxima(p,e):(p.activa?cron.siguiente(p.cron,ahora()):null);
    }catch(error){e.estado='Error';e.error=['EPERM','EACCES'].includes(error.code)?'Sin permisos para publicar en '+p.destino+'. Revisá la cuenta del servicio ProcesosVersatoFC y sus permisos de modificación en la carpeta compartida. Detalle: '+error.message:error.message;e.reintentar=new Date(ahora().getTime()+60000).toISOString();}
    e.historial=[{fecha:e.intento,estado:e.estado,error:e.error},...(e.historial||[])].slice(0,20);await persistir();
   }
   await persistir();
  }finally{if(cerrojo)await cerrojo.rollback().catch(()=>{});ocupado=false;}
 }
 async function iniciar(){try{const d=usarSQL?await require('./documentosAppSQL').leer('grillas-programadas',async()=>{try{return JSON.parse(await fs.readFile(archivo,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}):JSON.parse(await fs.readFile(archivo,'utf8'));estados=d.estados||{};}catch(e){if(e.code!=='ENOENT'){console.error('No se pudo recuperar el estado del programador de grillas:',e.message);return;}}timer=setInterval(()=>ciclo().catch(e=>console.error('Programador de grillas:',e.message)),15000);timer.unref();ciclo().catch(e=>console.error('Programador de grillas:',e.message));}
 return {iniciar,detener:()=>clearInterval(timer),estado,ejecutar,ciclo};
}
module.exports=crear();module.exports.crear=crear;module.exports.publicar=publicar;
