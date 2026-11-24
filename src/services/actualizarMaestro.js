const { Client } = require('basic-ftp');
const { Writable } = require('node:stream');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { parsearMaestro } = require('./maestroProductos');
const MAX_BYTES = 50 * 1024 * 1024;
async function actualizarMaestro(opciones = {}) {
  const env = opciones.env || process.env;
  const maxBytes=opciones.maxBytes || MAX_BYTES;
  const remoto = opciones.remoto || env.MAESTRO_FTP_PATH || '/PRODUCTOS/MAESTROS_VERSATO/Maestro_Versato.TXT';
  if (!env.MAESTRO_FTP_PASSWORD) return { disponible:false, origen:'FTP', mensaje:'Falta configurar el acceso FTP. Control de maestro pendiente; no se determinaron productos nuevos.' };
  const client = opciones.client || new Client(20000);
  const destino = opciones.destino || path.join(__dirname, '../../data/Maestro_Versato.TXT');
  const temporal = `${destino}.${randomUUID()}.tmp`;
  const trozos=[]; let bytes=0; let temporizador;
  const receptor=new Writable({write(chunk,encoding,done){bytes+=chunk.length;if(bytes>maxBytes)return done(new Error('Maestro demasiado grande.'));trozos.push(Buffer.from(chunk));done();}});
  // El receptor no ejecuta contenido ni escribe la copia hasta validarla completa.
  receptor.on('error',()=>{});
  try {
    const descargar=async()=>{
      await client.access({host:env.MAESTRO_FTP_HOST || '200.61.255.29',port:Number(env.MAESTRO_FTP_PORT||21),user:env.MAESTRO_FTP_USER||'ftpvicbor1',password:env.MAESTRO_FTP_PASSWORD,secure:false});
      await client.downloadTo(receptor,remoto);
    };
    await Promise.race([descargar(),new Promise((_,reject)=>{temporizador=setTimeout(()=>{client.close();reject(new Error('Tiempo de espera agotado.'));},60000);temporizador.unref?.();})]);
    const buffer=Buffer.concat(trozos);
    let texto;try{texto=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{texto=new TextDecoder('windows-1252').decode(buffer);}
    const maestro=(opciones.parsear || parsearMaestro)(texto);
    if(!maestro.registros)throw new Error('Maestro vacío.');
    await fs.mkdir(path.dirname(destino),{recursive:true});
    await fs.writeFile(temporal,buffer);
    await fs.rename(temporal,destino);
    return {...maestro,disponible:true,origen:'FTP',archivo:path.basename(remoto),rutaRemota:remoto,actualizado:new Date().toISOString(),huella:createHash('sha256').update(buffer).digest('hex')};
  }catch(error){
    // No exponer mensajes del servidor ni credenciales. Nunca recurrir a una copia anterior.
    return {disponible:false,origen:'FTP',mensaje:'No se pudo actualizar el maestro desde el FTP. Se compararon cantidades, pero el control del maestro y la preparación de altas quedan pendientes. Volvé a analizar cuando haya conexión.'};
  }finally{
    clearTimeout(temporizador);client.close();receptor.destroy();
    await fs.rm(temporal,{force:true}).catch(()=>{});
  }
}
module.exports={actualizarMaestro};
