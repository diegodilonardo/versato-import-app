const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {sql,conectar}=require('./sqlServer');
const {tipoImagen}=require('./imagenesProducto');
const RAIZ=path.join(__dirname,'../../data/repositorio-imagenes');
const error=(m,status=422)=>Object.assign(new Error(m),{status});
let trabajo;
const hash=b=>createHash('sha256').update(b).digest('hex');
const productoNombre=n=>/^(\d+)[.-](\d+)[.-](\d+)[.-](\d+)\.(?:jpe?g|png)$/i.exec(n)?.slice(1,5).join('.')||null;

async function instalada(){const p=await conectar();return !!(await p.request().query("SELECT CASE WHEN OBJECT_ID(N'versato.UbicacionesImagenes') IS NOT NULL AND OBJECT_ID(N'versato.RepositorioImagenes') IS NOT NULL THEN 1 ELSE 0 END AS lista")).recordset[0].lista;}
async function exigir(){if(!await instalada())throw error('Falta ejecutar la migración SQL 006 del repositorio de imágenes.',503);}
async function ubicaciones(){
 if(!await instalada())return {disponible:false,ubicaciones:[],mensaje:'Falta ejecutar la migración SQL 006 del repositorio de imágenes.'};
 const p=await conectar();const r=await p.request().query(`SELECT Id id,Nombre nombre,Ruta ruta,Subcarpetas subcarpetas,Activa activa,Prioridad prioridad,Revision revision,
  Creado creado,UltimaSincronizacion ultimaSincronizacion,Resumen resumen FROM versato.UbicacionesImagenes WHERE ISNULL(JSON_VALUE(Resumen,'$.ubicacionEliminada'),'false')<>'true' ORDER BY Prioridad,Creado,Id`);
 return {disponible:true,ubicaciones:r.recordset.map(v=>({...v,resumen:v.resumen?JSON.parse(v.resumen):null})),repositorio:RAIZ,trabajo:estado()};
}
function validarUbicacion(b){
 if(typeof b?.nombre!=='string'||!b.nombre.trim()||b.nombre.trim().length>120)throw error('Indicá un nombre de hasta 120 caracteres.');
 if(typeof b.ruta!=='string'||b.ruta.length>1024||/[\x00-\x1f]/.test(b.ruta)||!path.win32.isAbsolute(b.ruta.trim())||/^\\\\[?.]\\/.test(b.ruta.trim()))throw error('Indicá una carpeta local absoluta o una ruta de red UNC válida.');
 if(typeof b.subcarpetas!=='boolean'||typeof b.activa!=='boolean'||!Number.isInteger(b.prioridad)||b.prioridad<1||b.prioridad>9999)throw error('La prioridad debe ser un número entre 1 y 9999.');
 const normal=path.win32.normalize(b.ruta.trim());
 const ruta=normal.length>path.win32.parse(normal).root.length?normal.replace(/\\+$/,''):normal;
 return {...b,nombre:b.nombre.trim(),ruta};
}
async function guardarUbicacion(entrada){
 if(trabajo?.estado==='EN_CURSO')throw error('Esperá a que finalice la sincronización antes de cambiar ubicaciones.',409);
 await exigir();const b=validarUbicacion(entrada);const p=await conectar(),tx=new sql.Transaction(p);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{
  const id=b.id||randomUUID(),revision=randomUUID();
  if(b.id&&!/^[a-f\d-]{36}$/i.test(b.id))throw error('Ubicación inválida.');
  const duplicada=await new sql.Request(tx).input('ruta',sql.NVarChar(1024),b.ruta).input('id',sql.UniqueIdentifier,id).query(`SELECT TOP(1) Id FROM versato.UbicacionesImagenes WITH(UPDLOCK,HOLDLOCK) WHERE Ruta=@ruta AND Id<>@id AND ISNULL(JSON_VALUE(Resumen,'$.ubicacionEliminada'),'false')<>'true'`);
  if(duplicada.recordset.length)throw error('Esa carpeta ya está configurada.');
  const q=new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('nombre',sql.NVarChar(120),b.nombre).input('ruta',sql.NVarChar(1024),b.ruta).input('sub',sql.Bit,b.subcarpetas).input('activa',sql.Bit,b.activa).input('prioridad',sql.Int,b.prioridad).input('revision',sql.UniqueIdentifier,revision);
  if(b.id){
   if(!/^[a-f\d-]{36}$/i.test(b.revision||''))throw error('Volvé a cargar las ubicaciones antes de editar.');
   q.input('anterior',sql.UniqueIdentifier,b.revision);
   const r=await q.query(`UPDATE versato.UbicacionesImagenes SET Nombre=@nombre,Ruta=@ruta,Subcarpetas=@sub,Activa=@activa,Prioridad=@prioridad,Revision=@revision WHERE Id=@id AND Revision=@anterior AND ISNULL(JSON_VALUE(Resumen,'$.ubicacionEliminada'),'false')<>'true'`);
   if(!r.rowsAffected[0])throw error('La ubicación cambió en otra ventana. Volvé a cargar el listado.',409);
  }else await q.query('INSERT versato.UbicacionesImagenes(Id,Nombre,Ruta,Subcarpetas,Activa,Prioridad,Revision)VALUES(@id,@nombre,@ruta,@sub,@activa,@prioridad,@revision)');
  await tx.commit();return {id,revision};
 }catch(e){await tx.rollback().catch(()=>{});throw e;}
}

