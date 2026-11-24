async function actualizarPreciosNV(id){
 const etapa=async(nombre,operacion)=>{try{return await operacion();}catch(e){if(e.status)throw e;console.error('Control precios NV:',nombre,e.code||e.number||e.name);throw Object.assign(new Error('No se pudo completar el control de precios. Etapa: '+nombre+'. Revisá la configuración y los registros del servicio.'),{status:503,cause:e});}};
 await etapa('actualizar la lista de Presea en SQL',()=>refrescarListaPresea());
 return etapa('guardar el cálculo de la factura en SQL',()=>analisisGuardados.guardarPreciosNV(id,async resultado=>{
  const [precios,modulos,sueltos,previews]=await Promise.all([etapa('leer el consolidado y los coeficientes',()=>require('./services/listasPrecios').estado(undefined,{incluirFuentes:false})),actualizarMaestro(),actualizarSueltos(),analisisGuardados.datosNV(id)]);
  if(!modulos.disponible||!sueltos.disponible)throw Object.assign(new Error('No se pudieron actualizar los maestros de módulos y sueltos. El archivo de precios guardado se conserva.'),{status:422});
  const calculo = require('./services/preciosNV').prepararPreciosNV(resultado,precios,modulos,sueltos,previews);
  if (!calculo.bloqueada) calculo.comprobacionMaestro = await etapa('comparar los precios calculados contra Presea',()=>require('./services/controlPreciosFactura').controlarPreciosFactura(calculo));
  return calculo;
 }));
}
require('./config/entorno');
const express = require('express');
const multer = require('multer');
const path = require('node:path');
const { detectarArchivo } = require('./services/detectarArchivo');
const { vistaPrevia } = require('./services/vistaPrevia');
const { vistaPreviaOtros } = require('./services/vistaPreviaOtros');
const { cruzarArchivos } = require('./services/cruzarArchivos');
const { exportarCruce } = require('./services/exportarCruce');
const { leerFactura } = require('./services/factura');
const { actualizarMaestro } = require('./services/actualizarMaestro');
const { crearAlmacen } = require('./services/analisisGuardados');
const { actualizarModelos } = require('./services/modelos');
const { actualizarMarcas } = require('./services/marcas');
const { actualizarRubrosFact } = require('./services/rubrosFact');
const { prepararPresea,exportarPresea } = require('./services/exportarPresea');
const {actualizarSueltos,generarSueltos,completarSueltos,prepararSueltos,exportarSueltos}=require('./services/sueltos');
const {prepararProductosPresea,exportarProductosDBI}=require('./services/productosPresea');
const {prepararRelacionesDBI,exportarRelacionesDBI}=require('./services/relacionesDBI');
const {prepararAdicionalesDBI,exportarAdicionalDBI}=require('./services/adicionalesDBI');
const {estadoEnvioFTP,enviarLoteFTP}=require('./services/enviarFTP');
const baseSQL=require('./services/sqlServer');
const {crearRepositorioSQL,reservarModulos}=require('./services/repositorioSQL');
const {validarFotos,asociarFotos,reutilizarFotos}=require('./services/imagenesProducto');
const {prepararCOMEX,exportarCOMEX,DEFINICIONES:COMEX}=require('./services/comex');
const memoria=crearAlmacen();
const vistasPrevias=crearAlmacen({max:3,ttl:30*60*1000});
const analisisGuardados=baseSQL.habilitada()?crearRepositorioSQL():{...memoria,archivo:async()=>null,imagen:async()=>null,listar:async()=>[],envios:async()=>[],iniciarEnvio:async()=>null,finalizarEnvio:async()=>{}};
const app = express();
const operacionesFactura = new Map();
const cancelacionesFactura = new Set();
app.use('/api/importaciones/analisis/:id', async (req, res, next) => {
 if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !analisisGuardados.estadoFactura) return next();
 const id = req.params.id.toLowerCase();
 if (cancelacionesFactura.has(id)) return res.status(409).json({ error: 'La factura se está cancelando.' });
 operacionesFactura.set(id, (operacionesFactura.get(id) || 0) + 1);
  let liberada = false;
  const liberar = () => {
   if (liberada) return;
   liberada = true;
   const pendientes = operacionesFactura.get(id) - 1;
   if (pendientes) operacionesFactura.set(id, pendientes);
   else operacionesFactura.delete(id);
  };
  res.once('finish', liberar);
  res.once('close', liberar);
 try {
  if (await analisisGuardados.estadoFactura(id) === 'CANCELADA') {
   return res.status(409).json({ error: 'La factura está cancelada y quedó disponible para consulta.' });
  }
  return next();
 } catch (error) { next(error); }
});
app.post('/api/historial/:id/cancelar', async (req, res, next) => {
 try {
  verificarOrigenCorreo(req);
  if (!analisisGuardados.cancelarFactura) return res.status(503).json({ error: 'La cancelación requiere una factura guardada.' });
  const id = req.params.id.toLowerCase();
  if (operacionesFactura.has(id) || cancelacionesFactura.has(id)) return res.status(409).json({ error: 'Esperá a que termine la operación de la factura antes de cancelarla.' });
  cancelacionesFactura.add(id);
  try { res.set('Cache-Control', 'no-store').json(await analisisGuardados.cancelarFactura(id)); }
  finally { cancelacionesFactura.delete(id); }
 } catch (error) { next(error); }
});
app.disable('x-powered-by');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter(req, file, cb) {
    const valido = /\.(xls|xlsx|xlsm)$/i.test(file.originalname);
    cb(valido ? null : Object.assign(new Error('Seleccioná un archivo .xls, .xlsx o .xlsm.'), { status: 415 }), valido);
  }
});
app.post('/api/importaciones/detectar', upload.single('archivo'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Seleccioná un archivo en el campo archivo.' });
    const resultado = detectarArchivo(req.file.buffer);
    if (resultado.estado === 'DETECTADO' && resultado.tipo === 'CODIGOS_BARRA') {
      resultado.vistaPrevia = vistaPrevia(req.file.buffer, resultado);
    } else if (resultado.estado === 'DETECTADO' && resultado.tipo === 'FACTURA') {
      resultado.vistaPrevia = leerFactura(req.file.buffer, resultado);
    } else if (resultado.estado === 'DETECTADO') {
      resultado.vistaPrevia = vistaPreviaOtros(req.file.buffer, resultado);
    }
    res.set('Cache-Control', 'no-store').json({ archivo: req.file.originalname, ...resultado });
  } catch (error) { next(error); }
});
const uploadCruce = multer({ storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 304, fields: 0, parts: 304 },
  fileFilter(req, file, cb) {
    const valido = file.fieldname==='imagenes' ? /\.(jpe?g|png|webp)$/i.test(file.originalname) : /\.(xls|xlsx|xlsm)$/i.test(file.originalname);
    cb(valido ? null : Object.assign(new Error('Usá Excel para los archivos y JPG, PNG o WebP para las fotos.'), { status: 415 }), valido);
  }
});
app.post('/api/importaciones/cruzar', uploadCruce.fields([{name:'archivos',maxCount:4},{name:'imagenes',maxCount:300}]), async (req, res, next) => {
  try {
    const fotosValidadas=validarFotos(req.files?.imagenes||[]);
    req.files=req.files?.archivos||[];
    if(![3,4].includes(req.files?.length))return res.status(400).json({error:'Seleccioná los tres archivos habituales y la Factura opcional.'});
    if(baseSQL.habilitada())await analisisGuardados.verificarDuplicados(null,req.files);
    const [maestro,modelos,marcas,rubrosFact,maestroSueltos,clientes]=await Promise.all([actualizarMaestro(),actualizarModelos(),actualizarMarcas(),actualizarRubrosFact(),actualizarSueltos(),actualizarClientes()]);
    const resultado=cruzarArchivos(req.files,maestro,modelos,marcas,rubrosFact);
    if(baseSQL.habilitada())await analisisGuardados.verificarDuplicados(resultado,req.files);
    prepararResultado(resultado,{maestro,maestroSueltos,marcas,rubrosFact,clientes});
    const asociadas=asociarFotos(resultado,fotosValidadas);
    const fotos=baseSQL.habilitada()?reutilizarFotos(resultado,await analisisGuardados.fotosDisponibles((resultado.productos?.listado||[]).map(p=>p.PRODUCTO)),asociadas):asociadas;
    Object.defineProperty(resultado,'confirmacion',{value:{files:req.files,fotos,maestro,maestroSueltos,marcas,rubrosFact,clientes,promesa:null}});
    resultado.analisis={...vistasPrevias.guardar(resultado),confirmado:false,persistente:false};
    res.set('Cache-Control','no-store').json(resultado);
  }
  catch (error) { next(error); }
});
const {prepararResultado}=require('./services/prepararResultado');
app.post('/api/importaciones/vistas-previas/:id/aceptar',async(req,res,next)=>{
 try{
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.get('host'))return res.status(403).json({error:'La aceptación debe realizarse desde esta app.'});
  const vista=vistasPrevias.obtener(req.params.id);if(!vista)return res.status(410).json({error:'La vista previa venció. Volvé a analizar los archivos.'});
  if(!baseSQL.habilitada())return res.status(503).json({error:'Configurá la base de datos para aceptar y guardar el análisis.'});
  const contexto=vista.confirmacion;
  if(!contexto.promesa)contexto.promesa=(async()=>{
   const resultado=structuredClone({...vista});
   Object.defineProperty(resultado,'datosPersistencia',{value:vista.datosPersistencia});
   await analisisGuardados.guardar(resultado,contexto.files,{imagenes:contexto.fotos,preparar:async tx=>{
    await reservarModulos(resultado.productos,contexto.maestro,tx);
    prepararResultado(resultado,contexto);
    resultado.analisis.confirmado=true;
   }});
   contexto.files=[];
   return resultado;
  })().catch(error=>{contexto.promesa=null;throw error;});
  res.set('Cache-Control','no-store').json(await contexto.promesa);
 }catch(error){next(error);}
});
const uploadFotos=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:300,fields:0,parts:300},fileFilter(req,file,cb){const valido=/\.(jpe?g|png|webp)$/i.test(file.originalname);cb(valido?null:Object.assign(new Error('Seleccioná fotos JPG, PNG o WebP.'),{status:415}),valido);}});
app.post('/api/importaciones/analisis/:id/imagenes',uploadFotos.array('imagenes',300),async(req,res,next)=>{
 try{if(req.headers.origin&&new URL(req.headers.origin).host!==req.get('host'))return res.status(403).json({error:'Las fotos deben guardarse desde esta app.'});
 if(!baseSQL.habilitada())return res.status(503).json({error:'Las fotos requieren un análisis guardado en la base de datos.'});
 if(!req.files?.length)return res.status(400).json({error:'Seleccioná las fotos para guardar.'});
 const resultado=await analisisGuardados.actualizarFotos(req.params.id,validarFotos(req.files));res.set('Cache-Control','no-store').json(resultado);
 }catch(error){next(error);}
});
function responderFoto(res,foto){
 res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).type(foto.tipo).send(foto.buffer);
}
app.get('/api/importaciones/vistas-previas/:id/imagenes/:producto',async(req,res,next)=>{
 try{
 const vista=vistasPrevias.obtener(req.params.id);if(!vista)return res.status(410).json({error:'La vista previa venció.'});
 const meta=vista.imagenes?.fotos.find(f=>f.PRODUCTO===req.params.producto);
 const foto=meta?.analisisOrigen?await analisisGuardados.imagen(meta.analisisOrigen,req.params.producto):vista.confirmacion.fotos.find(f=>f.PRODUCTO===req.params.producto);if(!foto)return res.status(404).json({error:'No hay foto para ese producto.'});responderFoto(res,foto);
 }catch(error){next(error);}
});
app.get('/api/importaciones/analisis/:id/imagenes/:producto',async(req,res,next)=>{
 try{const foto=await analisisGuardados.imagen(req.params.id,req.params.producto);if(!foto)return res.status(404).json({error:'No hay foto guardada para ese producto.'});responderFoto(res,foto);}catch(error){next(error);}
});
app.get('/api/importaciones/analisis/:id/excel', async(req, res, next)=>{
  try {
    const resultado=await analisisGuardados.obtener(req.params.id);
    if(!resultado)return res.status(410).json({error:'El análisis venció o el servidor se reinició. Volvé a analizar los archivos para descargar el Excel.'});
    const buffer = exportarCruce(resultado);
    res.set({ 'Cache-Control': 'no-store',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cruce-completo.xlsx"' }).send(buffer);
  } catch (error) { next(error); }
});
app.post('/api/importaciones/cruzar/excel',(req,res)=>res.status(409).json({error:'Recargá la página y analizá los archivos. La descarga debe usar el análisis guardado, sin actualizar el maestro.'}));
app.get('/api/importaciones/analisis/:id/presea', async(req,res,next)=>{
 try{const resultado=await analisisGuardados.obtener(req.params.id);if(!resultado)return res.status(410).json({error:'El análisis venció o el servidor se reinició. Volvé a analizar los archivos.'});
  res.set({'Cache-Control':'no-store','Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="modulos-presea.xlsx"'}).send(exportarPresea(resultado));
 }catch(error){next(error);}
});
app.get('/api/importaciones/analisis/:id/sueltos', async(req,res,next)=>{
 try{const resultado=await analisisGuardados.obtener(req.params.id);if(!resultado)return res.status(410).json({error:'El análisis venció o el servidor se reinició. Volvé a analizar los archivos.'});
 res.set({'Cache-Control':'no-store','Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="sueltos-presea.xlsx"'}).send(exportarSueltos(resultado));}catch(error){next(error);}
});
app.get('/', (req, res) => res.redirect('/importaciones'));
app.get('/api/importaciones/analisis/:id/presea-completo', async(req,res,next)=>{
 try{const resultado=await analisisGuardados.obtener(req.params.id);if(!resultado)return res.status(410).json({error:'El análisis venció o el servidor se reinició. Volvé a analizar los archivos.'});
 res.set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="PRODUCTOS_VERSATO.DBI"'}).send(exportarProductosDBI(resultado));}catch(error){next(error);}
});
app.get('/api/importaciones/analisis/:id/dbi/:tipo', async(req,res,next)=>{
 try{const resultado=await analisisGuardados.obtener(req.params.id);if(!resultado)return res.status(410).json({error:'El análisis venció o el servidor se reinició. Volvé a analizar los archivos.'});
 const tipo=req.params.tipo;const nombre={relformu:'PRODUCTOS_RELFORMU.DBI',relacion:'PRODUCTOS_RELACION.DBI',modelos:'MODELOS_VERSATO.DBI',stockadi:'PRODUCTOS_VERSATO_STOCKADI.DBI'}[tipo];if(!['relformu','relacion','modelos','stockadi'].includes(tipo))return res.status(400).json({error:'Tipo DBI no válido.'});
 res.set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${nombre}"`}).send(tipo==='modelos'?exportarAdicionalDBI(resultado,tipo):await analisisGuardados.archivo(req.params.id,nombre)||(['modelos','stockadi'].includes(tipo)?exportarAdicionalDBI(resultado,tipo):exportarRelacionesDBI(resultado,tipo)));}catch(error){next(error);}
});
app.post('/api/importaciones/analisis/:id/enviar-ftp/:archivo',async(req,res,next)=>{
 try{if(req.headers.origin&&new URL(req.headers.origin).host!==req.get('host'))return res.status(403).json({error:'El envío debe iniciarse desde esta app.'});
 const nombre=req.params.archivo,permitidos=['MODELOS_VERSATO.DBI','PRODUCTOS_VERSATO.DBI','PRODUCTOS_VERSATO_STOCKADI.DBI','PRODUCTOS_RELFORMU.DBI','PRODUCTOS_RELACION.DBI'];
 if(!permitidos.includes(nombre))return res.status(400).json({error:'Archivo no válido.'});
 const r=await analisisGuardados.obtener(req.params.id);if(!r||r.analisis?.confirmado===false)return res.status(410).json({error:'Primero aceptá y guardá el análisis.'});
 const buffer=nombre==='PRODUCTOS_VERSATO.DBI'?exportarProductosDBI(r):nombre==='MODELOS_VERSATO.DBI'?exportarAdicionalDBI(r,'modelos'):nombre==='PRODUCTOS_VERSATO_STOCKADI.DBI'?exportarAdicionalDBI(r,'stockadi'):exportarRelacionesDBI(r,nombre==='PRODUCTOS_RELFORMU.DBI'?'relformu':'relacion');
 const id=await analisisGuardados.iniciarEnvio(req.params.id,'/ALTAS_PRODUCTOS/VERSATO');let envio;
 try{envio=await enviarLoteFTP(r,{individual:true,construir:()=>[{nombre,buffer}]});}catch(error){await analisisGuardados.finalizarEnvio(id,{ok:false,mensaje:'No se pudo completar el envío de '+nombre,archivos:[]});throw error;}
 await analisisGuardados.finalizarEnvio(id,envio);res.status(envio.ok?200:502).set('Cache-Control','no-store').json(envio);
 }catch(error){next(error);}
});
app.post('/api/importaciones/analisis/:id/enviar-ftp',async(req,res,next)=>{
 try{if(req.headers.origin&&new URL(req.headers.origin).host!==req.get('host'))return res.status(403).json({error:'El envío debe iniciarse desde esta app.'});
 const resultado=await analisisGuardados.obtener(req.params.id);if(!resultado)return res.status(410).json({error:'El análisis venció o el servidor se reinició. Volvé a analizar los archivos.'});
 const preparacion=estadoEnvioFTP(resultado);if(!preparacion.disponible)return res.status(422).json({error:preparacion.mensaje});
 const envioId=await analisisGuardados.iniciarEnvio(req.params.id,'/ALTAS_PRODUCTOS/VERSATO');let envio;
 try{const lote=await Promise.all(['MODELOS_VERSATO.DBI','PRODUCTOS_VERSATO.DBI','PRODUCTOS_VERSATO_STOCKADI.DBI','PRODUCTOS_RELFORMU.DBI','PRODUCTOS_RELACION.DBI'].map(async nombre=>({nombre,buffer:nombre==='MODELOS_VERSATO.DBI'?exportarAdicionalDBI(resultado,'modelos'):nombre==='PRODUCTOS_VERSATO.DBI'?exportarProductosDBI(resultado):await analisisGuardados.archivo(req.params.id,nombre)})));envio=await enviarLoteFTP(resultado,lote.every(a=>a.buffer)?{construir:()=>lote}:{});}
 catch(error){await analisisGuardados.finalizarEnvio(envioId,{ok:false,mensaje:'El envío no pudo completarse. Revisá el FTP antes de reintentar.',archivos:[]});throw error;}
 await analisisGuardados.finalizarEnvio(envioId,envio);resultado.ultimoEnvioFTP=envio;res.status(envio.ok?200:502).set('Cache-Control','no-store').json(envio);
 }catch(error){next(error);}
});
app.post('/api/importaciones/analisis/:id/actualizar-maestros',async(req,res,next)=>{
 try{verificarOrigenCorreo(req);if(!baseSQL.habilitada())return res.status(503).json({error:'La actualización requiere una factura guardada.'});
 if(!await analisisGuardados.obtener(req.params.id))return res.status(404).json({error:'No se encontró el análisis.'});
 const [maestro,modelos,marcas,rubrosFact,maestroSueltos,clientes]=await Promise.all([actualizarMaestro(),actualizarModelos(),actualizarMarcas(),actualizarRubrosFact(),actualizarSueltos(),actualizarClientes()]);
 const contexto={maestro,modelos,marcas,rubrosFact,maestroSueltos,clientes};
 const faltantes=Object.entries({'Maestro_Versato.TXT':maestro,'Maestro_Modelos.TXT':modelos,'Maestro_Marcas_Versato.TXT':marcas,'Maestro_Rubro_Fa.TXT':rubrosFact,'Maestro_Versato_sueltos.TXT':maestroSueltos,'Clientes_Versato.TXT':clientes}).filter(([,m])=>!m?.disponible).map(([tipo])=>tipo);
 if(faltantes.length)return res.status(422).json({error:'No se pudieron leer o validar estos archivos del FTP: '+faltantes.join(', ')+'. El análisis guardado se conserva sin cambios.'});
 await analisisGuardados.actualizarMaestros(req.params.id,async(anterior,files,tx)=>{
  const r=require('./services/refrescarAnalisis').recalcularAnalisis(anterior,files,contexto);
  await reservarModulos(r.productos,maestro,tx);prepararResultado(r,contexto);r.avisosMaestros=[];return r;
 });res.set('Cache-Control','no-store').json(await analisisGuardados.obtener(req.params.id));
 }catch(error){next(error);}
});
async function prepararNotasVenta(id,actualizar=false){
 if(!baseSQL.habilitada())throw Object.assign(new Error('Guardá la factura en la base de datos antes de generar NV.'),{status:422});
 return analisisGuardados.guardarNV(id,async resultado=>{
  if(resultado.notasVenta&&(!actualizar||!require('./services/nvClientes').requiereRevisionNV(resultado)))return resultado.notasVenta;
  const [previews,productos,clientes]=await Promise.all([analisisGuardados.datosNV(id),actualizarMaestro(),require('./services/correoFactura').actualizarClientes()]);
  if(!productos.disponible||!clientes.disponible){const faltantes=[!productos.disponible?'Maestro_Versato.TXT':null,!clientes.disponible?'Clientes_Versato.TXT':null].filter(Boolean);throw Object.assign(new Error('No se pudieron leer o validar estos maestros del FTP: '+faltantes.join(', ')+'. Las NV guardadas se conservan.'),{status:422});}
  const efectivos=require('./services/correccionesClientes').aplicarCorreccionesClientes(previews,resultado.correccionesClientes);
  const elegidos=Object.fromEntries((resultado.notasVenta?.clientes||[]).filter(c=>Object.hasOwn(c,'domicilioElegido')).map(c=>[c.cliente,c.domicilioElegido]));
  const nv=require('./services/nvClientes').prepararNV(resultado,efectivos,productos,clientes,new Date(),elegidos);
  let cambios=[];try{const previas=JSON.parse(resultado.notasVenta?.correccionesOrigen||'[]');cambios=(resultado.correccionesClientes||[]).slice(previas.length);}catch{cambios=resultado.correccionesClientes||[];}
  const afectados=new Set(cambios.flatMap(c=>[c.anterior,c.nuevo]));
  nv.clientes=nv.clientes.map(c=>{const anterior=resultado.notasVenta?.clientes.find(a=>a.cliente===c.cliente);return anterior&&!anterior.bloqueada&&!afectados.has(c.cliente)?anterior:c;});
  for(const c of nv.clientes)if(Object.hasOwn(elegidos,c.cliente)&&c.domicilios.includes(elegidos[c.cliente]))c.domicilioElegido=elegidos[c.cliente];
  return nv;
 });
}
for(const accion of ['preparar','actualizar'])app.post('/api/importaciones/analisis/:id/nv/'+accion,async(req,res,next)=>{try{verificarOrigenCorreo(req);res.set('Cache-Control','no-store').json(await prepararNotasVenta(req.params.id,accion==='actualizar'));}catch(e){next(e);}});
app.post('/api/importaciones/analisis/:id/nv/:cliente/domicilio',express.json({limit:'4kb'}),async(req,res,next)=>{try{
 verificarOrigenCorreo(req);if(!baseSQL.habilitada())return res.status(422).json({error:'La factura debe estar guardada.'});
 const nv=await analisisGuardados.guardarNV(req.params.id,async resultado=>{
  const anterior=resultado.notasVenta;if(!anterior)throw Object.assign(new Error('Prepará primero las NV.'),{status:422});
  if(req.body?.revision!==anterior.revision)throw Object.assign(new Error('Las NV cambiaron. Volvé a abrir la factura antes de elegir el domicilio.'),{status:409});
  if(anterior.correccionesOrigen!==JSON.stringify(resultado.correccionesClientes||[]))throw Object.assign(new Error('Cambió la asignación de clientes. Actualizá las NV desde maestros.'),{status:409});
  if(resultado.controlNVPresea?.filas?.some(r=>r.cliente===req.params.cliente&&r.importadas>0&&r.numeros?.length))throw Object.assign(new Error('La NV ya existe en Presea. No se permite modificar su domicilio.'),{status:409});
  return require('./services/nvClientes').guardarDomicilio(anterior,req.params.cliente,req.body?.domicilio);
 });res.set('Cache-Control','no-store').json(nv);
}catch(e){next(e);}});
async function enviarNV(req,res,next){try{
 verificarOrigenCorreo(req);if(!baseSQL.habilitada())return res.status(422).json({error:'La factura debe estar guardada.'});
 const r=await analisisGuardados.obtener(req.params.id);if(!r)return res.status(404).json({error:'Análisis no encontrado.'});
 if(!r.notasVenta||req.body?.revision!==r.notasVenta.revision)return res.status(409).json({error:'Las NV cambiaron. Volvé a abrir la factura antes de enviar.'});
 const detalle=await require('./services/controlNVPresea').actualizarDetalleNV();if(!detalle.disponible)throw Object.assign(new Error('No se pudo comprobar si las NV ya existen en Presea. El envío se mantiene bloqueado.'),{status:422});
 r.controlNVPresea=await analisisGuardados.guardarControlNV(req.params.id,detalle);
 if(r.controlNVPresea.revisionNV!==r.notasVenta.revision)throw Object.assign(new Error('Las NV cambiaron durante la comprobación. Volvé a abrir la factura.'),{status:409});
 const {DESTINO_NV,loteNV}=require('./services/nvFTP');
 const lote=loteNV(r,req.params.cliente);
 const { DESTINO_PRECIOS, loteCambiosPrecios } = require('./services/preciosNVFTP');
 if (!r.preciosNV?.revision || req.body?.revisionPrecios !== r.preciosNV.revision) {
  return res.status(409).json({error:'Calculá y controlá los precios de la factura antes de enviar el lote.'});
 }
 const precios = loteCambiosPrecios(r);
 const codigosConPrecio = new Set(r.preciosNV.filas.map(fila => JSON.stringify([String(fila.codigo), fila.cod_alfa])));
 for (const cliente of r.notasVenta.clientes) {
  if (!lote.archivos.some(archivo => archivo.nombre === `nv_cliente_${cliente.cliente}.dbi`)) continue;
  if (cliente.filas.some(fila => !codigosConPrecio.has(JSON.stringify([String(fila.CODIGO), fila.COD_ALFA])))) {
   return res.status(422).json({error:'Hay productos de las NV sin precio calculado. Volvé a calcular y controlar los precios.'});
  }
 }
 const copia = await require('./services/listaPreseaSQL').leerCopia();
 if (copia?.huella !== r.preciosNV.comprobacionMaestro.huella) {
  return res.status(409).json({error:'La lista de Presea cambió. Volvé a calcular y controlar los precios.'});
 }
 const archivos = [...precios.archivos.map(archivo => ({ ...archivo, destino: DESTINO_PRECIOS })), ...lote.archivos];
 const envioId=await analisisGuardados.iniciarEnvio(req.params.id,DESTINO_NV);let envio;
 try{envio=await enviarLoteFTP(r,{destino:DESTINO_NV,cantidadEsperada:archivos.length,destinosPermitidos:[DESTINO_PRECIOS],construir:()=>archivos,mensajeExito:precios.archivos.length?'Precios y notas de venta enviados al FTP. Importá primero los precios.':'Notas de venta enviadas al FTP. Los precios ya coinciden con Presea.'});envio.tipo=precios.archivos.length?'NV_CON_PRECIOS':'NV';envio.revisionNV=lote.revision;envio.revisionPrecios=precios.revision;envio.huellaPrecios=precios.huella;envio.excluidos=lote.excluidos;}
 catch(e){await analisisGuardados.finalizarEnvio(envioId,{ok:false,tipo:'NV',revisionNV:lote.revision,mensaje:'No se pudo completar el envío de las NV.',archivos:[]});throw e;}
 await analisisGuardados.finalizarEnvio(envioId,envio);res.status(envio.ok?200:502).set('Cache-Control','no-store').json(envio);
}catch(e){next(e);}}
app.post('/api/importaciones/analisis/:id/nv/enviar-ftp',express.json({limit:'4kb'}),enviarNV);
app.post('/api/importaciones/analisis/:id/nv/:cliente/enviar-ftp',express.json({limit:'4kb'}),enviarNV);
app.post('/api/importaciones/analisis/:id/nv/verificar-presea',async(req,res,next)=>{try{
 verificarOrigenCorreo(req);if(!baseSQL.habilitada())throw Object.assign(new Error('Guardá la factura primero.'),{status:422});
 const maestro=await require('./services/controlNVPresea').actualizarDetalleNV();res.set('Cache-Control','no-store').json(await analisisGuardados.guardarControlNV(req.params.id,maestro));
 }catch(e){next(e);}});
app.post('/api/importaciones/analisis/:id/precios-nv/enviar-ftp',express.json({limit:'4kb'}),async(req,res,next)=>{try{
 verificarOrigenCorreo(req);if(!baseSQL.habilitada())throw Object.assign(new Error('Guardá la factura primero.'),{status:422});
 const r=await analisisGuardados.obtener(req.params.id);if(!r)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
 const clientes = [...(r.informeCorreo?.clientes||[]).map(c=>c.cliente), ...(r.controlClientes?.filas||[]).map(c=>c.codigo), ...(r.notasVenta?.clientes||[]).map(c=>c.cliente)];
 if (!clientes.length || !clientes.every(c=>String(c??'').trim()==='131600')) {
  return res.status(422).json({error:'Para facturas de clientes, generá las NV y usá el envío conjunto desde Precios de NV.'});
 }
 const {DESTINO_PRECIOS,loteCambiosPrecios}=require('./services/preciosNVFTP'),lote=loteCambiosPrecios(r);
 if(!lote.archivos.length)throw Object.assign(new Error('Todos los precios ya coinciden con Presea.'),{status:422});
 const copia=await require('./services/listaPreseaSQL').leerCopia();
 if(copia?.huella!==r.preciosNV.comprobacionMaestro.huella)throw Object.assign(new Error('La lista de Presea cambió. Volvé a controlar los precios.'),{status:409});
 if(req.body?.revision!==lote.revision)throw Object.assign(new Error('Los precios cambiaron. Volvé a abrir la factura.'),{status:409});
 const envioId=await analisisGuardados.iniciarEnvio(req.params.id,DESTINO_PRECIOS);let envio;
 try{envio=await enviarLoteFTP(r,{destino:DESTINO_PRECIOS,cantidadEsperada:1,construir:()=>lote.archivos,mensajeExito:'Cambios de precios enviados. Importá PRECIOS_NV.DBI en Presea, actualizá su lista y volvé a controlar.'});}
 catch(e){await analisisGuardados.finalizarEnvio(envioId,{ok:false,tipo:'PRECIOS_NV',revision:lote.revision,archivos:[],mensaje:'No se pudo completar el envío de precios.'});throw e;}
 Object.assign(envio,{tipo:'PRECIOS_NV',revision:lote.revision,huella:lote.huella});await analisisGuardados.finalizarEnvio(envioId,envio);
 const precios=await analisisGuardados.actualizarFlujoPreciosNV(req.params.id,lote.revision,p=>({...p,flujoFTP:{revision:lote.revision,huella:lote.huella,envioId,envio}}));
 res.status(envio.ok?200:502).set('Cache-Control','no-store').json({envio,precios});
 }catch(e){next(e);}});
async function comprobarPreciosNV(id,revision){
 const r=await analisisGuardados.obtener(id);if(!r)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
 const precios = r.preciosNV;
 if (!precios?.revision || precios.bloqueada) throw Object.assign(new Error('Generá los precios y resolvé los pendientes antes de controlar.'), { status: 422 });
 if (revision !== precios.revision) throw Object.assign(new Error('Los precios cambiaron. Volvé a abrir la factura.'), { status: 409 });
 const control = await require('./services/controlPreciosFactura').controlarPreciosFactura(precios);
 return analisisGuardados.actualizarFlujoPreciosNV(id, revision, p => ({ ...p, comprobacionMaestro: { ...control, revision } }));
}
app.post('/api/importaciones/analisis/:id/precios-nv/verificar-presea',express.json({limit:'4kb'}),async(req,res,next)=>{try{
 verificarOrigenCorreo(req);if(!baseSQL.habilitada())throw Object.assign(new Error('Guardá la factura primero.'),{status:422});
 res.set('Cache-Control','no-store').json(await comprobarPreciosNV(req.params.id,req.body?.revision));
 }catch(e){next(e);}});
app.post('/api/importaciones/analisis/:id/precios-nv/preparar',async(req,res,next)=>{try{
 verificarOrigenCorreo(req);if(!baseSQL.habilitada())return res.status(422).json({error:'Guardá primero la factura.'});
 const p=await actualizarPreciosNV(req.params.id);
 res.set('Cache-Control','no-store').json(p);
}catch(e){next(e);}});
app.get('/api/importaciones/analisis/:id/precios-nv',async(req,res,next)=>{try{
 const r=await analisisGuardados.obtener(req.params.id);if(!r)return res.status(404).json({error:'Análisis no encontrado.'});const {archivos}=require('./services/preciosNVFTP').loteCambiosPrecios(r);if(!archivos.length)return res.status(422).json({error:'Todos los precios ya coinciden con Presea.'});const b=archivos[0].buffer;res.set('Cache-Control','no-store').type('application/octet-stream').attachment('PRECIOS_NV.DBI').send(b);
}catch(e){next(e);}});
app.get('/api/importaciones/analisis/:id/nv/:cliente',async(req,res,next)=>{try{
 const resultado=await analisisGuardados.obtener(req.params.id);if(!resultado)return res.status(404).json({error:'Análisis no encontrado.'});
 const p=resultado.notasVenta;if(!p)return res.status(422).json({error:'Prepará y guardá las NV antes de descargarlas.'});
 if(p.correccionesOrigen!==JSON.stringify(resultado.correccionesClientes||[]))return res.status(409).json({error:'Cambió la asignación de clientes. Actualizá las NV desde maestros.'});
 if(req.query.domiEntre!==undefined)return res.status(422).json({error:'Guardá la selección del domicilio antes de descargar.'});
 const buffer=require('./services/nvClientes').exportarNV(p,req.params.cliente);
 res.set('Cache-Control','no-store').type('application/octet-stream').attachment('nv_cliente_'+req.params.cliente+'.dbi').send(buffer);
}catch(e){next(e);}});
app.post('/api/importaciones/analisis/:id/comex/preparar',async(req,res,next)=>{
 try{if(req.headers.origin&&new URL(req.headers.origin).host!==req.get('host'))return res.status(403).json({error:'La preparación debe iniciarse desde esta app.'});
 if(!baseSQL.habilitada())return res.status(503).json({error:'Guardá el análisis en la base de datos antes de preparar COMEX.'});
 if(!await analisisGuardados.obtener(req.params.id))return res.status(404).json({error:'No se encontró el análisis.'});
 const maestro=await actualizarMaestro();if(!maestro.disponible)return res.status(422).json({error:'No se pudo actualizar el maestro de productos para COMEX.'});
 await analisisGuardados.actualizarCOMEX(req.params.id,maestro);res.set('Cache-Control','no-store').json(await analisisGuardados.obtener(req.params.id));
 }catch(error){next(error);}
});
app.get('/api/importaciones/analisis/:id/comex/:tipo',async(req,res,next)=>{
 try{const definicion=COMEX[req.params.tipo];if(!['pedidos','masterData'].includes(req.params.tipo))return res.status(400).json({error:'Tipo COMEX no válido.'});
 const resultado=await analisisGuardados.obtener(req.params.id);if(!resultado)return res.status(410).json({error:'Guardá el análisis para descargar los archivos COMEX.'});
 const p=resultado.comex?.[req.params.tipo];if(!p||p.bloqueada||!p.total)return res.status(422).json({error:p?.mensaje||'Prepará COMEX y revisá las observaciones antes de descargar.'});
 const buffer=exportarCOMEX(resultado,req.params.tipo);
 res.set('Cache-Control','no-store').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(require('./services/comex').nombreCOMEX(resultado,req.params.tipo)).send(buffer);
 }catch(error){next(error);}
});
const {actualizarClientes,redactarCorreo,crearBorrador}=require('./services/correoFactura');
function verificarOrigenCorreo(req){if(req.headers.origin&&new URL(req.headers.origin).host!==req.get('host'))throw Object.assign(new Error('El correo debe prepararse desde esta app.'),{status:403});}
app.post('/api/importaciones/analisis/:id/clientes/catalogo',async(req,res,next)=>{
 try{verificarOrigenCorreo(req);if(!await analisisGuardados.obtener(req.params.id))return res.status(404).json({error:'No se encontró la factura guardada.'});
 const m=await actualizarClientes();if(!m.disponible)return res.status(422).json({error:'No se pudo actualizar el maestro de clientes.'});
 const clientes=[...m.indice].map(([codigo,nombre])=>({codigo,nombre}));if(!m.indice.has('131600')&&!m.ambiguos?.includes('131600'))clientes.push({codigo:'131600',nombre:'ADMINISTRACIÓN'});
 res.set('Cache-Control','no-store').json({huellaMaestro:m.huella,clientes:clientes.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))});
 }catch(error){next(error);}
});
app.post('/api/importaciones/analisis/:id/clientes/corregir',express.json({limit:'4kb'}),async(req,res,next)=>{
 try{verificarOrigenCorreo(req);if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return res.status(422).json({error:'Completá los datos de la corrección.'});if(!baseSQL.habilitada())return res.status(503).json({error:'La corrección requiere una factura guardada.'});
 if(!await analisisGuardados.obtener(req.params.id))return res.status(404).json({error:'No se encontró la factura guardada.'});
 const maestro=await actualizarClientes();if(!maestro.disponible)return res.status(422).json({error:'No se pudo actualizar el maestro. La factura se conserva sin cambios.'});
 await analisisGuardados.actualizarInformeCorreo(req.params.id,maestro,req.body);res.set('Cache-Control','no-store').json(await analisisGuardados.obtener(req.params.id));
 }catch(error){next(error);}
});
app.post('/api/importaciones/analisis/:id/correo/preparar',async(req,res,next)=>{
 try{verificarOrigenCorreo(req);if(!baseSQL.habilitada())return res.status(503).json({error:'Guardá el análisis antes de preparar el correo.'});
 if(!await analisisGuardados.obtener(req.params.id))return res.status(404).json({error:'No se encontró el análisis.'});
 const clientes=await actualizarClientes();if(!clientes.disponible)return res.status(422).json({error:'No se pudo actualizar Clientes_Versato.TXT desde el FTP.'});
 await analisisGuardados.actualizarInformeCorreo(req.params.id,clientes);res.set('Cache-Control','no-store').json(await analisisGuardados.obtener(req.params.id));
 }catch(error){next(error);}
});
app.get('/api/importaciones/analisis/:id/correo/deposito',async(req,res,next)=>{
 try{const r=await analisisGuardados.obtener(req.params.id),a=r?.archivoDeposito;if(!a||a.bloqueada)return res.status(422).json({error:'Actualizá el informe del correo y revisá el archivo de depósito.'});
 const buffer=a.version>=2?require('./services/archivoDeposito').exportarDeposito(a):await analisisGuardados.archivo(req.params.id,a.nombre)||require('./services/archivoDeposito').exportarDeposito(a);res.set('Cache-Control','no-store').type(require('./services/archivoDeposito').TIPO).attachment(a.nombre).send(buffer);
 }catch(error){next(error);}
});
app.get('/api/importaciones/analisis/:id/correo/notas-venta.xlsx',async(req,res,next)=>{try{const r=await analisisGuardados.obtener(req.params.id);if(!r)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});const servicio=require('./services/archivoNVCorreo'),a=servicio.prepararExcelNV(r),buffer=servicio.exportarExcelNV(a);res.set('Cache-Control','no-store').type(servicio.TIPO).attachment(a.nombre).send(buffer);}catch(e){next(e);}});
app.post('/api/importaciones/analisis/:id/correo/configuracion',express.json({limit:'32kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);const r=await analisisGuardados.obtener(req.params.id);if(!r?.informeCorreo)throw Object.assign(new Error('Primero prepará el informe de esta factura.'),{status:422});res.set('Cache-Control','no-store').json(require('./services/configuracionCorreo').guardarConfiguracion(r.informeCorreo,req.body));}catch(e){next(e);}});
app.post('/api/importaciones/analisis/:id/correo/:accion',express.json({limit:'32kb'}),async(req,res,next)=>{
 try{verificarOrigenCorreo(req);if(!['vista-previa','borrador','abrir'].includes(req.params.accion))return res.status(400).json({error:'Acción de correo no válida.'});
 if(req.params.accion==='abrir')require('./services/abrirCorreoLocal').verificarAccesoLocal(req);
 const r=await analisisGuardados.obtener(req.params.id);if(!r?.informeCorreo)return res.status(422).json({error:'Prepará el informe del correo desde el análisis guardado.'});
 const deposito=r.archivoDeposito,disponible=deposito&&!deposito.bloqueada;const servicioNV=require('./services/archivoNVCorreo'),archivoNV=servicioNV.prepararExcelNV(r),adjuntosNV=archivoNV?[{nombre:archivoNV.nombre}]:[];
 if(req.params.accion==='vista-previa')return res.set('Cache-Control','no-store').json(redactarCorreo(r.informeCorreo,req.body,[...(disponible?[{nombre:deposito.nombre}]:[]),...adjuntosNV]));
 if(!disponible)return res.status(422).json({error:'Actualizá el informe para generar y adjuntar el archivo de depósito.'});
 const adjunto=deposito.version>=2?require('./services/archivoDeposito').exportarDeposito(deposito):await analisisGuardados.archivo(req.params.id,deposito.nombre)||require('./services/archivoDeposito').exportarDeposito(deposito);
 const adjuntos=[{nombre:deposito.nombre,tipo:require('./services/archivoDeposito').TIPO,buffer:adjunto},...(archivoNV?[{nombre:archivoNV.nombre,tipo:servicioNV.TIPO,buffer:servicioNV.exportarExcelNV(archivoNV)}]:[])];
 const buffer=crearBorrador(r.informeCorreo,req.body,adjuntos);if(req.params.accion==='abrir'){await require('./services/abrirCorreoLocal').abrirCorreoLocal(buffer);return res.set('Cache-Control','no-store').json({abierto:true});}res.set('Cache-Control','no-store').type('message/rfc822').attachment('Informe-Versato-'+r.informeCorreo.factura.replace(/[^0-9A-Za-z-]/g,'-')+'.eml').send(buffer);
 }catch(error){next(error);}
});
app.get('/api/historial',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json({persistente:baseSQL.habilitada(),analisis:await analisisGuardados.listar()});}catch(e){next(e);}});
app.get('/api/historial/:id',async(req,res,next)=>{try{const r=await analisisGuardados.obtener(req.params.id);if(!r)return res.status(404).json({error:'No se encontró ese análisis.'});res.set('Cache-Control','no-store').json(r);}catch(e){next(e);}});
app.get('/api/historial/:id/envios',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json({envios:await analisisGuardados.envios(req.params.id)});}catch(e){next(e);}});
app.get('/api/consultas/fila/:id',async(req,res,next)=>{try{const fila=await require('./services/consultasSQL').filaOriginal(req.params.id);if(!fila)return res.status(404).json({error:'Fila no encontrada.'});res.set('Cache-Control','no-store').json(fila);}catch(e){next(e);}});
app.get('/api/consultas/:tipo',async(req,res,next)=>{try{if(!baseSQL.habilitada())return res.status(503).json({error:'Las consultas requieren SQL Server.'});res.set('Cache-Control','no-store').json(await require('./services/consultasSQL').consultar(req.params.tipo,req.query));}catch(e){next(e);}});
app.get('/api/historial/:id/original/:tipo',async(req,res,next)=>{try{const archivo=await require('./services/consultasSQL').archivoOriginal(req.params.id,req.params.tipo);if(!archivo)return res.status(404).json({error:'El original no se guardó en este análisis. Volvé a cargar los archivos para registrarlos.'});res.set('Cache-Control','no-store').type('application/octet-stream').attachment(archivo.nombre).send(archivo.buffer);}catch(e){next(e);}});
const uploadPrecios=multer({storage:multer.memoryStorage(),limits:{fileSize:60*1024*1024,files:10,fields:0,parts:10},fileFilter(req,file,cb){const valido=/\.(xls|xlsx|xlsm)$/i.test(file.originalname);cb(valido?null:Object.assign(new Error('Usá listas FOB en formato .xls, .xlsx o .xlsm.'),{status:415}),valido);}});
app.post('/api/precios/incorporar',(req,res,next)=>{try{verificarOrigenCorreo(req);if(req.query.fecha!==undefined&&!require('./services/vigenciasPrecios').fechaValida(req.query.fecha))throw Object.assign(new Error('Fecha de cálculo no válida.'),{status:422});next();}catch(e){next(e);}},uploadPrecios.array('listas',10),async(req,res,next)=>{try{const incorporacion=await require('./services/listasPrecios').incorporar(req.files);res.set('Cache-Control','no-store').json({...await require('./services/listasPrecios').estado(req.query.fecha),incorporacion});}catch(e){next(e);}});
function listasConsulta(req){if(req.query.listas===undefined)return undefined;try{const lista=JSON.parse(req.query.listas);if(!Array.isArray(lista))throw Error();return lista;}catch{throw Object.assign(new Error('La selección de listas no es válida.'),{status:422});}}
app.post('/api/precios/fuentes/ficha', express.json({limit:'4kb'}), async (req,res,next) => {
 try {
  verificarOrigenCorreo(req);
  const fuentes = await require('./services/listasPrecios').guardarFichaFOB(req.body);
  res.set('Cache-Control','no-store').json({ fuentes });
 } catch (error) { next(error); }
});
app.post('/api/precios/fuentes/activar',express.json({limit:'64kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);if(!Array.isArray(req.body?.listas)||!req.body.listas.length)throw Object.assign(new Error('Seleccioná listas para activar.'),{status:422});await require('./services/listasPrecios').consolidar({nombres:req.body.listas});res.set('Cache-Control','no-store').json(await require('./services/listasPrecios').estado(req.query.fecha));}catch(e){next(e);}});
app.get('/api/precios/modelo/:modelo/fuentes',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await require('./services/listasPrecios').fuentesModelo(req.params.modelo,{nombres:listasConsulta(req)}));}catch(e){next(e);}});
app.get('/api/precios',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await require('./services/listasPrecios').estado(req.query.fecha,{nombres:listasConsulta(req)}));}catch(e){next(e);}});
let vistaPreciosPresea, preparandoVistaPresea = false, actualizandoListaPresea = false;
async function refrescarListaPresea() {
 if (actualizandoListaPresea || preparandoVistaPresea) {
  throw Object.assign(new Error('Hay una actualización o comparación en curso. Esperá a que termine.'), { status: 409 });
 }
 actualizandoListaPresea = true;
 try {
  const lista = await require('./services/listaPreseaSQL').actualizarCopia();
  vistaPreciosPresea = undefined;
  return lista;
 } finally { actualizandoListaPresea = false; }
}
app.get('/api/precios/presea/lista', async (req, res, next) => {
  try {
    const lista = await require('./services/listaPreseaSQL').leerCopia();
    res.set('Cache-Control', 'no-store').json({ lista });
  } catch (error) { next(error); }
});
app.post('/api/precios/presea/lista', async (req, res, next) => {
  try {
    verificarOrigenCorreo(req);
    const lista = await refrescarListaPresea();
    res.set('Cache-Control', 'no-store').json({ lista });
  } catch (error) { next(error); }
});
function recuperarVistaPresea(id) {
  if (!vistaPreciosPresea || vistaPreciosPresea.id !== id || Date.now() >= vistaPreciosPresea.vence) {
    throw Object.assign(new Error('La comparación venció. Volvé a comparar con Presea.'), { status: 410 });
  }
  return vistaPreciosPresea;
}
async function cargarComparacionPresea(fecha) {
  if (!await require('./services/listaPreseaSQL').leerCopia()) {
    throw Object.assign(new Error('Primero usá Actualizar lista desde Presea para guardar una copia en la base.'), { status: 422 });
  }
  const precios = await require('./services/listasPrecios').estado(fecha, { incluirFuentes: false });
  const [maestro, sueltos] = await Promise.all([actualizarMaestro(), actualizarSueltos({ soloPrecios: true })]);
  return require('./services/preciosMaestro').consultarPreciosMaestro(precios, maestro, sueltos);
}
app.post('/api/precios/presea/comparar', async (req, res, next) => {
  try {
    verificarOrigenCorreo(req);
    if (preparandoVistaPresea || actualizandoListaPresea) return res.status(409).json({ error: 'Hay una actualización o comparación en curso. Esperá a que termine.' });
    preparandoVistaPresea = true;
    try {
      const comparacion = await cargarComparacionPresea(req.query.fecha);
      const id = require('node:crypto').randomUUID();
      const duracion = 15 * 60 * 1000;
      const vista = { id, comparacion, vence: Date.now() + duracion };
      vistaPreciosPresea = vista;
      setTimeout(() => { if (vistaPreciosPresea?.id === id) vistaPreciosPresea = undefined; }, duracion).unref();
      const { iguales, altas, cambios, conflictos, porLista, omitidos, modelosSinCoincidencia, fecha } = comparacion;
      res.set('Cache-Control', 'no-store').json({ id, iguales, altas, cambios, conflictos, porLista, omitidos, modelosSinCoincidencia, fecha });
    } finally { preparandoVistaPresea = false; }
  } catch (error) { next(error); }
});
app.get('/api/precios/presea/comparar/:id', (req, res, next) => {
  try {
    const vista = recuperarVistaPresea(req.params.id);
    const { lista, tipo, estado, buscar } = req.query;
    const pagina = Number(req.query.pagina ?? 0);
    if (!Number.isSafeInteger(pagina) || pagina < 0 || pagina > 100000) return res.status(422).json({ error: 'Página no válida.' });
    const filtros = { lista, tipo, estado, pagina, buscar: typeof buscar === 'string' ? buscar.trim().toUpperCase().replaceAll('-', '.').slice(0, 80) : '' };
    res.set('Cache-Control', 'no-store').json(vista.comparacion.consultar(filtros));
  } catch (error) { next(error); }
});
app.post('/api/precios/maestro.dbi', express.urlencoded({ extended: false, limit: '128kb' }), async (req, res, next) => {
  try {
    verificarOrigenCorreo(req);
    const { lista } = req.query;
    if (lista !== undefined && !['03', '04', '980'].includes(lista)) return res.status(422).json({ error: 'Elegí la lista 03, 04 o 980.' });
    let codigos;
    if (req.body?.productos !== undefined) {
      try { codigos = JSON.parse(req.body.productos); } catch { codigos = null; }
      if (!req.query.vista || !Array.isArray(codigos) || !codigos.length || codigos.length > 5000 ||
          codigos.some(codigo => typeof codigo !== 'string' || !/^\d{1,20}$/.test(codigo))) {
        return res.status(422).json({ error: 'Seleccioná productos válidos de la comparación para descargar el DBI.' });
      }
    }
    const comparacion = req.query.vista ? recuperarVistaPresea(req.query.vista).comparacion : await cargarComparacionPresea(req.query.fecha);
    const salida = require('./services/preciosMaestro').exportarPreciosMaestro(comparacion, lista, codigos);
    res.set({
      'Cache-Control': 'no-store',
      'X-Articulos': String(salida.articulos),
      'X-Precios-Nuevos': String(salida.altas),
      'X-Precios-Modificados': String(salida.cambios),
      'X-Precios-Iguales': String(salida.iguales),
      'X-Precios-En-Conflicto': String(salida.conflictos),
      'X-Registros': String(salida.registros),
      'X-Articulos-Omitidos': String(salida.omitidos),
      'X-Modelos-Sin-Coincidencia': String(salida.modelosSinCoincidencia)
    }).attachment(lista ? `PRECIOS_VERSATO_${lista}.DBI` : 'PRECIOS_VERSATO.DBI');
    await require('node:stream/promises').pipeline(salida.bloques(), res);
  } catch (error) { if (!res.destroyed) next(error); }
});
app.post('/api/precios/consolidar',async(req,res,next)=>{try{verificarOrigenCorreo(req);await require('./services/listasPrecios').consolidar();res.set('Cache-Control','no-store').json(await require('./services/listasPrecios').estado(req.query.fecha));}catch(e){next(e);}});
app.post('/api/precios/vigencias/estado',express.json({limit:'4kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);await require('./services/listasPrecios').guardarEstadoVigencia(req.body);res.set('Cache-Control','no-store').json(await require('./services/listasPrecios').estado(req.query.fecha));}catch(e){next(e);}});
app.post('/api/precios/vigencias',express.json({limit:'12kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);await require('./services/listasPrecios').guardarConfiguracion(req.body);res.set('Cache-Control','no-store').json(await require('./services/listasPrecios').estado(req.query.fecha));}catch(e){next(e);}});
app.get('/api/precios/consolidado.xlsx',async(req,res,next)=>{try{const buffer=await require('./services/listasPrecios').exportar(req.query.fecha,req.query.marcas===undefined?undefined:typeof req.query.marcas==='string'?req.query.marcas.split(','):[],listasConsulta(req));const fecha=(req.query.fecha||require('./services/vigenciasPrecios').hoy()).split('-').reverse().join('-');res.set('Cache-Control','no-store').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('Lista Precios Versato '+fecha+'.xlsx').send(buffer);}catch(e){next(e);}});
app.get('/api/fotos',async(req,res,next)=>{try{if(!baseSQL.habilitada())return res.status(503).json({error:'El catálogo de fotos requiere la base de datos.'});const p=require('./services/buscarFotos').parametrosFotos(req.query.modelo,req.query.pagina);const repo=require('./services/repositorioImagenes');res.set('Cache-Control','no-store').json(await repo.instalada()?await repo.buscarCatalogo(p.busqueda,p.pagina):await analisisGuardados.buscarFotos(p.busqueda,p.pagina));}catch(e){next(e);}});
app.get('/api/fotos/ubicaciones',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await require('./services/repositorioImagenes').ubicaciones());}catch(e){next(e);}});
app.post('/api/fotos/ubicaciones',express.json({limit:'8kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);res.json(await require('./services/repositorioImagenes').guardarUbicacion(req.body));}catch(e){next(e);}});
app.delete('/api/fotos/ubicaciones/:id',express.json({limit:'4kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);res.json(await require('./services/repositorioImagenes').eliminarUbicacion(req.params.id,req.body?.revision));}catch(e){next(e);}});
app.post('/api/fotos/sincronizar',async(req,res,next)=>{try{verificarOrigenCorreo(req);res.status(202).json(await require('./services/repositorioImagenes').iniciar());}catch(e){next(e);}});
app.get('/api/fotos/sincronizacion/:id',(req,res,next)=>{try{const estado=require('./services/repositorioImagenes').estado();if(!estado||estado.id!==req.params.id)return res.status(404).json({error:'La sincronización ya no está disponible. Consultá el resultado guardado en las ubicaciones.'});res.set('Cache-Control','no-store').json(estado);}catch(e){next(e);}});
app.get('/api/fotos/imagen/:producto',async(req,res,next)=>{try{if(!/^\d+(?:\.\d+){3}$/.test(req.params.producto))return res.status(422).json({error:'Producto inválido.'});const foto=await require('./services/repositorioImagenes').fotoCatalogo(req.params.producto);if(!foto)return res.status(404).json({error:'No hay foto disponible.'});responderFoto(res,foto);}catch(e){next(e);}});
app.get('/fotos',(req,res)=>res.sendFile('fotos.html',{root:path.join(__dirname,'../public')}));
app.get('/precios',(req,res)=>res.sendFile('precios.html',{root:path.join(__dirname,'../public')}));
app.get('/consultas',(req,res)=>res.sendFile('consultas.html',{root:path.join(__dirname,'../public')}));
app.get('/stock', (req,res)=>res.sendFile('stock.html',{root:path.join(__dirname,'../public')}));
app.get('/api/stock/vistas',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json({vistas:await require('./services/vistasStock').leer()});}catch(e){next(e);}});
app.get('/api/stock/programador',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await require('./services/programadorGrillas').estado());}catch(e){next(e);}});
app.post('/api/stock/vistas/:id/programacion',express.json({limit:'8kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);const servicio=require('./services/vistasStock'),v=(await servicio.leer()).find(v=>v.id===req.params.id);if(!v)throw Object.assign(Error('La vista ya no existe.'),{status:404});res.json(await servicio.guardar({...v,revision:req.body?.revision,programacion:req.body?.programacion}));}catch(e){next(e);}});
app.post('/api/stock/vistas/:id/ejecutar',express.json({limit:'4kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);res.status(202).json(await require('./services/programadorGrillas').ejecutar(req.params.id,req.body?.revision));}catch(e){next(e);}});
app.post('/api/stock/vistas',express.json({limit:'64kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);res.set('Cache-Control','no-store').json(await require('./services/vistasStock').guardar(req.body));}catch(e){next(e);}});
app.delete('/api/stock/vistas/:id',express.json({limit:'4kb'}),async(req,res,next)=>{try{verificarOrigenCorreo(req);await require('./services/vistasStock').eliminar(req.params.id,req.body?.revision);res.json({eliminada:true});}catch(e){next(e);}});
app.get('/api/stock', async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await require('./services/stock').catalogo());}catch(e){next(e);}});
app.post('/api/stock/actualizar', async(req,res,next)=>{try{verificarOrigenCorreo(req);res.set('Cache-Control','no-store').json(await require('./services/stock').actualizar());}catch(e){next(e);}});
app.get('/api/stock/grilla', async(req,res,next)=>{try{
 const datos=await require('./services/stock').generar(req.query);
 const pagina=Math.max(0,Math.floor(Number(req.query.pagina)||0));
 const {filas,grupos,...resto}=datos;
 res.set('Cache-Control','no-store').json({...resto,total:grupos.length,pagina,grupos:grupos.slice(pagina*50,pagina*50+50)});
}catch(e){next(e);}});
app.get('/api/stock/excel', async(req,res,next)=>{try{
 const stock=require('./services/stock');await stock.actualizar();const datos=await stock.generar(req.query);
 const contenido=await require('./services/grillaVendedores').exportar(datos,req.query);
 res.set('Content-Type',contenido.tipo).attachment(contenido.nombre).send(contenido.buffer);
}catch(e){next(e);}});
app.get('/clientes', (req, res) => res.sendFile('clientes.html', { root: path.join(__dirname, '../public') }));
app.post('/api/clientes/actualizar', async (req, res, next) => {
 try {
  verificarOrigenCorreo(req);
  const maestro = await actualizarClientes();
  if (!maestro.disponible) return res.status(502).json({ error: 'No se pudo actualizar el maestro desde el FTP.' });
  res.set('Cache-Control', 'no-store').json({ actualizado: maestro.actualizado });
 } catch (error) { next(error); }
});
app.get('/api/clientes', async (req, res, next) => {
 try {
  const {maestro,fecha}=await require('./services/clientesSQL').leer();
  const normalizar = valor => valor.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  const buscar = typeof req.query.buscar === 'string' ? normalizar(req.query.buscar.trim().slice(0,100)) : '';
  const pagina = Number(req.query.pagina ?? 0);
  if (!Number.isSafeInteger(pagina) || pagina < 0) return res.status(422).json({ error: 'Página no válida.' });
  const codigos = [...maestro.nombresPorCliente.keys()].filter(codigo => codigo.includes(buscar) ||
   [...maestro.nombresPorCliente.get(codigo)].some(nombre => normalizar(nombre).includes(buscar)));
  codigos.sort((a,b) => (a === buscar ? -1 : b === buscar ? 1 : a.localeCompare(b,'es',{numeric:true})));
  const clientes = codigos.slice(pagina * 40, pagina * 40 + 40).map(codigo => ({ codigo,
   nombres: [...maestro.nombresPorCliente.get(codigo)], domicilios: maestro.detalleDomicilios.get(codigo) || [] }));
  res.set('Cache-Control', 'no-store').json({ clientes, fecha, total: codigos.length });
 } catch (error) {
  if (error.code === 'ENOENT') return res.status(404).json({ error: 'Todavía no hay una copia del maestro. Usá Actualizar desde FTP.' });
  next(error);
 }
});
app.get('/historial',(req,res)=>res.sendFile('historial.html',{root:path.join(__dirname,'../public')}));
app.get('/logicas', (req,res)=>res.sendFile('logicas.html',{root:path.join(__dirname,'../public')}));
app.get('/importaciones', (req, res) => res.sendFile('index.html', { root: path.join(__dirname, '../public') }));
const uploadPedidos=multer({storage:multer.memoryStorage(),limits:{fileSize:60*1024*1024,files:20,fields:0,parts:20},fileFilter(req,file,cb){const valido=/\.(zip|csv)$/i.test(file.originalname);cb(valido?null:Object.assign(new Error('Seleccioná pedidos ZIP o CSV.'),{status:415}),valido);}});
app.post('/api/importaciones/analisis/:id/pedidos',uploadPedidos.array('pedidos',20),async(req,res,next)=>{try{
 verificarOrigenCorreo(req);if(!baseSQL.habilitada())throw Object.assign(new Error('Guardá la factura antes de incorporar sus pedidos.'),{status:422});
 if(!req.files?.length)throw Object.assign(new Error('Seleccioná los pedidos ZIP o CSV.'),{status:422});
 const servicio=require('./services/controlPedidos'),origen=servicio.leerPedidos(req.files);
 let control;if(req.query.guardar==='1')control=await analisisGuardados.guardarControlPedidos(req.params.id,origen);
 else{const resultado=await analisisGuardados.obtener(req.params.id);if(!resultado)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});const previews=await analisisGuardados.datosNV(req.params.id);if(!previews?.PACKING_LIST?.registros.length)throw Object.assign(new Error('Falta el Packing guardado.'),{status:422});control=servicio.compararPedidos(origen,previews,resultado.correccionesClientes||[]);}
 res.set('Cache-Control','no-store').json({control,guardado:req.query.guardar==='1'});
 }catch(e){next(e);}});
app.use(express.static(path.join(__dirname, '../public')));
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: error.code === 'LIMIT_FILE_SIZE' ? (req.path.endsWith('/imagenes')?'La foto supera los 5 MB.':'El archivo supera los 60 MB.') : req.path.includes('/cruzar') ? 'Enviá tres archivos en el campo archivos.' : 'Enviá un único archivo en el campo archivo.'
    });
  }
  res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo completar la operación. Intentá nuevamente.' ,...(error.analisisId?{analisisId:error.analisisId}:{}) });
});
module.exports = app;
