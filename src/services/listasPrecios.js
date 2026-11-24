const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),XLSX=require('xlsx');
const {leerLibro}=require('./leerLibro'),{validarConfiguracion,calcularPrecios}=require('./formulasPrecios');
const DATA=path.join(__dirname,'../../data'),CATALOGO=path.join(DATA,'precios-consolidado.json'),CONFIG=path.join(DATA,'precios-coeficientes.json');
const texto=v=>String(v??'').trim(),normalizar=v=>texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const identificador=v=>{const s=texto(v);return /^\d+$/.test(s)?s:null;};
function extraerLibro(buffer,nombre){
 const libro=leerLibro(buffer),filas=[],omitidas=[],errores=[];
 for(const hoja of libro.SheetNames){const ws=libro.Sheets[hoja],rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:true});let h=-1,cols;
  for(let i=0;i<Math.min(rows.length,100);i++){const norm=rows[i].map(normalizar),c={linha:norm.indexOf('LINHA'),ref:norm.indexOf('REF'),cab:norm.indexOf('CAB'),fob:norm.findIndex(v=>['FOBU','FOBUS','FOBUSD','FOB'].includes(v))};if(Object.values(c).every(n=>n>=0)){h=i;cols=c;break;}}
  if(h<0){omitidas.push({archivo:nombre,hoja,motivo:'Sin encabezados de lista FOB. Las listas de público/mayorista no se mezclan con FOB.'});continue;}
  const marca=texto(h>0?rows[h-1]?.[0]:hoja)||hoja;
  for(let i=h+1;i<rows.length;i++){const r=rows[i];if(r.every(v=>v==null||texto(v)===''))continue;if(normalizar(r[cols.linha])==='LINHA')continue;
   const partes=[r[cols.linha],r[cols.ref],r[cols.cab]].map(identificador),v=r[cols.fob],fob=typeof v==='number'?v:/^\d+(?:[.,]\d+)?$/.test(texto(v))?Number(texto(v).replace(',','.')):NaN;
   if(partes.some(v=>v==null)||!Number.isFinite(fob)||fob<=0){errores.push({archivo:nombre,hoja,fila:i+1,motivo:'Modelo o FOB vacío, no numérico o no positivo.'});continue;}
   filas.push({modelo:partes.join('.'),marca,foB:fob,origen:{archivo:nombre,hoja,fila:i+1}});
  }
 }
 return {filas,omitidas,errores};
}
function agruparFOB(registros){const grupos=new Map();for(const r of registros){let g=grupos.get(r.modelo);if(!g){g={modelo:r.modelo,marcas:[],fobMaximo:r.foB,apariciones:0,origenes:[],valores:new Map()};grupos.set(r.modelo,g);}g.apariciones++;if(!g.valores.has(r.foB))g.valores.set(r.foB,{fob:r.foB,apariciones:0,listas:new Set()});const f=g.valores.get(r.foB);f.apariciones++;f.listas.add(r.origen.archivo);if(!g.marcas.includes(r.marca))g.marcas.push(r.marca);if(r.foB>g.fobMaximo){g.fobMaximo=r.foB;g.origenes=[];}if(r.foB===g.fobMaximo)g.origenes.push(r.origen);}return [...grupos.values()].map(({valores,...g})=>({...g,fobsAnalizados:[...valores.values()].sort((a,b)=>b.fob-a.fob).map(f=>({fob:f.fob,apariciones:f.apariciones,listas:f.listas.size}))})).sort((a,b)=>a.modelo.localeCompare(b.modelo,'es',{numeric:true}));}
async function leerJSON(archivo){try{return JSON.parse(await fs.readFile(archivo,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function guardarJSON(archivo,datos){await fs.mkdir(path.dirname(archivo),{recursive:true});const tmp=archivo+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(datos));await fs.rename(tmp,archivo);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}}
function usarCatalogoSQL(opciones) {
 return !opciones.catalogo && !opciones.carpeta && require('./sqlServer').habilitada();
}
async function leerCatalogo(opciones = {}) {
 if (!usarCatalogoSQL(opciones)) return leerJSON(opciones.catalogo || CATALOGO);
 const repositorio = require('./consolidadoFOBSQL');
 const catalogo = await repositorio.leerConsolidado();
 if (catalogo) return catalogo;
 const anterior = await leerJSON(CATALOGO);
 if (!anterior?.filas?.length) return null;
 await repositorio.guardarConsolidado(anterior, true);
 return repositorio.leerConsolidado();
}
async function guardarCatalogo(opciones, catalogo) {
 if (usarCatalogoSQL(opciones)) return require('./consolidadoFOBSQL').guardarConsolidado(catalogo);
 return guardarJSON(opciones.catalogo || CATALOGO, catalogo);
}
let procesando=false;
function fechaLista(nombre){const m=String(nombre).match(/_(\d{2})_(\d{2})_(\d{2})(?:\.(?:xls|xlsx|xlsm))?$/i);if(!m)return null;const fecha='20'+m[3]+'-'+m[2]+'-'+m[1];return require('./coeficientesPrecios').fechaValida(fecha)?fecha:null;}
async function fuentesDisponibles(carpeta=process.env.PRECIOS_DIR||path.join(__dirname,'../../precios')) {
 const [archivos, metadatos] = await Promise.all([fs.readdir(carpeta).catch(e=>{if(e.code==='ENOENT')return [];throw e;}), leerJSON(path.join(carpeta, '.listas-fob.json'))]);
 return archivos.filter(nombre => /\.(xlsx|xls|xlsm)$/i.test(nombre) && !nombre.startsWith('~$')).map(nombre => {
  const ficha = metadatos?.[nombre];
  return { nombre, etiqueta: ficha?.etiqueta || '', fechaManual: ficha?.fecha || '', fecha: ficha?.fecha || fechaLista(nombre) };
 }).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')||a.nombre.localeCompare(b.nombre,'es',{numeric:true}));
}
let guardandoFicha = false;
async function guardarFichaFOB(entrada, carpeta=process.env.PRECIOS_DIR||path.join(__dirname,'../../precios')) {
 const { nombre, etiqueta, fecha } = entrada || {};
 if (typeof nombre !== 'string' || typeof etiqueta !== 'string' || etiqueta.trim().length > 120 ||
     typeof fecha !== 'string' || (fecha && !require('./coeficientesPrecios').fechaValida(fecha))) {
  throw Object.assign(new Error('Ingresá un nombre de hasta 120 caracteres y una fecha válida.'), {status:422});
 }
 if (guardandoFicha) throw Object.assign(new Error('Hay otra lista guardándose. Volvé a intentar.'), {status:409});
 guardandoFicha = true;
 try {
  if (!(await fuentesDisponibles(carpeta)).some(f => f.nombre === nombre)) {
   throw Object.assign(new Error('No se encontró el archivo de la lista.'), {status:404});
  }
  const ruta = path.join(carpeta, '.listas-fob.json');
  const metadatos = await leerJSON(ruta) || {};
  await guardarJSON(ruta, { ...metadatos, [nombre]: { etiqueta: etiqueta.trim(), fecha } });
  return fuentesDisponibles(carpeta);
 } finally { guardandoFicha = false; }
}
function seleccionarNombres(disponibles,seleccion){if(seleccion===undefined)return disponibles;if(!Array.isArray(seleccion)||!seleccion.length||seleccion.length>500||seleccion.some(n=>typeof n!=='string'||!disponibles.includes(n)))throw Object.assign(new Error('Seleccioná al menos una lista válida de la carpeta.'),{status:422});return [...new Set(seleccion)].sort();}
async function consolidarInterno(opciones={}){
 const carpeta=opciones.carpeta||process.env.PRECIOS_DIR||path.join(__dirname,'../../precios'),nombres=(await fs.readdir(carpeta)).filter(n=>/\.(xlsx|xls|xlsm)$/i.test(n)&&!n.startsWith('~$')).sort();if(!nombres.length)throw Object.assign(new Error('No hay listas Excel en la carpeta de precios.'),{status:422});
 const seleccion=seleccionarNombres(nombres,opciones.nombres);const registros=[],archivos=[],omitidas=[],errores=[];
 for(const nombre of seleccion){const archivo=path.join(carpeta,nombre),stat=await fs.lstat(archivo);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>60*1024*1024)throw Object.assign(new Error('Archivo no admitido o mayor a 60 MB: '+nombre),{status:422});const buffer=await fs.readFile(archivo),r=extraerLibro(buffer,nombre);registros.push(...r.filas);omitidas.push(...r.omitidas);errores.push(...r.errores);archivos.push({nombre,huella:createHash('sha256').update(buffer).digest('hex'),registros:r.filas.length});}
 if(!registros.length)throw Object.assign(new Error('No se encontraron registros FOB válidos.'),{status:422});
 const catalogo={revision:randomUUID(),preparado:new Date().toISOString(),archivos,omitidas,errores,registros:registros.length,filas:agruparFOB(registros),seleccionFuentes:opciones.nombres||null};if(opciones.guardar!==false)await guardarCatalogo(opciones,catalogo);return catalogo;
}
async function consolidar(opciones={}){if(procesando)throw Object.assign(new Error('Ya hay una actualización de listas en curso.'),{status:409});procesando=true;try{const anterior=await leerCatalogo(opciones);return await consolidarInterno({...opciones,nombres:opciones.nombres??anterior?.seleccionFuentes??undefined});}finally{procesando=false;}}
async function incorporar(files,opciones={}){
 if(procesando)throw Object.assign(new Error('Ya hay una actualización de listas en curso.'),{status:409});
 if(!files?.length)throw Object.assign(new Error('Seleccioná al menos una lista FOB.'),{status:422});
 if(files.reduce((s,f)=>s+f.buffer.length,0)>150*1024*1024)throw Object.assign(new Error('Las listas superan los 150 MB en total.'),{status:422});
 procesando=true;const creados=[];try{
  const carpeta=opciones.carpeta||process.env.PRECIOS_DIR||path.join(__dirname,'../../precios');await fs.mkdir(carpeta,{recursive:true});
  const existentes=new Map(),huellas=new Map();for(const nombre of (await fs.readdir(carpeta)).filter(n=>/\.(xlsx|xls|xlsm)$/i.test(n)&&!n.startsWith('~$'))){const stat=await fs.lstat(path.join(carpeta,nombre));if(!stat.isFile()||stat.isSymbolicLink())continue;const b=await fs.readFile(path.join(carpeta,nombre)),h=createHash('sha256').update(b).digest('hex');existentes.set(nombre.toLowerCase(),h);huellas.set(h,nombre);}
  const nuevos=[],omitidos=[];
  for(const file of files){const nombre=String(file.originalname||'');if(!nombre||nombre!==path.basename(nombre)||/[<>:"/\\|?*\x00-\x1f]/.test(nombre)||! /\.(xlsx|xls|xlsm)$/i.test(nombre))throw Object.assign(new Error('Nombre de archivo no válido.'),{status:422});
   const h=createHash('sha256').update(file.buffer).digest('hex');if(existentes.has(nombre.toLowerCase())&&existentes.get(nombre.toLowerCase())!==h)throw Object.assign(new Error('Ya existe una lista distinta con ese nombre: '+nombre+'. Renombrá la nueva lista antes de incorporarla.'),{status:409});
   if(huellas.has(h)){omitidos.push({archivo:nombre,existente:huellas.get(h),motivo:'Contenido ya incorporado'});continue;}
   const lectura=extraerLibro(file.buffer,nombre);if(!lectura.filas.length||lectura.errores.length)throw Object.assign(new Error('La lista '+nombre+' no tiene registros FOB válidos o contiene '+lectura.errores.length+' filas con problemas. Revisá Linha, Ref., Cab. y FOB U$.'),{status:422});
   nuevos.push({nombre,buffer:file.buffer});existentes.set(nombre.toLowerCase(),h);huellas.set(h,nombre);
  }
  for(const f of nuevos){const destino=path.join(carpeta,f.nombre);const handle=await fs.open(destino,'wx');creados.push(destino);try{await handle.writeFile(f.buffer);}finally{await handle.close();}}
  if(nuevos.length||!await leerCatalogo(opciones))await consolidarInterno({...opciones,nombres:opciones.nombres??(await leerCatalogo(opciones))?.seleccionFuentes??undefined});
  return {incorporados:nuevos.map(f=>f.nombre),omitidos};
 }catch(e){for(const creado of creados)await fs.unlink(creado).catch(()=>{});throw e;}finally{procesando=false;}
}
async function fuentesModelo(modelo,opciones={}){if(!/^\d+\.\d+\.\d+$/.test(modelo||''))throw Object.assign(new Error('Modelo no válido.'),{status:422});const carpeta=opciones.carpeta||process.env.PRECIOS_DIR||path.join(__dirname,'../../precios'),fuentes=await fuentesDisponibles(carpeta),activo=await leerCatalogo(opciones),activas=new Set(activo?.archivos?.map(a=>a.nombre)||[]);const seleccion=opciones.nombres===undefined?[...activas]:seleccionarNombres(fuentes.map(f=>f.nombre),opciones.nombres),incluidas=new Set(seleccion),filas=[];for(const f of fuentes){const archivo=path.join(carpeta,f.nombre),stat=await fs.lstat(archivo);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>60*1024*1024)continue;const lectura=extraerLibro(await fs.readFile(archivo),f.nombre);for(const r of lectura.filas)if(r.modelo===modelo)filas.push({archivo:f.nombre,fecha:f.fecha,hoja:r.origen.hoja,fila:r.origen.fila,fob:r.foB,incluida:incluidas.has(f.nombre),activaNV:activas.has(f.nombre)});}const valores=filas.filter(r=>r.incluida).map(r=>r.fob),maximo=valores.length?Math.max(...valores):null;return {modelo,maximo,filas:filas.map(r=>({...r,aportaMaximo:r.incluida&&r.fob===maximo}))};}
async function configuracion(){return await leerJSON(CONFIG)||{revision:null,historial:[],decimales:2};}
let guardandoVigencia=false;
async function guardarConfiguracion(c){if(!c||typeof c!=='object'||Array.isArray(c))throw Object.assign(new Error('Completá la configuración de la marca.'),{status:422});if(guardandoVigencia)throw Object.assign(new Error('Hay otra configuración guardándose. Volvé a intentar.'),{status:409});guardandoVigencia=true;try{const actual=await configuracion();if(c.revision!==actual.revision)throw Object.assign(new Error('El historial cambió. Recargá antes de guardar.'),{status:409});const catalogo=await leerCatalogo(),marcas=[...new Set((catalogo?.filas||[]).flatMap(r=>r.marcas))];const registro=require('./coeficientesPrecios').agregarVigencia(actual,c,marcas);const previa=[...actual.historial].reverse().find(v=>v.marca===registro.marca&&v.desde===registro.desde);if(previa&&previa.activo!==false&&previa.coeficiente1===registro.coeficiente1&&previa.coeficiente2===registro.coeficiente2&&previa.importe===registro.importe&&(previa.descuentoComercial??0)===registro.descuentoComercial)return actual;registro.id=randomUUID();const nueva={...actual,revision:randomUUID(),decimales:2,historial:[...actual.historial,registro],cambiosEstado:actual.cambiosEstado||[]};await guardarJSON(CONFIG,nueva);return nueva;}finally{guardandoVigencia=false;}}
async function guardarEstadoVigencia(entrada){if(guardandoVigencia)throw Object.assign(new Error('Hay otra configuración guardándose. Volvé a intentar.'),{status:409});guardandoVigencia=true;try{const actual=await configuracion();if(entrada?.revision!==actual.revision)throw Object.assign(new Error('El historial cambió. Recargá antes de modificar.'),{status:409});const nueva=require('./vigenciasPrecios').cambiarEstadoVigencia(actual,entrada);nueva.revision=randomUUID();await guardarJSON(CONFIG,nueva);return nueva;}finally{guardandoVigencia=false;}}
async function estado(fecha=require('./coeficientesPrecios').hoy(),opciones={}){const activo=await leerCatalogo(opciones),catalogo=opciones.nombres?await consolidarInterno({...opciones,guardar:false}):activo,config=await configuracion();if(!require('./coeficientesPrecios').fechaValida(fecha))throw Object.assign(new Error('Elegí una fecha de cálculo válida.'),{status:422});const calculo=catalogo?require('./coeficientesPrecios').calcularVigencias(catalogo.filas,config,fecha):null;const marcas=[...new Set((catalogo?.filas||[]).flatMap(r=>r.marcas))].sort();return {fecha,config,fuentes:opciones.incluirFuentes===false?[]:await fuentesDisponibles(opciones.carpeta),vistaFiltrada:!!opciones.nombres,listasActivas:activo?.archivos?.map(a=>a.nombre)||[],historialAnterior:(await leerJSON(path.join(DATA,'precios-vigencias.json')))?.historial||[],marcas,vigentes:marcas.map(marca=>({marca,configuracion:require('./coeficientesPrecios').vigente(config.historial,marca,fecha)})),catalogo:catalogo?{...catalogo,filas:calculo?.filas||catalogo.filas}:null,erroresCalculo:calculo?.errores||[]};}
async function exportar(fecha,marcasSeleccionadas,listas){const r=await estado(fecha,{nombres:listas});if(marcasSeleccionadas!==undefined){if(!Array.isArray(marcasSeleccionadas)||!marcasSeleccionadas.length||marcasSeleccionadas.some(m=>!r.marcas.includes(m)))throw Object.assign(new Error('Elegí al menos una marca válida para exportar.'),{status:422});if(r.catalogo)r.catalogo.filas=r.catalogo.filas.filter(f=>f.marcas.some(m=>marcasSeleccionadas.includes(m)));const modelos=new Set((r.catalogo?.filas||[]).map(f=>f.modelo));r.erroresCalculo=r.erroresCalculo.filter(e=>modelos.has(e.modelo));}if(!r.catalogo||!r.config.historial.length)throw Object.assign(new Error('Consolidá las listas y guardá las vigencias antes de descargar.'),{status:422});if(r.erroresCalculo.length||r.catalogo.errores.length)throw Object.assign(new Error('Completá las vigencias de todas las marcas y revisá los errores antes de descargar.'),{status:422});return construirExcel(r);}
function construirExcel(r){const libro=XLSX.utils.book_new(),marcas=[...new Set(r.catalogo.filas.map(f=>f.marcas[0]))].sort();
 for(const marca of marcas){const filas=r.catalogo.filas.filter(f=>f.marcas[0]===marca),data=[['MARCA','MODELO','PRECIO_PUBLICO','PRECIO_MAYORISTA'],...filas.map(f=>[marca,f.modelo.replaceAll('.','-'),f.precioPublico,f.precioMayorista])],ws=XLSX.utils.aoa_to_sheet(data);ws['!cols']=[{wch:18},{wch:27},{wch:23},{wch:23}];ws['!autofilter']={ref:ws['!ref']};for(let i=2;i<=filas.length+1;i++)for(const col of ['C','D'])ws[col+i].z=r.config.decimales?'0.'+'0'.repeat(r.config.decimales):'0';const hoja=({'BEIRA RIO':'BEIRA_RIO','BR SPORT':'BR_SPORT','MOLEKINHA':'MOLEKHINA','MOLEKINHO':'MOLEKHINO'})[marca]||marca;XLSX.utils.book_append_sheet(libro,ws,hoja.slice(0,31));}
 return XLSX.write(libro,{type:'buffer',bookType:'xlsx',compression:true});}
module.exports={fuentesModelo,guardarEstadoVigencia,fechaLista,fuentesDisponibles,guardarFichaFOB,seleccionarNombres,consolidarInterno,extraerLibro,agruparFOB,consolidar,incorporar,construirExcel,configuracion,guardarConfiguracion,estado,exportar};
