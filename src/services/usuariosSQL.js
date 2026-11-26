const {sql,conectar}=require('./sqlServer');
const {randomUUID}=require('node:crypto');
const {PERFILES,PERMISOS}=require('./permisos');
const {hashClave}=require('./clavesUsuarios');
const error=(mensaje,status=422)=>Object.assign(Error(mensaje),{status});
const publico=r=>r&&({id:r.Id,usuario:r.Usuario,nombre:r.Nombre,perfil:r.Perfil,permisos:JSON.parse(r.Permisos),activo:r.Activo,forzarCambio:r.ForzarCambio,version:r.Version});
async function request(){return (await conectar()).request();}
async function verificar(){try{await (await request()).query('SELECT TOP(0) Id FROM versato.Usuarios; SELECT TOP(0) TokenHash FROM versato.Sesiones; SELECT TOP(0) Id FROM versato.AuditoriaAccesos');}catch(e){throw error('Falta preparar los usuarios en SQL. Ejecutá sql/008_usuarios_y_sesiones.sql.',503);}}
async function buscar(usuario){return (await (await request()).input('usuario',sql.VarChar(64),usuario).query('SELECT * FROM versato.Usuarios WHERE Usuario=@usuario')).recordset[0];}
async function listar(){return (await (await request()).query('SELECT * FROM versato.Usuarios ORDER BY Usuario')).recordset.map(publico);}
async function intentos(id,correcto){await (await request()).input('id',sql.UniqueIdentifier,id).input('ok',sql.Bit,correcto).query('UPDATE versato.Usuarios SET Intentos=CASE WHEN @ok=1 THEN 0 WHEN BloqueadoHasta<=SYSUTCDATETIME() THEN 1 ELSE Intentos+1 END, BloqueadoHasta=CASE WHEN @ok=1 THEN NULL WHEN BloqueadoHasta<=SYSUTCDATETIME() THEN NULL WHEN Intentos>=4 THEN DATEADD(minute,15,SYSUTCDATETIME()) ELSE BloqueadoHasta END WHERE Id=@id');}
async function crearSesion(id,version,token,csrf){await (await request()).input('id',sql.UniqueIdentifier,id).input('version',sql.UniqueIdentifier,version).input('token',sql.Char(64),token).input('csrf',sql.Char(64),csrf).query('DELETE FROM versato.Sesiones WHERE Vence<=SYSUTCDATETIME(); INSERT versato.Sesiones(TokenHash,UsuarioId,VersionUsuario,CsrfHash,Vence) SELECT @token,Id,Version,@csrf,DATEADD(hour,8,SYSUTCDATETIME()) FROM versato.Usuarios WHERE Id=@id AND Version=@version AND Activo=1');}
async function sesion(token){const r=(await (await request()).input('token',sql.Char(64),token).query('SELECT u.*,s.CsrfHash FROM versato.Sesiones s JOIN versato.Usuarios u ON u.Id=s.UsuarioId AND u.Version=s.VersionUsuario WHERE s.TokenHash=@token AND s.Vence>SYSUTCDATETIME() AND u.Activo=1')).recordset[0];return r?{usuario:publico(r),csrf:r.CsrfHash}:null;}
async function salir(token){await (await request()).input('token',sql.Char(64),token).query('DELETE FROM versato.Sesiones WHERE TokenHash=@token');}
async function registrar(usuario,accion,resultado,referencia){await (await request()).input('usuario',sql.VarChar(64),usuario).input('accion',sql.NVarChar(300),accion.slice(0,300)).input('resultado',sql.VarChar(30),String(resultado)).input('referencia',sql.UniqueIdentifier,referencia||null).query('INSERT versato.AuditoriaAccesos(Usuario,Accion,Resultado,Referencia)VALUES(@usuario,@accion,@resultado,@referencia)');}
async function auditoria(){return (await (await request()).query('SELECT TOP(300) Id,Fecha,Usuario,Accion,Resultado,Referencia FROM versato.AuditoriaAccesos ORDER BY Id DESC')).recordset;}
function validar(entrada){
 const usuario=String(entrada.usuario||'').trim().toLowerCase(),nombre=String(entrada.nombre||'').trim(),perfil=entrada.perfil;
 if(!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(usuario)||nombre.length<2||nombre.length>100||!Object.hasOwn(PERFILES,perfil))throw error('Revisá usuario, nombre y perfil. El usuario admite letras sin acentos, números, punto, guion y guion bajo (3 a 64 caracteres).');
 if(entrada.activo!==undefined&&typeof entrada.activo!=='boolean')throw error('El estado del usuario no es válido.');
 const permisos=perfil==='ADMINISTRADOR'?PERFILES.ADMINISTRADOR.permisos:entrada.permisos??PERFILES[perfil].permisos;
 if(!Array.isArray(permisos)||permisos.some(p=>!Object.hasOwn(PERMISOS,p)))throw error('Hay permisos no válidos.');
 return {usuario,nombre,perfil,permisos:[...new Set(permisos)],activo:entrada.activo!==false};
}
function validarTransicion(filas,anterior,v){
 if(anterior?.Perfil==='ADMINISTRADOR'&&anterior.Activo&&(v.perfil!=='ADMINISTRADOR'||!v.activo)&&!filas.some(u=>u.Id!==anterior.Id&&u.Perfil==='ADMINISTRADOR'&&u.Activo))throw error('Debe quedar al menos un administrador activo.',409);
}
async function guardar(entrada,actor,{inicial=false}={}){
 const v=validar(entrada),clave=entrada.clave?await hashClave(entrada.clave):null;if(!entrada.id&&!clave)throw error('Indicá una contraseña inicial.');
 if(entrada.id&&!/^[a-f0-9-]{36}$/i.test(entrada.id))throw error('Usuario no válido.');
 const tx=new sql.Transaction(await conectar());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{
  const filas=(await new sql.Request(tx).query('SELECT Id,Usuario,Perfil,Activo,Version FROM versato.Usuarios WITH(UPDLOCK,HOLDLOCK)')).recordset;
  if(inicial&&filas.length)throw error('Ya existen usuarios. Usá la administración de usuarios.',409);
  const anterior=filas.find(u=>u.Id.toLowerCase()===String(entrada.id||'').toLowerCase());
  if(entrada.id&&(!anterior||anterior.Version!==entrada.version))throw error('El usuario cambió. Recargá la lista.',409);
  validarTransicion(filas,anterior,v);
  if(filas.some(u=>u.Usuario===v.usuario&&u.Id!==anterior?.Id))throw error('Ese usuario ya existe.',409);
  const id=anterior?.Id||randomUUID(),version=randomUUID();const q=new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('usuario',sql.VarChar(64),v.usuario).input('nombre',sql.NVarChar(100),v.nombre).input('perfil',sql.VarChar(30),v.perfil).input('permisos',sql.NVarChar(sql.MAX),JSON.stringify(v.permisos)).input('clave',sql.VarChar(300),clave).input('activo',sql.Bit,v.activo).input('forzar',sql.Bit,!inicial).input('version',sql.UniqueIdentifier,version);
  await q.query(anterior?'UPDATE versato.Usuarios SET Usuario=@usuario,Nombre=@nombre,Perfil=@perfil,Permisos=@permisos,ClaveHash=COALESCE(@clave,ClaveHash),Activo=@activo,Version=@version,ForzarCambio=CASE WHEN @clave IS NOT NULL THEN 1 ELSE ForzarCambio END,Intentos=CASE WHEN @clave IS NOT NULL THEN 0 ELSE Intentos END,BloqueadoHasta=CASE WHEN @clave IS NOT NULL THEN NULL ELSE BloqueadoHasta END WHERE Id=@id':'INSERT versato.Usuarios(Id,Usuario,Nombre,Perfil,Permisos,ClaveHash,Activo,ForzarCambio,Version)VALUES(@id,@usuario,@nombre,@perfil,@permisos,@clave,@activo,@forzar,@version)');
  await new sql.Request(tx).input('u',sql.VarChar(64),actor).input('a',sql.NVarChar(300),(anterior?'Modificar usuario ':'Crear usuario ')+v.usuario+' · '+v.perfil).query("INSERT versato.AuditoriaAccesos(Usuario,Accion,Resultado)VALUES(@u,@a,'OK')");
  await tx.commit();return {id,...v,version};
 }catch(e){await tx.rollback().catch(()=>{});throw e;}
}
async function cambiarClave(id,version,clave){const hash=await hashClave(clave);const r=await (await request()).input('id',sql.UniqueIdentifier,id).input('version',sql.UniqueIdentifier,version).input('hash',sql.VarChar(300),hash).input('nueva',sql.UniqueIdentifier,randomUUID()).query('UPDATE versato.Usuarios SET ClaveHash=@hash,Version=@nueva,ForzarCambio=0,Intentos=0,BloqueadoHasta=NULL WHERE Id=@id AND Version=@version AND Activo=1');if(!r.rowsAffected[0])throw error('La cuenta cambió. Volvé a iniciar sesión.',409);}
module.exports={verificar,buscar,listar,intentos,crearSesion,sesion,salir,registrar,auditoria,guardar,cambiarClave,publico,validar,validarTransicion};
