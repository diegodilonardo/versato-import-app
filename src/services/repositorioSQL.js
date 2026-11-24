const {randomUUID,createHash}=require('crypto'),{gzipSync,gunzipSync}=require('zlib');const {sql,conectar}=require('./sqlServer');const {construirCodAlfa}=require('./modelos');
const huella=b=>createHash('sha256').update(b).digest('hex');const uuid=id=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||'');
function binarios(r){const salida=[];const agregar=(nombre,f)=>{try{salida.push({nombre,buffer:f()});}catch(e){if(e.status!==422)throw e;}};agregar('PRODUCTOS_VERSATO.DBI',()=>require('./productosPresea').exportarProductosDBI(r));for(const tipo of ['modelos','stockadi'])agregar(tipo==='modelos'?'MODELOS_VERSATO.DBI':'PRODUCTOS_VERSATO_STOCKADI.DBI',()=>require('./adicionalesDBI').exportarAdicionalDBI(r,tipo));for(const tipo of ['relformu','relacion'])agregar('PRODUCTOS_'+tipo.toUpperCase()+'.DBI',()=>require('./relacionesDBI').exportarRelacionesDBI(r,tipo));salida.push(...require('./comex').archivosCOMEX(r));return salida;}
async function verificarDuplicados(resultado,files=[],tx){
 const conexion=tx||await conectar();const hashes=require('./duplicados').huellasArchivos(files);
 const facturas=resultado?.facturas?.length?(await new sql.Request(conexion).query("SELECT Id,Factura FROM versato.Analisis WHERE Factura IS NOT NULL AND Estado <> 'CANCELADA'")).recordset:[];
 const archivos=hashes.length?(await new sql.Request(conexion).input('huellas',sql.NVarChar(sql.MAX),JSON.stringify(hashes)).query(`
  SELECT a.AnalisisId, a.Nombre, a.Huella FROM versato.ArchivosOrigen a
  JOIN versato.Analisis factura ON factura.Id = a.AnalisisId
  JOIN OPENJSON(@huellas) h ON a.Huella = h.value
  WHERE factura.Estado <> 'CANCELADA'
 `)).recordset:[];
 const error=require('./duplicados').detectarDuplicado(resultado,files,facturas,archivos);if(error)throw error;
}
async function fotosDisponibles(productos,tx){
 if(!productos?.length)return [];
 const conexion=tx||await conectar();return (await new sql.Request(conexion).input('productos',sql.NVarChar(sql.MAX),JSON.stringify([...new Set(productos)])).query(`WITH fotos AS (
 SELECT f.Producto AS PRODUCTO,f.Nombre AS nombre,f.Tipo AS tipo,f.Bytes AS bytes,f.Huella AS huella,CONVERT(varchar(36),f.AnalisisId) AS analisisOrigen,
 ROW_NUMBER() OVER(PARTITION BY f.Producto ORDER BY a.Creado DESC,a.Id DESC) AS posicion
 FROM versato.ImagenesProducto f JOIN versato.Analisis a ON a.Id=f.AnalisisId
 JOIN OPENJSON(@productos) p ON f.Producto=p.value COLLATE Latin1_General_100_BIN2)
 SELECT PRODUCTO,nombre,tipo,bytes,huella,analisisOrigen FROM fotos WHERE posicion=1`)).recordset;
}
function crearRepositorioSQL(){return{
 fotosDisponibles,
 verificarDuplicados,
 async estadoFactura(id) {
  if (!uuid(id)) return null;
  const pool = await conectar();
  const { recordset } = await pool.request().input('id', sql.UniqueIdentifier, id)
   .query('SELECT Estado FROM versato.Analisis WHERE Id=@id');
  return recordset[0]?.Estado ?? null;
 },
 async cancelarFactura(id) {
  if (!uuid(id)) throw Object.assign(new Error('Factura no encontrada.'), { status: 404 });
  const pool = await conectar();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
   const { recordset } = await new sql.Request(tx).input('id', sql.UniqueIdentifier, id).query(`
    SELECT Estado FROM versato.Analisis WITH (UPDLOCK,HOLDLOCK) WHERE Id=@id;
   `);
   if (!recordset.length) throw Object.assign(new Error('Factura no encontrada.'), { status: 404 });
   if (recordset[0].Estado !== 'CANCELADA') {
    const envio = await new sql.Request(tx).input('id', sql.UniqueIdentifier, id)
     .query("SELECT TOP(1) Id FROM versato.EnviosFTP WHERE AnalisisId=@id AND Estado='EN_CURSO'");
    if (envio.recordset.length) throw Object.assign(new Error('Hay un envío sin finalizar. Revisá el historial de envíos antes de cancelar.'), { status: 409 });
    await new sql.Request(tx).input('id', sql.UniqueIdentifier, id)
     .query("UPDATE versato.Analisis SET Estado='CANCELADA' WHERE Id=@id");
   }
   await tx.commit();
   return { Estado: 'CANCELADA' };
  } catch (error) { await tx.rollback().catch(() => {}); throw error; }
 },
 async guardar(resultado,files=[],{preparar,imagenes=[]}={}){const id=randomUUID(),lote=randomUUID();resultado.analisis={id,persistente:true,vence:null,creado:new Date().toISOString()};const pool=await conectar(),tx=new sql.Transaction(pool);await tx.begin();try{
  await new sql.Request(tx).query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource=N'VERSATO_CARGAS',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=30000;IF @r<0 THROW 51000,'No se pudo comprobar la carga',1;");
  await verificarDuplicados(resultado,files,tx);
  if(preparar)await preparar(tx);
  require('./detalleModulo').actualizarDetallesPropuestos(resultado);imagenes=require('./imagenesProducto').reutilizarFotos(resultado,await fotosDisponibles((resultado.productos?.listado||[]).map(p=>p.PRODUCTO),tx),imagenes);
  require('./historialAltas').conservarAltas(resultado);
  const archivos=binarios(resultado);
  await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('factura',sql.NVarChar(100),resultado.facturas?.join(', ')||null).input('estado',sql.NVarChar(30),resultado.estado).input('resumen',sql.NVarChar(sql.MAX),JSON.stringify({cruce:resultado.resumen,productos:resultado.exportacionProductosPresea})).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('INSERT versato.Analisis(Id,Factura,Estado,Resumen,Resultado)VALUES(@id,@factura,@estado,@resumen,@resultado)');
  await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('lote',sql.UniqueIdentifier,lote).query('INSERT versato.Lotes(Id,AnalisisId)VALUES(@lote,@id)');
  for(const a of resultado.archivos||[]){const file=files[(resultado.archivos||[]).indexOf(a)];if(!file)continue;await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('tipo',sql.NVarChar(40),a.tipo).input('nombre',sql.NVarChar(260),a.archivo).input('hoja',sql.NVarChar(260),a.hoja).input('bytes',sql.BigInt,file.buffer.length).input('hash',sql.Char(64),huella(file.buffer)).query('INSERT versato.ArchivosOrigen VALUES(@id,@tipo,@nombre,@hoja,@bytes,@hash)');}
  await require('./datosArchivosSQL').guardarDatosArchivos(tx,id,resultado,files);
  await require('./imagenesProducto').guardarFotos(tx,id,imagenes);
  const p=resultado.productos;for(const [tipo,m]of Object.entries({productos:p.maestro,modelos:p.modulos?.maestro,marcas:p.modulos?.maestroMarcas,rubros:p.modulos?.maestroRubrosFact,sueltos:p.sueltos?.maestro})){if(!m)continue;await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('tipo',sql.NVarChar(40),tipo).input('nombre',sql.NVarChar(260),m.archivo||null).input('hash',sql.Char(64),m.huella||null).input('fecha',sql.NVarChar(40),m.actualizado||null).input('disponible',sql.Bit,!!m.disponible).query('INSERT versato.MaestrosAnalisis VALUES(@id,@tipo,@nombre,@hash,@fecha,@disponible)');}
  for(const a of archivos)await new sql.Request(tx).input('lote',sql.UniqueIdentifier,lote).input('nombre',sql.NVarChar(100),a.nombre).input('registros',sql.Int,(a.registros??a.buffer.readUInt32LE(4))).input('bytes',sql.BigInt,a.buffer.length).input('hash',sql.Char(64),huella(a.buffer)).input('contenido',sql.VarBinary(sql.MAX),a.buffer).query('INSERT versato.ArchivosGenerados VALUES(@lote,@nombre,@registros,@bytes,@hash,@contenido)');
  for(const r of p.modulos?.filas||[])if(r.reservaId)await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('reserva',sql.BigInt,r.reservaId).query('INSERT versato.AnalisisReservas VALUES(@id,@reserva)');
  await tx.commit();return resultado.analisis;
 }catch(e){await tx.rollback().catch(()=>{});throw e;}},
 async obtener(id){if(!uuid(id))return null;const pool=await conectar(),r=await pool.request().input('id',sql.UniqueIdentifier,id).query('SELECT Estado, Resultado FROM versato.Analisis WHERE Id=@id');if(!r.recordset[0])return null;const resultado=JSON.parse(gunzipSync(r.recordset[0].Resultado).toString('utf8'));if(r.recordset[0].Estado==='CANCELADA')resultado.analisis.cancelada=true;const historico=(await pool.request().input('id',sql.UniqueIdentifier,id).query("SELECT TOP(1) g.Contenido FROM versato.ArchivosGenerados g JOIN versato.Lotes l ON l.Id=g.LoteId WHERE l.AnalisisId=@id AND g.Nombre='PRODUCTOS_VERSATO.DBI'")).recordset[0]?.Contenido;require('./historialAltas').conservarAltas(resultado,[],historico);require('./imagenesProducto').reutilizarFotos(resultado,await fotosDisponibles((resultado.productos?.listado||[]).map(p=>p.PRODUCTO)));if(resultado.archivoDeposito)resultado.archivoDeposito=require('./archivoDeposito').agregarCodigosAlfa(resultado.archivoDeposito,resultado);if(resultado.informeCorreo)resultado.informeCorreo.predeterminados=require('./correoFactura').predeterminadosCorreo(resultado.informeCorreo);return resultado;},
 async archivo(id,nombre){if(!uuid(id))return null;const p=await conectar(),r=await p.request().input('id',sql.UniqueIdentifier,id).input('nombre',sql.NVarChar(100),nombre).query('SELECT a.Contenido FROM versato.ArchivosGenerados a JOIN versato.Lotes l ON l.Id=a.LoteId WHERE l.AnalisisId=@id AND a.Nombre=@nombre AND a.Bytes>0');return r.recordset[0]?.Contenido||null;},
 async actualizarMaestros(id,preparar){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
  const tx=new sql.Transaction(await conectar());await tx.begin();try{
   await new sql.Request(tx).query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource=N'VERSATO_CARGAS',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=30000;IF @r<0 THROW 51000,'Hay otra actualización en curso',1;");
   const registro=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];
   if(!registro)throw Object.assign(new Error('No se encontró el análisis.'),{status:404});
   const anterior=JSON.parse(gunzipSync(registro.Resultado).toString('utf8'));
   const contenidos=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Tipo,Contenido FROM versato.ContenidoOrigen WHERE AnalisisId=@id')).recordset;
   const files=(anterior.archivos||[]).map(a=>{const c=contenidos.find(c=>c.Tipo===a.tipo);if(!c)throw Object.assign(new Error('Faltan archivos de origen guardados. No se modificó el análisis.'),{status:422});return {originalname:a.archivo,buffer:gunzipSync(c.Contenido)};});
   const respaldoAltas=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query("SELECT TOP(1) g.Contenido FROM versato.ArchivosGenerados g JOIN versato.Lotes l ON l.Id=g.LoteId WHERE l.AnalisisId=@id AND g.Nombre='PRODUCTOS_VERSATO.DBI'")).recordset[0]?.Contenido;require('./historialAltas').conservarAltas(anterior,[],respaldoAltas);
   const resultado=await preparar(anterior,files,tx);require('./historialAltas').conservarAltas(resultado,anterior.historialAltasProductos);
   resultado.actualizacionesMaestros=[...(anterior.actualizacionesMaestros||[]),{fecha:new Date().toISOString(),antes:anterior.exportacionProductosPresea,despues:resultado.exportacionProductosPresea,maestros:{productos:resultado.productos.maestro?.huella,sueltos:resultado.productos.sueltos?.maestro?.huella}}];
   const archivos=binarios(resultado),lote=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Id FROM versato.Lotes WHERE AnalisisId=@id')).recordset[0];if(!lote)throw new Error('No se encontró el lote.');
   // Desactivar archivos obsoletos sin borrar su contenido ni los originales.
   await new sql.Request(tx).input('lote',sql.UniqueIdentifier,lote.Id).query("UPDATE versato.ArchivosGenerados SET Registros=0,Bytes=0 WHERE LoteId=@lote AND (Nombre LIKE '%.DBI' OR Nombre LIKE 'SALIDA %APP COMEX%')");
   for(const a of archivos)await new sql.Request(tx).input('lote',sql.UniqueIdentifier,lote.Id).input('nombre',sql.NVarChar(100),a.nombre).input('registros',sql.Int,a.registros??a.buffer.readUInt32LE(4)).input('bytes',sql.BigInt,a.buffer.length).input('hash',sql.Char(64),huella(a.buffer)).input('contenido',sql.VarBinary(sql.MAX),a.buffer).query('UPDATE versato.ArchivosGenerados SET Registros=@registros,Bytes=@bytes,Huella=@hash,Contenido=@contenido WHERE LoteId=@lote AND Nombre=@nombre; IF @@ROWCOUNT=0 INSERT versato.ArchivosGenerados VALUES(@lote,@nombre,@registros,@bytes,@hash,@contenido)');
   const p=resultado.productos;for(const [tipo,m]of Object.entries({productos:p.maestro,modelos:p.modulos?.maestro,marcas:p.modulos?.maestroMarcas,rubros:p.modulos?.maestroRubrosFact,sueltos:p.sueltos?.maestro})){if(!m)continue;await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('tipo',sql.NVarChar(40),tipo).input('nombre',sql.NVarChar(260),m.archivo||null).input('hash',sql.Char(64),m.huella||null).input('fecha',sql.NVarChar(40),m.actualizado||null).input('disponible',sql.Bit,!!m.disponible).query('UPDATE versato.MaestrosAnalisis SET Nombre=@nombre,Huella=@hash,Actualizado=@fecha,Disponible=@disponible WHERE AnalisisId=@id AND Tipo=@tipo; IF @@ROWCOUNT=0 INSERT versato.MaestrosAnalisis VALUES(@id,@tipo,@nombre,@hash,@fecha,@disponible)');}
   for(const r of p.modulos?.filas||[])if(r.reservaId)await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('reserva',sql.BigInt,r.reservaId).query('IF NOT EXISTS(SELECT 1 FROM versato.AnalisisReservas WHERE AnalisisId=@id AND ReservaId=@reserva) INSERT versato.AnalisisReservas VALUES(@id,@reserva)');
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('estado',sql.NVarChar(30),resultado.estado).input('resumen',sql.NVarChar(sql.MAX),JSON.stringify({cruce:resultado.resumen,productos:resultado.exportacionProductosPresea})).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Estado=@estado,Resumen=@resumen,Resultado=@resultado WHERE Id=@id');
   await tx.commit();return resultado;
  }catch(error){await tx.rollback().catch(()=>{});throw error;}
 },
 async actualizarInformeCorreo(id,maestro,correccion){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
  const pool=await conectar(),tx=new sql.Transaction(pool);await tx.begin();try{
   const fila=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];if(!fila)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
   const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8'));
   const filas=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query("SELECT Tipo,FilaExcel,Normalizado,Errores FROM versato.FilasOrigen WHERE AnalisisId=@id AND Tipo IN('PACKING_LIST','CODIGOS_BARRA') ORDER BY Tipo,FilaExcel")).recordset;
   const previews={};for(const r of filas){if(!previews[r.Tipo])previews[r.Tipo]={registros:[]};previews[r.Tipo].registros.push({fila:r.FilaExcel,datos:JSON.parse(r.Normalizado),errores:JSON.parse(r.Errores)});}
   if(!previews.PACKING_LIST||!previews.CODIGOS_BARRA)throw Object.assign(new Error('Este análisis no conserva las filas necesarias para el correo.'),{status:422});
   if(correccion){const cambio=require('./correccionesClientes').prepararCorreccion(resultado,previews,maestro,correccion);resultado.correccionesClientes=[...(resultado.correccionesClientes||[]),cambio];}
   const efectivos=require('./correccionesClientes').aplicarCorreccionesClientes(previews,resultado.correccionesClientes);
   resultado.controlClientes=require('./controlClientes').controlarClientes(efectivos,maestro);
   resultado.informeCorreo=require('./correoFactura').prepararInforme(resultado,efectivos,maestro);
   const {prepararArchivoDeposito,exportarDeposito}=require('./archivoDeposito');
   resultado.archivoDeposito=prepararArchivoDeposito(resultado,efectivos,resultado.informeCorreo.total);
   if(!resultado.archivoDeposito.bloqueada){
    const a=resultado.archivoDeposito,buffer=exportarDeposito(a),lote=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Id FROM versato.Lotes WHERE AnalisisId=@id')).recordset[0];if(!lote)throw new Error('No se encontró el lote.');
    await new sql.Request(tx).input('lote',sql.UniqueIdentifier,lote.Id).input('nombre',sql.NVarChar(100),a.nombre).input('registros',sql.Int,a.hojas[2].filas.length).input('bytes',sql.BigInt,buffer.length).input('hash',sql.Char(64),huella(buffer)).input('contenido',sql.VarBinary(sql.MAX),buffer).query('UPDATE versato.ArchivosGenerados SET Registros=@registros,Bytes=@bytes,Huella=@hash,Contenido=@contenido WHERE LoteId=@lote AND Nombre=@nombre; IF @@ROWCOUNT=0 INSERT versato.ArchivosGenerados VALUES(@lote,@nombre,@registros,@bytes,@hash,@contenido)');
   }
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Resultado=@resultado WHERE Id=@id');
   await tx.commit();return resultado.informeCorreo;
  }catch(error){await tx.rollback().catch(()=>{});throw error;}
 },
 async actualizarFlujoPreciosNV(id,revision,actualizar){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});const tx=new sql.Transaction(await conectar());await tx.begin();try{
   const fila=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];if(!fila)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
   const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8'));
   if(!revision||resultado.preciosNV?.revision!==revision)throw Object.assign(new Error('Los precios cambiaron. Volvé a abrir la factura.'),{status:409});
   resultado.preciosNV=await actualizar(resultado.preciosNV);
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Resultado=@resultado WHERE Id=@id');await tx.commit();return resultado.preciosNV;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
 },
 async guardarControlNV(id,maestro){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});const tx=new sql.Transaction(await conectar());await tx.begin();try{
   const fila=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];if(!fila)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
   const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8')),control=require('./controlNVPresea').compararNV(resultado,maestro);resultado.controlNVPresea=control;
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Resultado=@resultado WHERE Id=@id');await tx.commit();return control;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
 },
 async guardarPreciosNV(id,preparar){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});const tx=new sql.Transaction(await conectar());await tx.begin();try{
   const fila=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];if(!fila)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
   const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8')),precios=await preparar(resultado);precios.revision=randomUUID();
   if (precios.comprobacionMaestro) precios.comprobacionMaestro.revision = precios.revision;
   resultado.preciosNV=precios;
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Resultado=@resultado WHERE Id=@id');await tx.commit();return precios;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
 },
 async guardarControlPedidos(id,origen){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
  const tx=new sql.Transaction(await conectar());await tx.begin();try{
   const fila=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];
   if(!fila)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
   const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8'));
   const datos=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query("SELECT FilaExcel,Normalizado,Errores FROM versato.FilasOrigen WHERE AnalisisId=@id AND Tipo='PACKING_LIST' ORDER BY FilaExcel")).recordset;
   if(!datos.length)throw Object.assign(new Error('No hay filas de Packing guardadas para comparar.'),{status:422});
   const previews={PACKING_LIST:{registros:datos.map(r=>({fila:r.FilaExcel,datos:JSON.parse(r.Normalizado),errores:JSON.parse(r.Errores)}))}};
   const control=require('./controlPedidos').compararPedidos(origen,previews,resultado.correccionesClientes||[]);
   resultado.historialControlPedidos=[...(resultado.historialControlPedidos||[]),...(resultado.controlPedidos?[resultado.controlPedidos]:[])];resultado.controlPedidos=control;
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Resultado=@resultado WHERE Id=@id');
   await tx.commit();return control;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
 },
 async guardarNV(id,preparar){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
  const tx=new sql.Transaction(await conectar());await tx.begin();try{
   const fila=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];
   if(!fila)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
   const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8'));
   const nv=await preparar(resultado);if(nv!==resultado.notasVenta){nv.revision=randomUUID();nv.correccionesOrigen=JSON.stringify(resultado.correccionesClientes||[]);resultado.notasVenta=nv;await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Resultado=@resultado WHERE Id=@id');}
   await tx.commit();return nv;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
 },
 async datosNV(id){
  if(!uuid(id))return null;
  const pool=await conectar(),filas=(await pool.request().input('id',sql.UniqueIdentifier,id).query("SELECT Tipo,FilaExcel,Normalizado,Errores FROM versato.FilasOrigen WHERE AnalisisId=@id AND Tipo IN('PACKING_LIST','CODIGOS_BARRA') ORDER BY Tipo,FilaExcel")).recordset;
  const previews={};for(const r of filas){if(!previews[r.Tipo])previews[r.Tipo]={registros:[]};previews[r.Tipo].registros.push({fila:r.FilaExcel,datos:JSON.parse(r.Normalizado),errores:JSON.parse(r.Errores)});}return previews;
 },
 async actualizarCOMEX(id,maestro){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
  const pool=await conectar(),tx=new sql.Transaction(pool);await tx.begin();try{
   const fila=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];if(!fila)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
   const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8'));
   const filas=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query("SELECT r.Tipo,r.FilaExcel,r.Normalizado,r.Errores,f.UNIT FROM versato.FilasOrigen r LEFT JOIN versato.FacturasDatos f ON f.FilaId=r.Id WHERE r.AnalisisId=@id AND r.Tipo IN('PACKING_LIST','CODIGOS_BARRA','FACTURA') ORDER BY r.Tipo,r.FilaExcel")).recordset;
   const previews={};for(const r of filas){if(!previews[r.Tipo])previews[r.Tipo]={registros:[]};previews[r.Tipo].registros.push({fila:r.FilaExcel,datos:JSON.parse(r.Normalizado),errores:JSON.parse(r.Errores),...(r.Tipo==='FACTURA'?{valores:{UNIT:r.UNIT}}:{})});}
   if(!previews.PACKING_LIST||!previews.CODIGOS_BARRA)throw Object.assign(new Error('Este análisis no conserva las filas necesarias para COMEX.'),{status:422});
   resultado.comex=require('./comex').prepararCOMEX(resultado,previews,maestro);
   const lote=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Id FROM versato.Lotes WHERE AnalisisId=@id')).recordset[0];if(!lote)throw new Error('No existe el lote del análisis.');
   for(const a of require('./comex').archivosCOMEX(resultado))await new sql.Request(tx).input('lote',sql.UniqueIdentifier,lote.Id).input('nombre',sql.NVarChar(100),a.nombre).input('registros',sql.Int,a.registros).input('bytes',sql.BigInt,a.buffer.length).input('hash',sql.Char(64),huella(a.buffer)).input('contenido',sql.VarBinary(sql.MAX),a.buffer).query('UPDATE versato.ArchivosGenerados SET Registros=@registros,Bytes=@bytes,Huella=@hash,Contenido=@contenido WHERE LoteId=@lote AND Nombre=@nombre; IF @@ROWCOUNT=0 INSERT versato.ArchivosGenerados VALUES(@lote,@nombre,@registros,@bytes,@hash,@contenido)');
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Resultado=@resultado WHERE Id=@id');
   await tx.commit();return resultado.comex;
  }catch(error){await tx.rollback().catch(()=>{});throw error;}
 },
 async actualizarFotos(id,fotos){
  if(!uuid(id))throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
  const pool=await conectar(),tx=new sql.Transaction(pool);await tx.begin();try{
   await new sql.Request(tx).query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource=N'VERSATO_CARGAS',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=30000;IF @r<0 THROW 51000,'No se pudo comprobar la carga',1;");
   const fila=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id')).recordset[0];
   if(!fila)throw Object.assign(new Error('Análisis no encontrado.'),{status:404});
   const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8'));
   const {asociarFotos,reutilizarFotos,guardarFotos}=require('./imagenesProducto');const asociadas=asociarFotos(resultado,fotos);
   const nuevas=reutilizarFotos(resultado,await fotosDisponibles((resultado.productos?.listado||[]).map(p=>p.PRODUCTO),tx),asociadas);
   await guardarFotos(tx,id,nuevas);
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('resultado',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(JSON.stringify(resultado)))).query('UPDATE versato.Analisis SET Resultado=@resultado WHERE Id=@id');
   await tx.commit();return resultado;
  }catch(error){await tx.rollback().catch(()=>{});throw error;}
 },
 async buscarFotos(busqueda,pagina){
  const pool=await conectar(),cte=`WITH fotos AS(SELECT f.Producto,f.Nombre,f.Tipo,f.Bytes,f.AnalisisId,a.Factura,ROW_NUMBER() OVER(PARTITION BY f.Producto ORDER BY a.Creado DESC,a.Id DESC) AS posicion FROM versato.ImagenesProducto f JOIN versato.Analisis a ON a.Id=f.AnalisisId WHERE @busqueda=N'' OR f.Producto=@busqueda OR f.Producto LIKE @prefijo)`;
  const r=await pool.request().input('busqueda',sql.NVarChar(254),busqueda).input('prefijo',sql.NVarChar(254),busqueda+'.%').input('desplazamiento',sql.Int,pagina*40).query(cte+' SELECT COUNT(*) AS Total FROM fotos WHERE posicion=1; '+cte+' SELECT Producto AS PRODUCTO,Nombre AS nombre,Tipo AS tipo,Bytes AS bytes,CONVERT(varchar(36),AnalisisId) AS analisisOrigen,Factura AS factura FROM fotos WHERE posicion=1 ORDER BY Producto OFFSET @desplazamiento ROWS FETCH NEXT 40 ROWS ONLY;');
  return {busqueda,pagina,porPagina:40,total:r.recordsets[0][0].Total,fotos:r.recordsets[1]};
 },
 async imagen(id,producto){
  if(!uuid(id))return null;const pool=await conectar();
  const leer=async origen=>(await pool.request().input('id',sql.UniqueIdentifier,origen).input('producto',sql.NVarChar(254),producto).query('SELECT Tipo,Contenido FROM versato.ImagenesProducto WHERE AnalisisId=@id AND Producto=@producto')).recordset[0];
  let foto=await leer(id);
  if(!foto){const fila=(await pool.request().input('id',sql.UniqueIdentifier,id).query('SELECT Resultado FROM versato.Analisis WHERE Id=@id')).recordset[0];if(!fila)return null;const resultado=JSON.parse(gunzipSync(fila.Resultado).toString('utf8'));if(!(resultado.productos?.listado||[]).some(p=>p.PRODUCTO===producto))return null;const disponible=(await fotosDisponibles([producto]))[0];if(disponible)foto=await leer(disponible.analisisOrigen);}
  return foto?{tipo:foto.Tipo,buffer:foto.Contenido}:null;
 },
 async listar(){const p=await conectar(),r=await p.request().query("SELECT TOP(100) a.Id,a.Creado,a.Factura,a.Estado,a.Resumen,a.Resultado,(SELECT TOP(1) g.Contenido FROM versato.ArchivosGenerados g JOIN versato.Lotes l ON l.Id=g.LoteId WHERE l.AnalisisId=a.Id AND g.Nombre='PRODUCTOS_VERSATO.DBI') AS AltasHistoricas,(SELECT Filas FROM versato.ConjuntosDatos WHERE AnalisisId=a.Id) AS FilasEstructuradas,(SELECT COUNT(*) FROM versato.ArchivosGenerados g JOIN versato.Lotes l ON l.Id=g.LoteId WHERE l.AnalisisId=a.Id AND g.Nombre LIKE '%.DBI' AND g.Bytes>0) AS Archivos,e.Estado AS UltimoEnvio,e.Inicio AS FechaEnvio FROM versato.Analisis a OUTER APPLY(SELECT TOP(1) Estado,Inicio FROM versato.EnviosFTP WHERE AnalisisId=a.Id ORDER BY Inicio DESC)e ORDER BY a.Creado DESC");return r.recordset.map(r=>{const {Resultado,AltasHistoricas,...fila}=r;const resultado=JSON.parse(gunzipSync(Resultado).toString('utf8'));require('./historialAltas').conservarAltas(resultado,[],AltasHistoricas);const total=resultado.resumenMarcas?.total;return {...fila,Resumen:JSON.parse(r.Resumen),Altas:resultado.resumenAltasProductos,Totales:total?{pares:total.paresFactura??total.paresPacking,cajas:total.cajasFactura??total.cajasPacking,importe:total.importeFactura}:null};});},
 async iniciarEnvio(id,destino){const p=await conectar(),envio=randomUUID();const insercion=await p.request().input('id',sql.UniqueIdentifier,envio).input('analisis',sql.UniqueIdentifier,id).input('destino',sql.NVarChar(260),destino).query("INSERT versato.EnviosFTP(Id,AnalisisId,Estado,Destino) SELECT @id,Id,'EN_CURSO',@destino FROM versato.Analisis WITH (UPDLOCK,HOLDLOCK) WHERE Id=@analisis AND Estado<>'CANCELADA'");if(!insercion.rowsAffected[0])throw Object.assign(new Error('La factura ya no está disponible para enviar.'),{status:409});return envio;},
 async finalizarEnvio(id,envio){const p=await conectar();await p.request().input('id',sql.UniqueIdentifier,id).input('estado',sql.NVarChar(30),envio.ok?'COMPLETO':envio.archivos?.some(a=>a.estado==='ENVIADO')?'PARCIAL':'ERROR').input('detalle',sql.NVarChar(sql.MAX),JSON.stringify(envio)).query('UPDATE versato.EnviosFTP SET Fin=SYSUTCDATETIME(),Estado=@estado,Detalle=@detalle WHERE Id=@id');},
 async envios(id){if(!uuid(id))return[];const p=await conectar(),r=await p.request().input('id',sql.UniqueIdentifier,id).query('SELECT Id,Inicio,Fin,Estado,Destino,Detalle FROM versato.EnviosFTP WHERE AnalisisId=@id ORDER BY Inicio DESC');return r.recordset.map(r=>({...r,Detalle:r.Detalle?JSON.parse(r.Detalle):null}));}
};}
async function reservarModulos(productos,maestro,transaccion){const filas=productos.modulos?.filas||[];if(!filas.length)return;const tx=transaccion||new sql.Transaction(await conectar()),actualizaciones=[];if(!transaccion)await tx.begin();try{
 await new sql.Request(tx).query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource=N'VERSATO_MODC',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;IF @r<0 THROW 51000,'No se pudo reservar MODC',1;");
 const reservas=(await new sql.Request(tx).query('SELECT Id,ClaveFuente,Anio,Marca,MODC FROM versato.ReservasMODC')).recordset;const usados=new Set(reservas.map(r=>r.MODC));const alfas=new Set();if(maestro?.disponible)for(const grupo of maestro.indice.values())for(const r of grupo){if(r.MODC)usados.add(r.MODC);if(r.COD_ALFA)alfas.add(r.COD_ALFA.toUpperCase());}
 for(const r of filas){if(!r.MODC||!r.ultimoMODC||!r.COD_ALFAB1)continue;let reserva=reservas.find(v=>v.ClaveFuente===r.COD_ALFAB1);
  if(reserva&&reserva.Marca!==r.DMARCA)throw new Error('Reserva con marca diferente.');
  if(!reserva){const m=/^([A-Z]+)(\d+)$/.exec(r.ultimoMODC);if(!m)continue;let n=Number(m[2]);for(const codigo of usados){const a=/^([A-Z]+)(\d+)$/.exec(codigo);if(a&&a[1]===m[1])n=Math.max(n,Number(a[2]));}n++;if(n>=10**m[2].length)throw new Error('Correlativo MODC agotado.');const modc=m[1]+String(n).padStart(m[2].length,'0');const insert=await new sql.Request(tx).input('clave',sql.NVarChar(254),r.COD_ALFAB1).input('anio',sql.Char(2),r.ANIO_COD_ALFA).input('marca',sql.NVarChar(100),r.DMARCA).input('modc',sql.VarChar(32),modc).query('INSERT versato.ReservasMODC(ClaveFuente,Anio,Marca,MODC) OUTPUT inserted.Id VALUES(@clave,@anio,@marca,@modc)');reserva={Id:insert.recordset[0].Id,MODC:modc,ClaveFuente:r.COD_ALFAB1,Anio:r.ANIO_COD_ALFA,Marca:r.DMARCA};reservas.push(reserva);usados.add(modc);}
  const alfa=construirCodAlfa(reserva.MODC,r.SIZE_RUN,reserva.Anio,{rubro:r.RUBROS,tipo:r.CLASIFIC});const error=!alfa?'COD_ALFA inválido para el MODC reservado.':alfas.has(alfa)?'COD_ALFA reservado ya existe en el maestro.':null;actualizaciones.push({r,MODC:reserva.MODC,COD_ALFA:alfa,ANIO_COD_ALFA:reserva.Anio,reservaId:reserva.Id,errorCodAlfa:error,estado:error?'REVISAR_COD_ALFA':'MODC_RESERVADO'});
 }
 if(!transaccion)await tx.commit();for(const {r,...datos}of actualizaciones)Object.assign(r,datos);
 productos.modulos.nota=productos.modulos.nota.replace('No reserva ni modifica el maestro ni Presea;','Reserva MODC en la base local sin modificar el maestro ni Presea;');
 productos.modulos.resumen.conMODC=filas.filter(r=>r.MODC).length;productos.modulos.resumen.conCodAlfa=filas.filter(r=>r.COD_ALFA&&!r.errorCodAlfa).length;productos.modulos.resumen.pendientes=filas.filter(r=>r.errorCodAlfa||r.erroresDatos?.length||!r.MODC).length;
 }catch(e){await tx.rollback().catch(()=>{});throw e;}}
module.exports={crearRepositorioSQL,reservarModulos,binarios};
