const path=require('node:path');
const {actualizarMaestro}=require('./actualizarMaestro');
const {clasificarModulo}=require('./clasificarModulo');
const marcaClave=s=>String(s||'').trim().toUpperCase();
function parsearModelos(texto){
 const indice=new Map();let registros=0;
 for(const [i,l]of texto.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
  if(!l.trim())continue;const campos=l.split('|').map(s=>s.trim());
  if(campos.length!==2||!/^([A-Z]+)(\d+)$/.test(campos[0])||!campos[1])throw new Error(`Maestro de modelos: fila ${i+1} inválida.`);
  const [codigo,marca]=campos,k=marcaClave(marca);if(indice.has(k)&&indice.get(k)!==codigo)throw new Error('Marca duplicada con distinto último MODC.');
  indice.set(k,codigo);registros++;
 }
 return {indice,registros};
}
function actualizarModelos(){return actualizarMaestro({remoto:process.env.MAESTRO_MODELOS_FTP_PATH||'/PRODUCTOS/MAESTROS_VERSATO/Maestro_Modelos.TXT',destino:path.join(__dirname,'../../data/Maestro_Modelos.TXT'),parsear:parsearModelos});}
function construirCodAlfa(modc,sizeRun,anio,{rubro=1,tipo=8}={}){
 if(!modc||!String(sizeRun??'').trim()||!/^\d{2}$/.test(anio))return null;
 if(!['1','3'].includes(String(rubro))||!['4','7','8'].includes(String(tipo)))return null;
 const base=`${anio}1${rubro}${String(modc).trim()}${tipo}${String(sizeRun).trim()}`;
 return base.length>=12&&base.length<=15?base.padEnd(15,'0'):null;
}
function proponerModulos(productos,maestro,modelos,fecha=new Date()){
 const anioGeneracion=new Intl.DateTimeFormat('en',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric'}).format(fecha).slice(-2);
 const partes=new Intl.DateTimeFormat('en',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(fecha);
 const parte=tipo=>partes.find(p=>p.type===tipo).value;
 const fechaAlta=`${parte('year')}-${parte('month')}-${parte('day')}`;
 const usados=new Set(),alfasExistentes=new Set();
 const claveAlfa=c=>String(c||'').trim().toUpperCase();
 if(maestro?.disponible)for(const filas of maestro.indice.values())for(const r of filas){if(r.MODC)usados.add(r.MODC);if(r.COD_ALFA)alfasExistentes.add(claveAlfa(r.COD_ALFA));}
 const contadores=new Map();const filas=[];
 for(const a of productos.asignaciones){
  if(a.coincidencia!=='NO_ENCONTRADO')continue;
  const p=productos.listado.find(p=>p.PRODUCTO===a.PRODUCTO);
  const marca=p?.marcas.length===1?p.marcas[0]:null;
  const ultimo=marca&&modelos?.disponible?modelos.indice.get(marcaClave(marca)):null;
  let MODC=null,estado='PENDIENTE_MODELO';
  if(ultimo){const m=/^([A-Z]+)(\d+)$/.exec(ultimo);let n=contadores.get(marcaClave(marca))??Number(m[2]);let propuesto;
   do{n++;propuesto=m[1]+String(n).padStart(m[2].length,'0');}while(usados.has(propuesto)&&n<10**m[2].length);
   if(n<10**m[2].length){MODC=propuesto;usados.add(MODC);contadores.set(marcaClave(marca),n);estado='MODC_PROPUESTO';}
  }
  const clasificacion=clasificarModulo(marca,p?.descripciones||[]);
  const COD_ALFA=construirCodAlfa(MODC,a.SIZE_RUN,anioGeneracion,{rubro:clasificacion.RUBROS,tipo:clasificacion.CLASIFIC});
  const errorCodAlfa=MODC&&!COD_ALFA?'La base de COD_ALFA debe tener de 12 a 15 caracteres según la regla Access.':null;
  if(errorCodAlfa)estado='REVISAR_COD_ALFA';
  const DMODC=p?.STYLE&&p?.MATERIAL?`${p.STYLE.replaceAll('.','-')}-${p.MATERIAL}`:null;
  filas.push({PRODUCTO:a.PRODUCTO,SIZE_RUN:a.SIZE_RUN,AA:a.AA,COD_ALFAB1:a.claveBuscada,DMARCA:marca,...clasificacion,DMODC,FECHA_ALTA:fechaAlta,SEXO:'FEM',ultimoMODC:ultimo||null,MODC,CODIGO:null,COD_ALFA,ANIO_COD_ALFA:anioGeneracion,errorCodAlfa,estado});
 }
 const porAlfa=new Map();
 for(const r of filas)if(r.COD_ALFA){const k=claveAlfa(r.COD_ALFA);if(!porAlfa.has(k))porAlfa.set(k,[]);porAlfa.get(k).push(r);}
 for(const [k,grupo]of porAlfa){
  const motivos=[];
  if(alfasExistentes.has(k))motivos.push('COD_ALFA ya existe en el maestro de productos.');
  if(grupo.length>1)motivos.push(`COD_ALFA repetido en ${grupo.length} módulos propuestos.`);
  if(motivos.length)for(const r of grupo){r.errorCodAlfa=motivos.join(' ');r.estado='REVISAR_COD_ALFA';}
 }
 productos.modulos={filas,resumen:{total:filas.length,conMODC:filas.filter(r=>r.MODC).length,conCodAlfa:filas.filter(r=>r.COD_ALFA&&!r.errorCodAlfa).length,pendientes:filas.filter(r=>!r.MODC||!r.COD_ALFA||r.errorCodAlfa).length},generado:fecha.toISOString(),maestro:{disponible:!!modelos?.disponible,actualizado:modelos?.actualizado||null,huella:modelos?.huella||null},nota:'MODC propuesto desde el último utilizado por marca, uno por código Versato del archivo no encontrado. COD_ALFA = año de generación + temporada 1 + rubro (1 calzado / 3 accesorios) + MODC + tipo (4 infantil / 8 mujer) + SIZE_RUN, completado con ceros a la derecha a 15 caracteres para bases de 12 a 15. Se rechazan códigos repetidos dentro de la propuesta o existentes en el maestro; quedan pendientes de revisión. Se usa la fecha de Buenos Aires y se conserva al exportar el análisis. El año de identidad del módulo sigue siendo el de factura. No reserva ni modifica el maestro ni Presea; CODIGO lo asignará Presea.'};
 return productos;
}
module.exports={parsearModelos,actualizarModelos,proponerModulos,construirCodAlfa};