async function* archivos(carpeta,subcarpetas){
 const directorio=await fs.opendir(carpeta);
 for await(const entrada of directorio){
  if(entrada.isSymbolicLink())continue;
  const ruta=path.join(carpeta,entrada.name);
  if(entrada.isDirectory()&&subcarpetas)yield* archivos(ruta,true);
  else if(entrada.isFile()&&/\.(jpe?g|png)$/i.test(entrada.name))yield ruta;
 }
}
function rutaCopia(huella,tipo,raiz=RAIZ){
 if(!/^[a-f0-9]{64}$/.test(huella)||!['image/png','image/jpeg'].includes(tipo))throw error('Metadatos de imagen inválidos.');
 return path.join(raiz,huella+(tipo==='image/png'?'.png':'.jpg'));
}
async function copiar(buffer,huella,tipo,raiz=RAIZ){
 await fs.mkdir(raiz,{recursive:true});const destino=rutaCopia(huella,tipo,raiz);
 try{const existente=await fs.readFile(destino);if(hash(existente)===huella)return;}catch(e){if(e.code!=='ENOENT')throw e;}
 const temporal=destino+'.'+randomUUID()+'.tmp';
 try{await fs.writeFile(temporal,buffer,{flag:'wx'});await fs.rename(temporal,destino);}finally{await fs.rm(temporal,{force:true}).catch(()=>{});}
}
async function leerFoto(producto){
 if(!await instalada())return null;
 const p=await conectar(),r=await p.request().input('producto',sql.NVarChar(254),producto).query('SELECT Tipo,Huella FROM versato.RepositorioImagenes WHERE Producto=@producto');
 const f=r.recordset[0];if(!f)return null;
 try{return {tipo:f.Tipo,buffer:await fs.readFile(rutaCopia(f.Huella,f.Tipo))};}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function fotosProductos(productos){
 if(!productos.length||!await instalada())return new Map();
 const p=await conectar(),r=await p.request().input('productos',sql.NVarChar(sql.MAX),JSON.stringify(productos)).query('SELECT f.Producto,f.Huella,f.Tipo FROM versato.RepositorioImagenes f JOIN OPENJSON(@productos) p ON f.Producto=p.value COLLATE Latin1_General_100_BIN2');
 const salida=new Map();
 for(const f of r.recordset){try{salida.set(f.Producto,{Tipo:f.Tipo,Contenido:await fs.readFile(rutaCopia(f.Huella,f.Tipo))});}catch(e){if(e.code!=='ENOENT')throw e;}}
 return salida;
}
function estado(j=trabajo){if(!j)return null;const {id,estado,etapa,inicio,fin,ubicacion,total,totalCandidatos,procesadas,nuevas,actualizadas,iguales,sinAsociar,conflictos,errores,detalle}=j;return {id,estado,etapa,inicio,fin,ubicacion,total,totalCandidatos,procesadas,nuevas,actualizadas,iguales,sinAsociar,conflictos,errores,detalle:[...detalle]};}
function anotar(j,texto){j.errores++;if(j.detalle.length<100)j.detalle.push(texto);}
async function sincronizar(j,fuentes){
 const candidatos=new Map();const p=await conectar();
 try{
  j.etapa='Revisando ubicaciones';
  for(const u of fuentes){
   j.ubicacion=u.nombre;
   try{for await(const ruta of archivos(u.ruta,u.subcarpetas)){
    j.total++;const producto=productoNombre(path.basename(ruta));
    if(!producto){j.sinAsociar++;if(j.detalle.length<100)j.detalle.push('Nombre sin formato de modelo y color: '+path.basename(ruta)+' en «'+u.nombre+'».');continue;}
    const previo=candidatos.get(producto);
    if(!previo)candidatos.set(producto,{u,rutas:[ruta]});
    else if(previo.u.id===u.id)previo.rutas.push(ruta);
   }}catch(e){anotar(j,'No se pudo leer toda la ubicación «'+u.nombre+'». Revisá la ruta y los permisos.');}
  }
  j.totalCandidatos=candidatos.size;j.etapa='Copiando imágenes al repositorio';
  for(const [producto,{u,rutas}]of candidatos){
   j.ubicacion=u.nombre;j.procesadas++;
   try{
    const lecturas=[];
    for(const ruta of rutas){
     const handle=await fs.open(ruta,'r');let buffer,info;
     try{info=await handle.stat();if(info.size>5*1024*1024||info.size<20)throw error('La imagen debe tener hasta 5 MB.');buffer=await handle.readFile();}finally{await handle.close();}
     const tipo=tipoImagen(buffer);if(!['image/jpeg','image/png'].includes(tipo))throw error('Imagen JPG/PNG inválida.');
     lecturas.push({ruta,buffer,info,tipo,huella:hash(buffer)});
    }
    if(new Set(lecturas.map(v=>v.huella)).size>1){j.conflictos++;if(j.detalle.length<100)j.detalle.push('Más de una foto diferente para '+producto+' en «'+u.nombre+'». Se conservó la foto anterior.');continue;}
    const f=lecturas[0];
    const previa=(await p.request().input('producto',sql.NVarChar(254),producto).query(`SELECT r.Huella,r.UbicacionId,u.Activa,u.Prioridad,u.Creado FROM versato.RepositorioImagenes r JOIN versato.UbicacionesImagenes u ON u.Id=r.UbicacionId WHERE r.Producto=@producto`)).recordset[0];
    if(previa&&previa.UbicacionId!==u.id&&previa.Activa&&(previa.Prioridad<u.prioridad||(previa.Prioridad===u.prioridad&&new Date(previa.Creado)<new Date(u.creado)))){j.iguales++;continue;}
    await copiar(f.buffer,f.huella,f.tipo);
    await p.request().input('producto',sql.NVarChar(254),producto).input('id',sql.UniqueIdentifier,u.id).input('nombre',sql.NVarChar(260),path.basename(f.ruta)).input('ruta',sql.NVarChar(1024),path.relative(u.ruta,f.ruta)).input('tipo',sql.VarChar(30),f.tipo).input('hash',sql.Char(64),f.huella).input('bytes',sql.Int,f.buffer.length).input('fecha',sql.DateTime2(3),f.info.mtime).query(`MERGE versato.RepositorioImagenes WITH(HOLDLOCK) AS d USING(SELECT @producto Producto)s ON d.Producto=s.Producto
     WHEN MATCHED THEN UPDATE SET UbicacionId=@id,Nombre=@nombre,RutaRelativa=@ruta,Tipo=@tipo,Huella=@hash,Bytes=@bytes,FechaOrigen=@fecha,Actualizado=SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT(Producto,UbicacionId,Nombre,RutaRelativa,Tipo,Huella,Bytes,FechaOrigen)VALUES(@producto,@id,@nombre,@ruta,@tipo,@hash,@bytes,@fecha);`);
    if(!previa)j.nuevas++;else if(previa.Huella!==f.huella)j.actualizadas++;else j.iguales++;
   }catch(e){anotar(j,producto+': no se pudo validar o copiar la imagen. La foto anterior se conserva.');}
  }
  const final=j.errores||j.conflictos||j.sinAsociar?'CON_OBSERVACIONES':'COMPLETA';j.etapa='Guardando resultado';j.fin=new Date().toISOString();
  for(const u of fuentes)await p.request().input('id',sql.UniqueIdentifier,u.id).input('resumen',sql.NVarChar(sql.MAX),JSON.stringify({...estado(j),estado:final,etapa:'Sincronización finalizada'})).query('UPDATE versato.UbicacionesImagenes SET UltimaSincronizacion=SYSUTCDATETIME(),Resumen=@resumen WHERE Id=@id');
  j.estado=final;j.etapa='Sincronización finalizada';
 }catch(e){j.estado='ERROR';j.etapa='No se pudo completar la sincronización';j.fin=new Date().toISOString();anotar(j,'Verificá la conexión con SQL. Las fotos copiadas previamente se conservan.');}
}
async function iniciar(){
 await exigir();if(trabajo?.estado==='EN_CURSO')throw error('Ya hay una sincronización de imágenes en curso.',409);
 const fuentes=(await ubicaciones()).ubicaciones.filter(u=>u.activa);
 if(!fuentes.length)throw error('Agregá al menos una ubicación activa.');
 if(trabajo?.estado==='EN_CURSO')throw error('Ya hay una sincronización de imágenes en curso.',409);
 const j={id:randomUUID(),estado:'EN_CURSO',etapa:'Preparando sincronización',inicio:new Date().toISOString(),fin:null,ubicacion:'',total:0,procesadas:0,nuevas:0,actualizadas:0,iguales:0,sinAsociar:0,conflictos:0,errores:0,detalle:[]};
 trabajo=j;setImmediate(()=>sincronizar(j,fuentes).catch(()=>{j.estado='ERROR';j.etapa='No se pudo conectar con SQL';j.fin=new Date().toISOString();}));return estado();
}
async function buscarCatalogo(busqueda,pagina){
 const p=await conectar();
 const cte=`WITH origenes AS(
  SELECT r.Producto,r.Nombre,r.Tipo,r.Bytes,CAST(NULL AS varchar(36)) analisisOrigen,CAST(NULL AS nvarchar(254)) factura,u.Nombre ubicacion,r.Actualizado fecha,1 prioridad
  FROM versato.RepositorioImagenes r JOIN versato.UbicacionesImagenes u ON u.Id=r.UbicacionId
  UNION ALL
  SELECT f.Producto,f.Nombre,f.Tipo,f.Bytes,CONVERT(varchar(36),f.AnalisisId),a.Factura,CAST(NULL AS nvarchar(120)),a.Creado,2
  FROM versato.ImagenesProducto f JOIN versato.Analisis a ON a.Id=f.AnalisisId
 ), fotos AS(SELECT *,ROW_NUMBER()OVER(PARTITION BY Producto ORDER BY prioridad,fecha DESC,analisisOrigen) posicion FROM origenes WHERE @busqueda=N'' OR Producto=@busqueda OR Producto LIKE @prefijo)`;
 const r=await p.request().input('busqueda',sql.NVarChar(254),busqueda).input('prefijo',sql.NVarChar(254),busqueda+'.%').input('desplazamiento',sql.Int,pagina*40).query(cte+' SELECT COUNT(*) Total FROM fotos WHERE posicion=1;'+cte+' SELECT Producto PRODUCTO,Nombre nombre,Tipo tipo,Bytes bytes,analisisOrigen,factura,ubicacion,fecha FROM fotos WHERE posicion=1 ORDER BY Producto OFFSET @desplazamiento ROWS FETCH NEXT 40 ROWS ONLY;');
 return {busqueda,pagina,porPagina:40,total:r.recordsets[0][0].Total,fotos:r.recordsets[1]};
}
async function fotoCatalogo(producto){
 const copia=await leerFoto(producto);if(copia)return copia;
 const p=await conectar(),r=await p.request().input('producto',sql.NVarChar(254),producto).query('SELECT TOP(1) f.Tipo,f.Contenido FROM versato.ImagenesProducto f JOIN versato.Analisis a ON a.Id=f.AnalisisId WHERE f.Producto=@producto ORDER BY a.Creado DESC,a.Id DESC');
 const f=r.recordset[0];return f?{tipo:f.Tipo,buffer:f.Contenido}:null;
}
module.exports={RAIZ,instalada,ubicaciones,guardarUbicacion,eliminarUbicacion,validarUbicacion,productoNombre,rutaCopia,copiar,leerFoto,fotosProductos,estado,iniciar,buscarCatalogo,fotoCatalogo};

async function eliminarUbicacion(id,revision){
 if(trabajo?.estado==='EN_CURSO')throw error('Esperá a que finalice la sincronización antes de eliminar ubicaciones.',409);
 if(!/^[a-f\d-]{36}$/i.test(id||'')||!/^[a-f\d-]{36}$/i.test(revision||''))throw error('Volvé a cargar las ubicaciones antes de eliminar.');
 await exigir();const p=await conectar();
 // Baja lógica: conserva las referencias y las fotos; Resumen admite metadatos JSON sin cambiar el esquema.
 const r=await p.request().input('id',sql.UniqueIdentifier,id).input('anterior',sql.UniqueIdentifier,revision).input('revision',sql.UniqueIdentifier,randomUUID()).query(`UPDATE versato.UbicacionesImagenes SET Activa=0,Revision=@revision,Resumen=JSON_MODIFY(COALESCE(Resumen,N'{}'),'$.ubicacionEliminada',CAST(1 AS bit)) WHERE Id=@id AND Revision=@anterior AND ISNULL(JSON_VALUE(Resumen,'$.ubicacionEliminada'),'false')<>'true'`);
 if(!r.rowsAffected[0])throw error('La ubicación cambió o ya fue eliminada. Actualizá el listado.',409);
 return {eliminada:true};
}
