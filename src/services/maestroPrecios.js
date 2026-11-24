const {Client}=require('basic-ftp'),{Writable}=require('node:stream'),{createHash}=require('node:crypto');
const REMOTO='/PRECIOS/VERSATO/MAESTRO_PRECIOS_VERSATO.TXT';
const clave=(alfa,lista,version)=>JSON.stringify([alfa,String(lista).replace(/^0+(?=\d)/,''),String(version).replace(/^0+(?=\d)/,'')]);
function camposPrecio(linea) {
 if (!linea.trim()) return null;
 const campos = linea.replace(/^\uFEFF/, '').split('|').map(v => v.trim());
 if (campos.length !== 7 || !campos[3] || !/^\d+$/.test(campos[4]) || !/^\d+$/.test(campos[5]) || !/^\d+(?:\.\d+)?$/.test(campos[6])) {
  throw new Error('Formato del maestro de precios inválido.');
 }
 return campos;
}
function crearComparador(precios){
 const buscados=new Map((precios.filas||[]).map(r=>[clave(r.cod_alfa,r.LISTAPRE,r.VERSION),{COD_ALFA:r.cod_alfa,lista:r.LISTAPRE,version:r.VERSION,esperado:r.PRECIO,encontrados:new Set()}]));let registros=0;
 return {linea(linea){if(!linea.trim())return;const c=linea.replace(/^\uFEFF/,'').split('|').map(v=>v.trim());if(c.length!==7||!c[3]||!/^\d+$/.test(c[4])||!/^\d+$/.test(c[5])||!/^\d+(?:\.\d+)?$/.test(c[6]))throw new Error('Formato del maestro de precios inválido.');registros++;const r=buscados.get(clave(c[3],c[4],c[5]));if(r)r.encontrados.add(Number(c[6]));},resultado(){if(!registros)throw new Error('Maestro vacío.');const filas=[...buscados.values()].map(r=>{const valores=[...r.encontrados];return {COD_ALFA:r.COD_ALFA,lista:r.lista,version:r.version,esperado:r.esperado,presea:valores,estado:valores.some(n=>Number.isFinite(n)&&n>0)?'COINCIDE':!valores.length?'NO_ENCONTRADO':'SIN_PRECIO'};});return {registros,filas,valida:!!filas.length&&filas.every(r=>r.estado==='COINCIDE'),resumen:{total:filas.length,coinciden:filas.filter(r=>r.estado==='COINCIDE').length,revisar:filas.filter(r=>r.estado!=='COINCIDE').length}};}};
}
async function verificarMaestroPrecios(precios,opciones={}){
 const env=opciones.env||process.env,client=opciones.client||new Client(20000),hash=createHash('sha256'),comparador=opciones.comparador||crearComparador(precios);let cola='',bytes=0,temporizador;
 const receptor=new Writable({write(chunk,encoding,done){try{bytes+=chunk.length;if(bytes>250*1024*1024)throw new Error('Archivo demasiado grande.');hash.update(chunk);opciones.capturar?.(chunk);cola+=chunk.toString('latin1');let corte;while((corte=cola.indexOf('\n'))>=0){comparador.linea(cola.slice(0,corte));cola=cola.slice(corte+1);}if(cola.length>65536)throw new Error('Línea demasiado larga.');done();}catch(e){done(e);}}});receptor.on('error',()=>{});
 try{if(!env.MAESTRO_FTP_PASSWORD)throw new Error('Acceso FTP no configurado.');const tarea=async()=>{await client.access({host:env.MAESTRO_FTP_HOST,port:Number(env.MAESTRO_FTP_PORT||21),user:env.MAESTRO_FTP_USER,password:env.MAESTRO_FTP_PASSWORD,secure:false});await client.downloadTo(receptor,REMOTO);};await Promise.race([tarea(),new Promise((_,rechazar)=>{temporizador=setTimeout(()=>{client.close();rechazar(new Error('Tiempo agotado.'));},120000);temporizador.unref?.();})]);comparador.linea(cola);return {...comparador.resultado(),disponible:true,fecha:new Date().toISOString(),archivo:REMOTO,huella:hash.digest('hex'),bytes};
 }catch(e){return {disponible:false,valida:false,fecha:new Date().toISOString(),archivo:REMOTO,filas:[],mensaje:'No se pudo descargar o validar MAESTRO_PRECIOS_VERSATO.TXT. Las NV permanecen bloqueadas.'};}finally{clearTimeout(temporizador);client.close();receptor.destroy();}
}
module.exports={REMOTO,camposPrecio,crearComparador,verificarMaestroPrecios};
