(() => {
 const original=window.fetch.bind(window);let datos;
 const listo=original('/api/auth/me',{cache:'no-store'}).then(async r=>{if(r.status===401){location.replace('/login');throw Error('Iniciá sesión.');}if(!r.ok)throw Error('No se pudo comprobar la sesión.');datos=await r.json();return datos;});
 window.versatoSesion=listo;
 window.fetch=async(entrada,opciones={})=>{
  const d=await listo,url=new URL(entrada instanceof Request?entrada.url:String(entrada),location.href),metodo=String(opciones.method||(entrada instanceof Request?entrada.method:'GET')).toUpperCase();
  if(d.habilitada&&url.origin===location.origin&&!['GET','HEAD','OPTIONS'].includes(metodo)){
   const headers=new Headers(opciones.headers||(entrada instanceof Request?entrada.headers:undefined));headers.set('X-CSRF-Token',d.csrf);opciones={...opciones,headers};
  }
  const r=await original(entrada,opciones);if(url.origin===location.origin&&r.status===401)location.assign('/login');if(r.status===428)location.assign('/cuenta');return r;
 };
 const prepararFormulario=form=>{if(!datos?.habilitada||new URL(form.action,location.href).origin!==location.origin||form.method.toLowerCase()!=='post')return;let campo=form.querySelector('input[name="_csrf"]');if(!campo){campo=document.createElement('input');campo.type='hidden';campo.name='_csrf';form.append(campo);}campo.value=datos.csrf;};
 const submit=HTMLFormElement.prototype.submit;HTMLFormElement.prototype.submit=function(){prepararFormulario(this);return submit.call(this);};document.addEventListener('submit',e=>prepararFormulario(e.target),true);
 function pintar(d){
  if(!d.habilitada)return;const u=d.usuario,tiene=p=>u.perfil==='ADMINISTRADOR'||u.permisos.includes(p);
  const enlaces={'/importaciones':'facturas.editar','/historial':'facturas.ver','/consultas':'facturas.ver','/clientes':'clientes.ver','/stock':'stock.ver','/precios':'precios.ver','/fotos':'fotos.ver'};
  function permisos(){
   for(const n of document.querySelectorAll('[data-permiso]'))if(!tiene(n.dataset.permiso))n.hidden=true;
   for(const a of document.querySelectorAll('a[href]')){const p=enlaces[a.getAttribute('href')];if(p&&!tiene(p))a.hidden=true;}
   for(const b of document.querySelectorAll('button,input[type="submit"]')){
    let p=b.dataset.permiso;const t=(b.textContent||b.value||'').trim();
    if(!p){if(/Enviar.*FTP/i.test(t))p='ftp.enviar';else if(/Cancelar factura/i.test(t))p='facturas.cancelar';else if(/Cambiar cliente|corregir cliente/i.test(t))p='nv.clientes';else if(/Generar NV|Guardar domicilio/i.test(t))p='nv.gestionar';else if(/Calcular y controlar precios/i.test(t))p='precios.editar';else if(/Analizar factura|Actualizar contra maestros|Preparar archivos COMEX|Actualizar datos COMEX|Aceptar y guardar análisis/i.test(t))p='facturas.editar';}
    if(p&&!tiene(p))b.hidden=true;
   }
  }
  const nav=document.querySelector('header nav');if(nav){if(u.perfil==='ADMINISTRADOR'){const a=document.createElement('a');a.href='/usuarios';a.textContent='Usuarios';nav.append(a);}const cuenta=document.createElement('a');cuenta.href='/cuenta';cuenta.textContent=u.nombre;nav.append(cuenta);const salir=document.createElement('button');salir.type='button';salir.textContent='Cerrar sesión';salir.className='secondary session-logout';salir.onclick=async()=>{salir.disabled=true;try{const r=await fetch('/api/auth/logout',{method:'POST'});if(!r.ok)throw Error('No se pudo cerrar la sesión.');location.assign('/login');}catch(e){salir.disabled=false;alert(e.message);}};nav.append(salir);}
  permisos();new MutationObserver(permisos).observe(document.body,{childList:true,subtree:true});
 }
 listo.then(d=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>pintar(d),{once:true}):pintar(d)).catch(()=>{});
})();
