const {Client}=require('basic-ftp');const {Readable}=require('node:stream');const {randomUUID}=require('node:crypto');
const {prepararProductosPresea,exportarProductosDBI}=require('./productosPresea');const {prepararRelacionesDBI,exportarRelacionesDBI}=require('./relacionesDBI');const {prepararAdicionalesDBI,exportarAdicionalDBI}=require('./adicionalesDBI');
const DESTINO='/ALTAS_PRODUCTOS/VERSATO';let enCurso=false;
function estadoEnvioFTP(r){const productos=prepararProductosPresea(r),relaciones=prepararRelacionesDBI(r),adicionales=prepararAdicionalesDBI(r);const partes=[productos,relaciones,adicionales.modelos,adicionales.stockadi];const incompleto=partes.some(p=>p.bloqueada||p.excluidas.length)||!productos.total||!relaciones.modulos||!adicionales.modelos.total||!adicionales.stockadi.total;return{disponible:!incompleto,destino:DESTINO,mensaje:incompleto?'Para enviar los cinco archivos, el lote debe tener productos, modelos y familias completas, sin registros excluidos.':null};}
function construirLote(r){const estado=estadoEnvioFTP(r);if(!estado.disponible)throw Object.assign(new Error(estado.mensaje),{status:422});return[
 {nombre:'MODELOS_VERSATO.DBI',buffer:exportarAdicionalDBI(r,'modelos')},
 {nombre:'PRODUCTOS_VERSATO.DBI',buffer:exportarProductosDBI(r)},
 {nombre:'PRODUCTOS_VERSATO_STOCKADI.DBI',buffer:exportarAdicionalDBI(r,'stockadi')},
 {nombre:'PRODUCTOS_RELFORMU.DBI',buffer:exportarRelacionesDBI(r,'relformu')},
 {nombre:'PRODUCTOS_RELACION.DBI',buffer:exportarRelacionesDBI(r,'relacion')}];}
async function enviarLoteFTP(resultado,opciones={}){
 if(enCurso)throw Object.assign(new Error('Ya hay un envío al FTP en curso. Esperá a que termine.'),{status:409});
 const env=opciones.env||process.env;if(!env.MAESTRO_FTP_PASSWORD)throw Object.assign(new Error('Falta configurar el acceso FTP.'),{status:422});
 const destino=opciones.destino||DESTINO;
 if(!/^\/[A-Za-z0-9_/-]+$/.test(destino)||destino.includes('//'))throw Object.assign(new Error('Destino FTP no válido.'),{status:422});
 enCurso=true;let client,temporizador;const id=randomUUID(),pendientes=new Set();let archivos=[],publicando=false;
 try{
  // Construir y validar los cinco binarios antes de conectarse; nunca actualizar maestros aquí.
  const lote=(opciones.construir||construirLote)(resultado);if(!lote.length||lote.length!==(opciones.cantidadEsperada??(opciones.individual?1:5)))throw Object.assign(new Error('La cantidad de archivos DBI del lote no es válida.'),{status:422});
  const ruta=a=>a.destino||destino;for(const a of lote)if(a.destino&&!(opciones.destinosPermitidos||[]).includes(a.destino))throw Object.assign(new Error('Destino de archivo no permitido.'),{status:422});
  archivos=lote.map(a=>({nombre:a.nombre,destino:ruta(a),bytes:a.buffer.length,estado:'PENDIENTE'}));client=opciones.client||new Client(20000);
  const transferir=async()=>{
   await client.access({host:env.MAESTRO_FTP_HOST||'200.61.255.29',port:Number(env.MAESTRO_FTP_PORT||21),user:env.MAESTRO_FTP_USER||'ftpvicbor1',password:env.MAESTRO_FTP_PASSWORD,secure:false});for(const carpeta of new Set(lote.map(ruta)))await client.ensureDir(carpeta);
   for(let i=0;i<lote.length;i++){
    const a=lote[i],temporal=ruta(a)+'/.'+a.nombre+'.'+id+'.tmp';pendientes.add(temporal);archivos[i].estado='CARGANDO';
    await client.uploadFrom(Readable.from([a.buffer]),temporal);if(await client.size(temporal)!==a.buffer.length)throw new Error('Tamaño de transferencia incorrecto.');archivos[i].estado='CARGADO';
   }
   publicando=true;
   // STOR reemplaza el contenido conservando el nombre, sin depender de RNTO sobre archivos existentes.
   for(let i=0;i<lote.length;i++){const a=lote[i],rutaFinal=ruta(a)+'/'+a.nombre;archivos[i].estado='PUBLICANDO';await client.uploadFrom(Readable.from([a.buffer]),rutaFinal);if(await client.size(rutaFinal)!==a.buffer.length)throw new Error('Tamaño final incorrecto.');archivos[i].estado='ENVIADO';}
  };
  await Promise.race([transferir(),new Promise((_,rechazar)=>{temporizador=setTimeout(()=>{client.close();rechazar(new Error('Tiempo agotado.'));},120000);temporizador.unref?.();})]);
  return{ok:true,destino,fecha:new Date().toISOString(),archivos,mensaje:opciones.mensajeExito||(opciones.individual?'El archivo se envió correctamente al FTP.':'Los cinco archivos se enviaron correctamente al FTP.')};
 }catch(error){
  if(error.status)throw error;
  const publicados=archivos.filter(a=>a.estado==='ENVIADO').length;
  return{ok:false,destino,fecha:new Date().toISOString(),archivos:archivos.map(a=>({...a,estado:a.estado==='ENVIADO'?'ENVIADO':a.estado==='PUBLICANDO'?'NO_CONFIRMADO':'NO_ENVIADO'})),mensaje:publicando||publicados?'No se pudo confirmar el envío completo. Algunos archivos pueden haberse publicado; revisá el detalle y el FTP antes de reintentar.':'No se pudo completar la carga temporal. Los archivos finales no se publicaron; podés reintentar.'};
 }finally{
  clearTimeout(temporizador);
  if(client){for(const temporal of pendientes)await client.remove(temporal).catch(()=>{});client.close();}
  enCurso=false;
 }
}
module.exports={DESTINO,estadoEnvioFTP,construirLote,enviarLoteFTP};
