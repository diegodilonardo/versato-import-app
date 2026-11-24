const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const ejecutar=promisify(execFile);
function verificarAccesoLocal(req,platform=process.platform){
 const direccion=req.socket.remoteAddress;
 const origen=req.headers.origin;
 const url=origen?new URL(origen):null;
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(direccion)||!url||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.host!==req.get('host'))throw Object.assign(new Error('La apertura directa está disponible desde localhost en la PC donde se ejecuta la app. Podés descargar el EML para abrirlo en tu equipo.'),{status:403});
 if(platform!=='win32')throw Object.assign(new Error('La apertura directa requiere Windows. Podés descargar el borrador EML.'),{status:422});
}
async function abrirCorreoLocal(buffer,{lanzar=ejecutar}={}){
 const carpeta=await fs.mkdtemp(path.join(os.tmpdir(),'versato-correo-'));
 const archivo=path.join(carpeta,'Informe-Versato.eml');
 await fs.writeFile(archivo,buffer,{flag:'wx'});
 try{
  await lanzar('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Start-Process -FilePath $env:VERSATO_BORRADOR_EML"],{windowsHide:true,timeout:15000,env:{...process.env,VERSATO_BORRADOR_EML:archivo}});
 }catch(error){throw Object.assign(new Error('No se pudo abrir el correo predeterminado. Verificá la aplicación asociada a los archivos .eml o descargá el borrador.'),{status:422,cause:error});}
}
module.exports={verificarAccesoLocal,abrirCorreoLocal};
