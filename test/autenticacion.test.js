const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {crear}=require('../src/services/autenticacion');
const {hashClave,comprobarClave,huella}=require('../src/services/clavesUsuarios');
const {PERFILES,permisoRuta,tiene}=require('../src/services/permisos');
test('Claves con sal individual y sin texto plano, verifica contraseña y rechaza hashes/longitudes inválidos',async()=>{
 const clave='Una frase de prueba 2026',a=await hashClave(clave),b=await hashClave(clave);assert.notEqual(a,b);assert(!a.includes(clave));assert(await comprobarClave(clave,a));assert(!await comprobarClave('otra contraseña',a));assert(!await comprobarClave(clave,'texto'));await assert.rejects(hashClave('corta'),{status:422});await assert.rejects(hashClave('a'.repeat(129)),{status:422});
});
test('Permisos: comercial sin FTP, consulta sin escrituras, combinado reúne ambos perfiles',()=>{
 const u=perfil=>({perfil,permisos:PERFILES[perfil].permisos});assert(tiene(u('COMEX_COMERCIAL'),'ftp.enviar'));assert(tiene(u('COMEX_COMERCIAL'),'stock.editar'));assert(!tiene(u('COMERCIAL'),'ftp.enviar'));assert(!tiene(u('CONSULTA'),'nv.clientes'));
 for(const [method,ruta,p]of [['POST','/api/importaciones/analisis/x/enviar-ftp','ftp.enviar'],['POST','/api/importaciones/analisis/x/clientes/corregir','nv.clientes'],['POST','/api/historial/x/cancelar','facturas.cancelar'],['POST','/api/stock/vistas/x/ejecutar','stock.programar'],['GET','/api/stock/programador','stock.ver'],['GET','/stock.html','stock.ver'],['GET','/api/admin/usuarios','administrar'],['GET','/api/ruta-nueva','administrar']])assert.equal(permisoRuta(method,ruta),p);
});
test('Usuarios: solo perfiles y permisos conocidos, protección del último administrador activo',()=>{
 const {validar,validarTransicion}=require('../src/services/usuariosSQL'),base={usuario:'Diego',nombre:'Diego',perfil:'COMEX_COMERCIAL'};assert.equal(validar(base).usuario,'diego');assert(validar(base).permisos.includes('stock.ver'));for(const cambio of [{perfil:'__proto__'},{permisos:['administrar']},{activo:'false'},{usuario:'x'},{perfil:'inventado'}])assert.throws(()=>validar({...base,...cambio}),{status:422});
 const admin={Id:'1',Perfil:'ADMINISTRADOR',Activo:true};assert.throws(()=>validarTransicion([admin],admin,{perfil:'CONSULTA',activo:true}),{status:409});assert.throws(()=>validarTransicion([admin],admin,{perfil:'ADMINISTRADOR',activo:false}),{status:409});assert.doesNotThrow(()=>validarTransicion([admin,{Id:'2',Perfil:'ADMINISTRADOR',Activo:true}],admin,{perfil:'CONSULTA',activo:true}));
});
function mockStore(hash){
 const usuarios=new Map(),sesiones=new Map(),eventos=[];
 for(const perfil of Object.keys(PERFILES)){const id=perfil.toLowerCase();usuarios.set(id,{Id:id,Usuario:id,Nombre:id,Perfil:perfil,Permisos:JSON.stringify(PERFILES[perfil].permisos),ClaveHash:hash,Activo:true,Version:'1',Intentos:0});}
 const publico=u=>({id:u.Id,usuario:u.Usuario,nombre:u.Nombre,perfil:u.Perfil,permisos:JSON.parse(u.Permisos),activo:u.Activo,forzarCambio:!!u.ForzarCambio,version:u.Version});
 return {usuarios,sesiones,eventos,publico,buscar:async u=>usuarios.get(u),intentos:async(id,ok)=>{const u=usuarios.get(id);u.Intentos=ok?0:u.Intentos+1;if(u.Intentos>=5)u.BloqueadoHasta=new Date(Date.now()+900000);},crearSesion:async(id,version,token,csrf)=>sesiones.set(token,{id,version,csrf,vence:Date.now()+8*3600000}),sesion:async token=>{const s=sesiones.get(token),u=s&&usuarios.get(s.id);return u?.Activo&&u.Version===s.version&&s.vence>Date.now()?{usuario:publico(u),csrf:s.csrf}:null;},salir:async t=>sesiones.delete(t),registrar:async(...args)=>eventos.push(args),listar:async()=>[...usuarios.values()].map(publico),auditoria:async()=>eventos,guardar:async()=>{},cambiarClave:async id=>{usuarios.get(id).Version='nueva';usuarios.get(id).ForzarCambio=false;}};
}
test('HTTP: login, CSRF, permisos, cuenta bloqueada, logout, revocación y acceso de red sin ejecutar tareas',async()=>{
 const almacen=mockStore(await hashClave('Una contraseña larga 2026')),app=express();crear({almacen,habilitada:()=>true,segura:()=>false}).instalar(app);
 for(const ruta of ['/api/stock','/api/historial','/api/admin/prueba'])app.get(ruta,(req,res)=>res.json({ok:true}));
 for(const ruta of ['/api/stock/vistas/x/ejecutar','/api/importaciones/analisis/x/enviar-ftp','/api/importaciones/analisis/x/clientes/corregir','/api/precios/maestro.dbi'])app.post(ruta,(req,res)=>res.json({ok:true}));
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(ruta,body={},headers={})=>fetch(base+ruta,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 async function login(usuario){const r=await post('/api/auth/login',{usuario,clave:'Una contraseña larga 2026'});assert.equal(r.status,200);const d=await r.json();assert(!JSON.stringify(d).includes('ClaveHash'));assert(r.headers.get('set-cookie').includes('HttpOnly'));assert(r.headers.get('set-cookie').includes('SameSite=Strict'));return {Cookie:r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':d.csrf};}
 try{
  assert.equal((await fetch(base+'/api/stock')).status,401);assert.equal((await fetch(base+'/stock',{redirect:'manual'})).headers.get('location'),'/login');
  assert.equal((await post('/api/auth/login',{usuario:'comercial',clave:'Una contraseña larga 2026'},{Origin:'http://ajeno.test'})).status,403);
  const c=await login('comercial');assert.equal((await post('/api/importaciones/analisis/x/enviar%2Dftp',{},c)).status,403);assert.equal((await fetch(base+'/api/stock',{headers:c})).status,200);assert.equal((await fetch(base+'/api/historial',{headers:c})).status,403);assert.equal((await post('/api/stock/vistas/x/ejecutar',{},c)).status,403);assert.equal((await post('/api/importaciones/analisis/x/enviar-ftp',{},c)).status,403);
  const combinado=await login('comex_comercial');assert.equal((await post('/api/importaciones/analisis/x/enviar-ftp',{},combinado)).status,200);assert.equal((await post('/api/importaciones/analisis/x/clientes/corregir',{},combinado)).status,200);
  assert.equal((await post('/api/importaciones/analisis/x/enviar-ftp',{}, {Cookie:combinado.Cookie})).status,403);
  assert.equal((await post('/api/importaciones/analisis/x/enviar-ftp',{}, {...combinado,Origin:'http://ajeno.test'})).status,403);
  const admin=await login('administrador');assert.equal((await post('/api/stock/vistas/x/ejecutar',{},admin)).status,200);
  const form=await fetch(base+'/api/precios/maestro.dbi',{method:'POST',headers:{Origin:base,Cookie:admin.Cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:admin['X-CSRF-Token'],productos:'[]'})});assert.equal(form.status,200);
  almacen.usuarios.get('comex_comercial').Version='2';assert.equal((await post('/api/importaciones/analisis/x/enviar-ftp',{},combinado)).status,401);
  assert.equal((await post('/api/auth/logout',{},c)).status,200);assert.equal((await fetch(base+'/api/stock',{headers:c})).status,401);
  const consulta=await login('consulta');almacen.usuarios.get('consulta').Activo=false;assert.equal((await fetch(base+'/api/stock',{headers:consulta})).status,401);
  const vencida=await login('comercial');almacen.sesiones.get(huella(vencida.Cookie.split('=')[1])).vence=0;assert.equal((await fetch(base+'/api/stock',{headers:vencida})).status,401);
  almacen.usuarios.get('comex').ForzarCambio=true;const cambio=await login('comex');assert.equal((await fetch(base+'/api/historial',{headers:cambio})).status,428);assert.equal((await post('/api/auth/clave',{actual:'Una contraseña larga 2026',nueva:'Nueva contraseña larga 2026'},cambio)).status,200);assert.equal((await fetch(base+'/api/historial',{headers:cambio})).status,401);
  for(let i=0;i<5;i++)assert.equal((await post('/api/auth/login',{usuario:'comercial',clave:'incorrecta'})).status,401);assert.equal((await post('/api/auth/login',{usuario:'comercial',clave:'Una contraseña larga 2026'})).status,401);
  assert(almacen.eventos.some(e=>e[2]==='SIN_PERMISO'));assert(almacen.eventos.some(e=>e[2]==='INICIADA'));assert(!JSON.stringify(almacen.eventos).includes('contraseña larga'));
 }finally{await new Promise(r=>server.close(r));}
});
test('HTTPS es obligatorio cuando la cookie segura está activa y no hay bypass de alta pública',async()=>{
 const app=express();crear({almacen:mockStore(''),habilitada:()=>true,segura:()=>true}).instalar(app);app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const base='http://127.0.0.1:'+s.address().port;try{assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'})).status,400);assert.equal((await fetch(base+'/api/admin/usuarios',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'})).status,401);}finally{await new Promise(r=>s.close(r));}
});
