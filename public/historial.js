const filas=document.querySelector('#filas'),estado=document.querySelector('#estado'),buscar=document.querySelector('#buscar'),detalle=document.querySelector('#envios');let analisis=[],envioActual=0;
const fecha=v=>v?new Date(v).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'medium',timeStyle:'short'}):'Sin fecha';
const el=(tag,texto,parent,clase)=>{const e=document.createElement(tag);e.textContent=texto??'';if(clase)e.className=clase;parent.append(e);return e;};
const numero=v=>Number(v||0).toLocaleString('es-AR');
function insignia(valor,parent){const etiquetas={COMPLETO:'Completo',CANCELADA:'Cancelada',PARCIAL:'Para revisar',EN_CURSO:'En curso',ERROR:'Con errores',DETECTADO:'Detectado'};const tono=valor==='COMPLETO'?'success':valor==='ERROR'?'error':valor&&valor!=='DETECTADO'?'warning':'neutral';return el('span',etiquetas[valor]||valor||'Sin envíos',parent,'history-status '+tono);}
async function mostrarEnvios(a,boton){const solicitud=++envioActual;detalle.hidden=false;detalle.replaceChildren();const cabecera=el('div','',detalle,'history-panel-heading');const titulos=el('div','',cabecera);el('p','MOVIMIENTOS DEL LOTE',titulos,'eyebrow');el('h2','Envíos · Factura '+(a.Factura||'sin número'),titulos);const cerrar=el('button','Cerrar ×',cabecera,'history-action secondary');cerrar.type='button';cerrar.addEventListener('click',()=>{envioActual++;detalle.hidden=true;boton.focus();});const texto=el('p','Cargando envíos…',detalle,'history-panel-message');detalle.focus({preventScroll:true});detalle.scrollIntoView({behavior:'smooth',block:'start'});
 try{const response=await fetch('/api/historial/'+encodeURIComponent(a.Id)+'/envios'),r=await response.json();if(solicitud!==envioActual)return;if(!response.ok)throw new Error(r.error);texto.textContent=r.envios.length?'Cada movimiento conserva el resultado informado por el FTP.':'Este análisis todavía no tiene envíos al FTP.';for(const envio of r.envios){const d=el('details','',detalle,'history-shipment');const summary=el('summary','',d);el('span',fecha(envio.Inicio),summary);insignia(envio.Estado,summary);el('p','Destino: '+envio.Destino,d);el('p',envio.Detalle?.mensaje||(envio.Estado==='EN_CURSO'?'Envío iniciado sin resultado registrado. Revisá el FTP antes de reintentar.':''),d);for(const f of envio.Detalle?.archivos||[]){const fila=el('div','',d,'history-file-result');el('span',f.nombre,fila);el('span',f.estado,fila);}}}catch(e){if(solicitud===envioActual)texto.textContent=e.message||'No se pudieron recuperar los envíos.';}}
