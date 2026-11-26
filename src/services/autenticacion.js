const express=require('express'),path=require('node:path');
const {randomBytes,randomUUID}=require('node:crypto');
const {comprobarClave,huella}=require('./clavesUsuarios');
const {PERFILES,PERMISOS,tiene,permisoRuta,inicio}=require('./permisos');
const COOKIE='versato_sesion';
function crear({almacen=require('./usuariosSQL'),habilitada=()=>process.env.AUTH_ENABLED==='true',segura=()=>process.env.AUTH_COOKIE_SECURE!=='false',ahora=()=>Date.now()}={}){
 const intentosIP=new Map();let ocupados=0;
 const hashFicticio=['scrypt',32768,8,3,randomBytes(16).toString('hex'),randomBytes(64).toString('hex')].join('$');
 const error=(t,status)=>Object.assign(Error(t),{status});
 const cookie=req=>{const partes=String(req.headers.cookie||'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(COOKIE+'='));return partes.length===1&&/^[a-f0-9]{64}$/.test(partes[0].slice(COOKIE.length+1))?partes[0].slice(COOKIE.length+1):null;};
 function origen(req){const permitido=(req.secure?'https':'http')+'://'+req.get('host');if(req.get('origin')!==permitido)throw error('Origen de la solicitud no válido. Recargá la página.',403);}
 function ponerCookie(res,token){res.cookie(COOKIE,token,{httpOnly:true,sameSite:'strict',secure:segura(),path:'/',maxAge:8*60*60*1000});}
 const borrarCookie=res=>res.clearCookie(COOKIE,{httpOnly:true,sameSite:'strict',secure:segura(),path:'/'});
 async function identificar(req){const token=cookie(req);if(!token)return null;const sesion=await almacen.sesion(huella(token));if(sesion){req.usuario=sesion.usuario;req.tokenHash=huella(token);req.csrf=huella('csrf:'+token);req.csrfHash=sesion.csrf;}return sesion;}
 function csrf(req){origen(req);const valor=req.get('x-csrf-token')||req.body?._csrf;if(typeof valor!=='string'||valor.length!==64||huella(valor)!==req.csrfHash)throw error('La sesión de seguridad cambió. Recargá la página.',403);}
 async function sesionRequerida(req,res,next){try{if(!habilitada())throw error('Primero habilitá los usuarios en el servidor.',503);if(!await identificar(req))return res.status(401).json({error:'Iniciá sesión para continuar.'});if(!['GET','HEAD'].includes(req.method))csrf(req);next();}catch(e){next(e);}}
 function instalar(app){
  const router=express.Router();router.use(express.json({limit:'32kb'}));router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/me',async(req,res,next)=>{try{if(!habilitada())return res.json({habilitada:false});const s=await identificar(req);if(!s)return res.status(401).json({error:'Iniciá sesión para continuar.',habilitada:true});res.json({habilitada:true,usuario:req.usuario,csrf:req.csrf,inicio:inicio(req.usuario)});}catch(e){next(e);}});
  router.post('/login',async(req,res,next)=>{
   let tomado=false;
   try{
    if(!habilitada())throw error('El acceso por usuarios todavía no está habilitado.',503);origen(req);
    if(segura()&&!req.secure)throw error('Usá la dirección HTTPS configurada para iniciar sesión.',400);
    const ip=req.ip||req.socket.remoteAddress||'local',t=ahora();for(const [k,v]of intentosIP)if(t-v.inicio>15*60000)intentosIP.delete(k);
    const tasa=intentosIP.get(ip)||{inicio:t,cantidad:0};tasa.cantidad++;intentosIP.set(ip,tasa);
    if(tasa.cantidad>30){res.set('Retry-After',String(Math.ceil((15*60000-(t-tasa.inicio))/1000)));throw error('Demasiados intentos desde este equipo. Esperá unos minutos y volvé a intentar.',429);}
    if(ocupados>=2){res.set('Retry-After','5');throw error('Hay otros accesos en proceso. Volvé a intentar en unos segundos.',429);}ocupados++;tomado=true;
    const usuario=String(req.body?.usuario||'').trim().toLowerCase(),clave=req.body?.clave;
    const u=/^[a-z0-9][a-z0-9._-]{2,63}$/.test(usuario)?await almacen.buscar(usuario):null;
    const valida=await comprobarClave(clave,u?.ClaveHash||hashFicticio);
    if(!u||!u.Activo||!valida||(u.BloqueadoHasta&&new Date(u.BloqueadoHasta).getTime()>t)){
     if(u&&!valida)await almacen.intentos(u.Id,false);
     await almacen.registrar(u?.Usuario||'DESCONOCIDO','Inicio de sesión','RECHAZADO');throw error('Usuario o contraseña incorrectos, o cuenta no disponible.',401);
    }
    await almacen.intentos(u.Id,true);const token=randomBytes(32).toString('hex'),csrf=huella('csrf:'+token);
    await almacen.registrar(u.Usuario,'Inicio de sesión','OK');await almacen.crearSesion(u.Id,u.Version,huella(token),huella(csrf));ponerCookie(res,token);
    const publico=almacen.publico(u);res.json({usuario:publico,csrf,inicio:publico.forzarCambio?'/cuenta':inicio(publico)});
   }catch(e){next(e);}finally{if(tomado)ocupados--;}
  });
  router.post('/logout',sesionRequerida,async(req,res,next)=>{try{await almacen.registrar(req.usuario.usuario,'Cerrar sesión','OK');await almacen.salir(req.tokenHash);borrarCookie(res);res.json({ok:true});}catch(e){next(e);}});
  router.post('/clave',sesionRequerida,async(req,res,next)=>{try{const u=await almacen.buscar(req.usuario.usuario);if(!await comprobarClave(req.body?.actual,u?.ClaveHash))throw error('La contraseña actual no es correcta.',422);if(req.body?.nueva===req.body?.actual)throw error('Elegí una contraseña diferente.',422);await almacen.registrar(req.usuario.usuario,'Cambiar contraseña','INICIADA');await almacen.cambiarClave(u.Id,req.usuario.version,req.body.nueva);await almacen.salir(req.tokenHash);borrarCookie(res);await almacen.registrar(req.usuario.usuario,'Cambiar contraseña','OK');res.json({ok:true});}catch(e){next(e);}});
  app.use('/api/auth',router);
  app.get('/login',(req,res)=>res.sendFile(path.join(__dirname,'../../public/login.html')));
  app.use(express.urlencoded({extended:false,limit:'128kb'}));
  app.use(async(req,res,next)=>{
   try{
    if(!habilitada())return next();res.set('Cache-Control','no-store');
    // Solo recursos estáticos públicos conocidos; nunca se exceptúan endpoints API por extensión.
    if(['GET','HEAD'].includes(req.method)&&!req.path.startsWith('/api/')&&/^\/[a-zA-Z0-9._-]+\.(?:js|css|ico)$/.test(req.path))return next();
    if(!await identificar(req)){if(req.path.startsWith('/api/'))return res.status(401).json({error:'La sesión venció. Volvé a iniciar sesión.'});return res.redirect('/login');}
    let ruta;try{ruta=decodeURIComponent(req.path);}catch{throw error('Ruta no válida.',400);}if(/[\\%]/.test(ruta))throw error('Ruta no válida.',400);
    if(req.usuario.forzarCambio&&!['/cuenta','/cuenta.html'].includes(ruta)){if(ruta.startsWith('/api/'))throw error('Cambiá tu contraseña antes de continuar.',428);return res.redirect('/cuenta');}
    const permiso=permisoRuta(req.method,ruta),permitido=permiso==='sesion'||(permiso==='administrar'?req.usuario.perfil==='ADMINISTRADOR':tiene(req.usuario,permiso));
    if(!permitido){await almacen.registrar(req.usuario.usuario,req.method+' '+ruta,'SIN_PERMISO');if(!ruta.startsWith('/api/')&&['GET','HEAD'].includes(req.method))return res.redirect(inicio(req.usuario));throw error('Tu usuario no tiene permiso para esta acción.',403);}
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
     csrf(req);const referencia=randomUUID();await almacen.registrar(req.usuario.usuario,req.method+' '+ruta,'INICIADA',referencia);
     res.once('finish',()=>almacen.registrar(req.usuario.usuario,req.method+' '+ruta,String(res.statusCode),referencia).catch(()=>console.error('No se pudo registrar el resultado de una acción de usuario.')));
    }
    next();
   }catch(e){next(e);}
  });
  app.get('/cuenta',(req,res)=>res.sendFile(path.join(__dirname,'../../public/cuenta.html')));
  app.get('/usuarios',(req,res)=>res.sendFile(path.join(__dirname,'../../public/usuarios.html')));
  const admin=express.Router();admin.use(express.json({limit:'32kb'}));
  admin.use((req,res,next)=>{if(!habilitada()||req.usuario?.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'Se requiere un administrador.'});next();});
  admin.get('/usuarios',async(req,res,next)=>{try{res.json({usuarios:await almacen.listar(),perfiles:PERFILES,permisos:PERMISOS});}catch(e){next(e);}});
  admin.post('/usuarios',async(req,res,next)=>{try{await almacen.guardar(req.body,req.usuario.usuario);res.json({ok:true});}catch(e){next(e);}});
  admin.get('/auditoria',async(req,res,next)=>{try{res.json({filas:await almacen.auditoria()});}catch(e){next(e);}});
  app.use('/api/admin',admin);
 }
 return {instalar};
}
module.exports={crear};