function pintar(){filas.replaceChildren();const q=buscar.value.trim().toLowerCase().replace(/[.\-\s/]/g,''),rows=analisis.filter(a=>(a.Factura||'').toLowerCase().replace(/[.\-\s/]/g,'').includes(q));estado.textContent=`Mostrando ${rows.length} de ${analisis.length} ${analisis.length===1?'análisis guardado':'análisis guardados'} · últimos 100`;
 document.querySelector('#total-guardados').textContent=numero(analisis.length);document.querySelector('#total-completos').textContent=numero(analisis.filter(a=>a.Estado==='COMPLETO').length);document.querySelector('#total-enviados').textContent=numero(analisis.filter(a=>a.UltimoEnvio).length);
 if(!rows.length){const empty=el('div','',filas,'history-empty');el('span','FC',empty,'history-document');el('h3',q?'No encontramos esa factura':'Todavía no hay facturas guardadas',empty);el('p',q?'Probá con otro número de factura.':'Los análisis aparecerán acá después de aceptarlos y guardarlos.',empty);return;}
 for(const a of rows){const card=el('article','',filas,'history-invoice');const top=el('div','',card,'history-invoice-top');el('span','FC',top,'history-document');const title=el('div','',top,'history-invoice-title');el('h3','Factura '+(a.Factura||'sin número'),title);el('p','Guardada el '+fecha(a.Creado),title);insignia(a.Estado,top);
 const totales=el('dl','',card,'history-metrics history-invoice-totals');for(const [label,value,money]of [['Pares',a.Totales?.pares],['Cajas',a.Totales?.cajas],['Importe total FC',a.Totales?.importe,true]]){const dato=el('div','',totales);el('dt',label,dato);el('dd',value==null?'—':Number(value).toLocaleString('es-AR',money?{minimumFractionDigits:2,maximumFractionDigits:2}:{}),dato);}
 const datos=el('dl','',card,'history-metrics');for(const [label,value]of [['Módulos creados',a.Altas?.modulosConfirmados],['Sueltos creados',a.Altas?.sueltosConfirmados],['Pendientes de alta',a.Resumen?.productos?.total],['Archivos DBI',a.Archivos]]){const dato=el('div','',datos);el('dt',label,dato);el('dd',value==null?'—':numero(value),dato);}const envio=el('div','',datos);el('dt','Último envío FTP',envio);const dd=el('dd','',envio);insignia(a.UltimoEnvio,dd);if(a.FechaEnvio)el('small',fecha(a.FechaEnvio),dd);
 const acciones=el('div','',card,'history-actions');const link=el('a','Abrir análisis ↗',acciones,'history-action primary');link.href='/importaciones?analisis='+encodeURIComponent(a.Id);if(a.FilasEstructuradas!=null){const datos=el('a','Consultar datos',acciones,'history-action secondary');datos.href='/consultas?analisis='+encodeURIComponent(a.Id);}const correo=el('a','Enviar mail',acciones,'history-action secondary');correo.href='/importaciones?analisis='+encodeURIComponent(a.Id)+'#correo-factura';correo.title='Revisar el correo y descargar el borrador con su adjunto para enviarlo desde Outlook';const abrirCorreo=el('button','Abrir en mi correo',acciones,'history-action secondary');abrirCorreo.type='button';const correoEstado=el('p','',card,'history-mail-status');correoEstado.setAttribute('role','status');correoEstado.hidden=true;abrirCorreo.addEventListener('click',async()=>{abrirCorreo.disabled=true;correoEstado.hidden=false;correoEstado.textContent='Abriendo el borrador con su adjunto…';try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(a.Id)+'/correo/abrir',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const r=await response.json();if(!response.ok)throw new Error(r.error);correoEstado.textContent='Borrador abierto en tu correo. Revisalo antes de enviar.';}catch(error){correoEstado.textContent=(error.message||'No se pudo abrir el correo.')+' Usá Enviar mail para preparar o revisar el informe.';}finally{abrirCorreo.disabled=false;}});const altas=el('a','Ver productos dados de alta',acciones,'history-action secondary');altas.href='/importaciones?analisis='+encodeURIComponent(a.Id)+'#altas-productos';const b=el('button','Ver envíos',acciones,'history-action tertiary');b.type='button';b.addEventListener('click',()=>mostrarEnvios(a,b));
 if(a.Estado==='CANCELADA'){
  correo.hidden=true;
  abrirCorreo.hidden=true;
 } else {
  const cancelar=el('button','Cancelar factura',acciones,'history-action tertiary');
  cancelar.type='button';
  cancelar.addEventListener('click',async()=>{
   if(!window.confirm('¿Cancelar la factura '+(a.Factura||'seleccionada')+'? El análisis se conserva en el historial. Los envíos e importaciones anteriores siguen registrados.'))return;
   cancelar.disabled=true;
   correoEstado.hidden=false;
   correoEstado.textContent='Cancelando factura…';
   try {
    const respuesta=await fetch('/api/historial/'+encodeURIComponent(a.Id)+'/cancelar',{method:'POST'});
    const resultado=await respuesta.json();
    if(!respuesta.ok)throw new Error(resultado.error);
    a.Estado=resultado.Estado;
    pintar();
    estado.textContent='Factura '+(a.Factura||'')+' cancelada. Disponible en el historial.';
   } catch(error) {
    correoEstado.textContent=error.message||'No se pudo confirmar la cancelación.';
    cancelar.disabled=false;
   }
  });
 }
}
}
buscar.addEventListener('input',pintar);fetch('/api/historial').then(async response=>{const r=await response.json();if(!response.ok)throw new Error(r.error);analisis=r.analisis;pintar();if(!r.persistente)estado.textContent='Configurá la base de datos para conservar tus análisis.';}).catch(e=>{estado.textContent=e.message||'No se pudo cargar el historial.';estado.classList.add('history-load-error');});
