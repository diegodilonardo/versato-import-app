// Reubica los bloques ya renderizados; conserva filtros, eventos y descargas.
function organizarVistaFactura(contenedor,payload,validacion){
 const grupos=[['resumen','Resumen','Totales y datos de la factura'],['controles','Controles','Cantidades, archivos y clientes'],['productos','Productos','Módulos y sueltos'],['presea','Presea','Archivos DBI y envíos al FTP'],['comercial','COMEX y NV','Exportaciones y Notas de Venta'],['correo','Correo','Informe y archivo de depósito'],['fotos','Fotos','Imágenes de los productos']];
 const previo=contenedor.dataset.facturaId===payload.analisis?.id?contenedor.dataset.seccion:null;
 const nodos=[...contenedor.children],barra=document.createElement('div');barra.className='invoice-navigation';
 const titulo=document.createElement('div');titulo.className='invoice-heading';
 const etiqueta=document.createElement('p');etiqueta.className='eyebrow';etiqueta.textContent=payload.analisis?.confirmado===false?'VISTA PREVIA':payload.analisis?.cancelada?'FACTURA CANCELADA':'FACTURA GUARDADA';titulo.append(etiqueta);
 const h=document.createElement('h2');h.textContent='Factura '+(payload.facturas?.join(' · ')||'sin número identificado');titulo.append(h);
 const ayuda=document.createElement('p');ayuda.className='card-caption';ayuda.textContent='Revisá el resumen y accedé a cada etapa desde las pestañas.';titulo.append(ayuda);
 contenedor.prepend(titulo);
 const tabs=document.createElement('div');tabs.className='invoice-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Secciones del análisis de factura');barra.append(tabs);
 const paneles=new Map(),botones=new Map();
 for(const [id,nombre,descripcion]of grupos){
  const b=document.createElement('button');b.type='button';b.id='tab-factura-'+id;b.setAttribute('role','tab');b.setAttribute('aria-controls','panel-factura-'+id);b.textContent=nombre;b.title=descripcion;tabs.append(b);botones.set(id,b);
  const panel=document.createElement('section');panel.id='panel-factura-'+id;panel.className='invoice-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);panel.tabIndex=0;panel.hidden=true;paneles.set(id,panel);
 }
 function destino(nodo){
  if(nodo===validacion||nodo.classList.contains('pedidos-panel'))return 'controles';
  if(nodo.classList.contains('mail-panel'))return 'correo';
  if(nodo.classList.contains('comex-panel')||nodo.classList.contains('nv-panel'))return 'comercial';
  if(nodo.classList.contains('delivery-panel')||nodo.classList.contains('ftp-card'))return 'presea';
  if(nodo.classList.contains('control-downloads'))return 'controles';
  const nombre=(nodo.querySelector(':scope > summary')?.childNodes[0]?.textContent||nodo.querySelector(':scope > h3')?.textContent||'').trim();
  if(nombre==='Fotos de productos')return 'fotos';
  if(['Cruce de cantidades','Filas excluidas del cruce','Control de clientes'].includes(nombre))return 'controles';
  if(/^(Productos|Control del maestro)/.test(nombre))return 'productos';
  return 'resumen';
 }
 for(const nodo of nodos){
  if(nodo.tagName==='H2'){nodo.classList.add('invoice-analysis-state');titulo.append(nodo);continue;}
  if(nodo.classList.contains('stats-grid')){titulo.append(nodo);continue;}
  // Aceptación y actualización siguen visibles independientemente de la pestaña.
  if(nodo.querySelector(':scope > button')?.textContent==='Actualizar contra maestros'){nodo.classList.add('invoice-master-toolbar');titulo.append(nodo);continue;}
  if(nodo.querySelector(':scope > h3')?.textContent==='Vista previa · sin guardar'){nodo.classList.add('invoice-acceptance');titulo.append(nodo);continue;}
  paneles.get(destino(nodo)).append(nodo);
 }
 const resumen=paneles.get('resumen');
 const principales=[];for(const nombre of ['Control de Factura','Totales por marca','Resumen de coincidencias por marca','Archivos analizados']){const nodo=[...resumen.children].find(n=>(n.querySelector(':scope > summary')?.childNodes[0]?.textContent||'').trim()===nombre);if(nodo)principales.push(nodo);}resumen.prepend(...principales);
 contenedor.append(barra,...paneles.values());organizarComercial(paneles.get('comercial'),contenedor,payload);
 const altas=payload.historialAltasProductos||[];const altasPanel=document.createElement('details');altasPanel.className='result-section';altasPanel.id='altas-productos';const sum=document.createElement('summary');sum.textContent='Productos nuevos dados de alta en Presea ('+altas.filter(r=>r.estado==='ALTA_CONFIRMADA').length+')';altasPanel.append(sum);const altasContenido=document.createElement('div');altasContenido.className='section-content';altasPanel.append(altasContenido);const notaAltas=document.createElement('p');notaAltas.className='note';notaAltas.textContent='Productos propuestos por esta factura y confirmados por su COD_ALFA en los maestros. Incluye módulos y sueltos.';altasContenido.append(notaAltas);const labelAltas=document.createElement('label'),filtroAltas=document.createElement('input');filtroAltas.type='checkbox';filtroAltas.checked=true;labelAltas.append(filtroAltas,' Mostrar solo altas confirmadas');altasContenido.append(labelAltas);const tablaAltas=document.createElement('div');altasContenido.append(tablaAltas);const dibujarAltas=()=>{tablaAltas.replaceChildren();table(['Tipo','COD_ALFA','Código Presea','Detalle','Marca','Clave / EAN','Estado'],altas.filter(r=>!filtroAltas.checked||r.estado==='ALTA_CONFIRMADA').map(r=>[r.tipo,r.COD_ALFA,r.CODIGO,r.DETALLE,r.marca,r.clave,r.estado==='ALTA_CONFIRMADA'?'Alta confirmada':'Pendiente de confirmar']),tablaAltas);};filtroAltas.addEventListener('change',dibujarAltas);dibujarAltas();paneles.get('productos').prepend(altasPanel);
 const productos=payload.productos,asignaciones=productos?.asignaciones||[],sueltos=productos?.sueltos?.filas||[];
 const modulosFaltantes=asignaciones.filter(r=>r.coincidencia==='NO_ENCONTRADO');
 const sueltosFaltantes=sueltos.filter(r=>r.EAN&&!r.datosMaestro&&['NUEVO','REVISAR'].includes(r.estado));
 const verificado=!!(asignaciones.length&&productos?.maestro?.disponible&&productos?.sueltos?.maestro?.disponible);
 const inciertos=asignaciones.filter(r=>!['ENCONTRADO','NO_ENCONTRADO'].includes(r.coincidencia)||(r.coincidencia==='ENCONTRADO'&&r.estado!=='ENCONTRADO')).length+sueltos.filter(r=>!['ENCONTRADO','NUEVO','REVISAR'].includes(r.estado)||(r.estado==='REVISAR'&&!r.EAN)).length;
 const faltantes=modulosFaltantes.length+sueltosFaltantes.length;
 const indicador=document.createElement('div');indicador.className='summary-card presea-impact-card '+(verificado&&!inciertos&&!faltantes?'is-success':'is-warning');
 const nombre=document.createElement('h3');nombre.className='summary-title';nombre.textContent='Pendientes en Presea';indicador.append(nombre);
 const cantidad=document.createElement('strong');cantidad.className='stat-value';cantidad.textContent=verificado?faltantes.toLocaleString('es-AR'):'Sin verificar';indicador.append(cantidad);
 const desglose=document.createElement('p');desglose.className='card-caption';desglose.textContent=verificado?`${modulosFaltantes.length} módulos · ${sueltosFaltantes.length} sueltos`:'Actualizá los maestros para comprobar las altas.';indicador.append(desglose);
 const estado=document.createElement('p');estado.className='card-caption';estado.textContent=inciertos?inciertos+' productos sin coincidencia resuelta':verificado?(faltantes?'No encontrados en esta comprobación':'Todos figuran en los maestros'):'';indicador.append(estado);
 const comprobaciones=[productos?.maestro?.actualizado,productos?.sueltos?.maestro?.actualizado].filter(Boolean).map(v=>new Date(v)).filter(v=>!Number.isNaN(v.getTime()));if(comprobaciones.length){const nota=document.createElement('p');nota.className='card-caption';nota.textContent='Maestros: '+new Date(Math.min(...comprobaciones.map(v=>v.getTime()))).toLocaleString('es-AR');indicador.append(nota);}
 const abrir=document.createElement('button');abrir.type='button';abrir.textContent='Ver pendientes';indicador.append(abrir);(titulo.querySelector('.stats-grid')||titulo).append(indicador);
 const detalle=document.createElement('details');detalle.className='result-section presea-impact-detail';detalle.open=true;paneles.get('productos').prepend(detalle);
 const cabecera=document.createElement('summary');cabecera.textContent='Productos pendientes de impactar en Presea';detalle.append(cabecera);
 const cuerpo=document.createElement('div');cuerpo.className='section-content';detalle.append(cuerpo);
 const fecha=document.createElement('p');fecha.className='note';const fechas=[productos?.maestro?.actualizado,productos?.sueltos?.maestro?.actualizado].filter(Boolean).map(v=>new Date(v)).filter(v=>!Number.isNaN(v.getTime()));fecha.textContent='Según los maestros utilizados en este análisis'+(fechas.length?' · Productos: '+(productos?.maestro?.actualizado?new Date(productos.maestro.actualizado).toLocaleString('es-AR'):'sin comprobar')+' · Sueltos: '+(productos?.sueltos?.maestro?.actualizado?new Date(productos.sueltos.maestro.actualizado).toLocaleString('es-AR'):'sin comprobar'):'')+'. Después de importar en Presea y exportar sus maestros, usá Actualizar contra maestros.';cuerpo.append(fecha);
 if(!verificado){const aviso=document.createElement('p');aviso.className='download-notice';aviso.textContent='La comprobación está incompleta. No se puede confirmar que todos los productos estén dados de alta.';cuerpo.append(aviso);}
 if(inciertos){const aviso=document.createElement('p');aviso.className='download-notice';aviso.textContent=inciertos+' productos necesitan revisión o una actualización de maestros; no están confirmados como faltantes.';cuerpo.append(aviso);}
 const filas=[...modulosFaltantes.map(r=>['Módulo',r.PRODUCTO,r.SIZE_RUN,'—',r.claveBuscada||r.CODIGO_DE_BARRA,'No encontrado']),...sueltosFaltantes.map(r=>['Suelto',r.PRODUCTO,r.TALLE_ORIGEN||r.TALLC,r.EAN,'—',r.estado==='REVISAR'?'No encontrado · Revisar datos para el alta':'No encontrado'])];
 if(filas.length)table(['Tipo','Producto','SIZE RUN / Talle','EAN','Código Versato','Estado'],filas,cuerpo);else{const vacio=document.createElement('p');vacio.className='note';vacio.textContent=verificado&&!inciertos?'No hay productos pendientes de impactar en Presea.':'No hay faltantes confirmados con la información disponible.';cuerpo.append(vacio);}
 abrir.addEventListener('click',()=>{activar('productos');detalle.open=true;detalle.scrollIntoView({block:'start',behavior:'smooth'});});
 function activar(id,enfocar=false){
  for(const [key,panel]of paneles){const activo=key===id;panel.hidden=!activo;const b=botones.get(key);b.setAttribute('aria-selected',String(activo));b.tabIndex=activo?0:-1;}
  contenedor.dataset.seccion=id;contenedor.dataset.facturaId=payload.analisis?.id||'';if(enfocar)botones.get(id).focus();
 }
 for(const [id,b]of botones){b.addEventListener('click',()=>activar(id));b.addEventListener('keydown',e=>{const ids=[...botones.keys()].filter(k=>!botones.get(k).disabled),i=ids.indexOf(id);let n;if(e.key==='ArrowRight')n=(i+1)%ids.length;else if(e.key==='ArrowLeft')n=(i+ids.length-1)%ids.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=ids.length-1;else return;e.preventDefault();activar(ids[n],true);});}
 for(const [id,panel]of paneles)if(!panel.children.length){const p=document.createElement('p');p.className='note';p.textContent='Esta factura no tiene información para esta sección.';panel.append(p);}
 activar(paneles.has(previo)?previo:location.hash==='#altas-productos'?'productos':location.hash==='#correo-factura'?'correo':'resumen');if(location.hash==='#altas-productos')altasPanel.open=true;
 const carga=document.querySelector('#invoice-upload');if(carga)carga.open=false;
 document.body.classList.add('has-invoice-analysis');
}

function facturaSoloAdministracion(payload){
 const clientes=[...(payload.informeCorreo?.clientes||[]).map(c=>c.cliente),...(payload.controlClientes?.filas||[]).map(c=>c.codigo),...(payload.notasVenta?.clientes||[]).map(c=>c.cliente)].map(c=>String(c??'').trim());
 return clientes.length>0&&clientes.every(c=>c==='131600');
}
function organizarComercial(panel,contenedor,payload){
 const soloStock=facturaSoloAdministracion(payload);
 const nv=[...panel.children].find(n=>n.dataset.comercial==='nv'),control=nv?.querySelector('.nv-import-panel');if(control)panel.append(control);
 const nodos=[...panel.children],nav=document.createElement('div');nav.className='commercial-navigation';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Etapas de COMEX y Notas de Venta');
 const opciones=[['nv','1','Notas de Venta','Generación y descarga por cliente'],['precios','2','Precios de NV','Cálculo y archivo de precios'],['importacion','3','Control en Presea','NV importadas y sus números'],['comex','4','Archivos COMEX','Pedidos y Master Data']];
 const botones=new Map(),secciones=new Map(),estados=new Map();
 for(const [id,paso,titulo,descripcion]of opciones){const seccion=nodos.find(n=>n.dataset.comercial===id);if(!seccion)continue;seccion.id='comercial-'+id;seccion.classList.add('commercial-step-panel');seccion.setAttribute('role','tabpanel');seccion.setAttribute('aria-labelledby','comercial-tab-'+id);const b=document.createElement('button');b.type='button';b.disabled=soloStock&&['nv','importacion'].includes(id);if(b.disabled){b.setAttribute('aria-disabled','true');b.title='No aplica: factura exclusiva de Administración (131600).';}b.id='comercial-tab-'+id;b.setAttribute('role','tab');b.setAttribute('aria-controls',seccion.id);const texto=document.createElement('span');texto.className='commercial-step-title';texto.textContent=paso+'. '+titulo;b.append(texto);const detalle=document.createElement('span');detalle.textContent=descripcion;detalle.className='commercial-step-description';b.append(detalle);const estado=document.createElement('span');estado.className='commercial-step-state';b.append(estado);estados.set(id,estado);nav.append(b);botones.set(id,b);secciones.set(id,seccion);}
 panel.prepend(nav);const nota=document.createElement('p');nota.className='commercial-flow-note';nota.textContent=soloStock?'Factura de Stock (Administración 131600). Generá y enviá el archivo de precios; no requiere Notas de Venta ni su control en Presea.':'Generá las notas de venta en el paso 1 y enviá el lote desde Precios de NV. Presea procesa primero los precios pendientes.';nav.after(nota);
 function activar(id,enfocar=false){if(botones.get(id)?.disabled)return;for(const [key,s]of secciones){s.hidden=key!==id;const b=botones.get(key);b.setAttribute('aria-selected',String(key===id));b.tabIndex=key===id?0:-1;}contenedor.dataset.comercialSeccion=id;contenedor.dataset.comercialFactura=payload.analisis?.id||'';if(enfocar)botones.get(id).focus();}
 function actualizar(){const nv=payload.notasVenta,p=payload.preciosNV,c=payload.controlNVPresea;const mensajes={nv:nv?nv.clientes.length+' clientes · '+nv.clientes.filter(c=>c.bloqueada).length+' para revisar':'Pendiente de preparar',precios:p?(p.bloqueada?'Para revisar':p.resumen.registros+' precios preparados'):'Pendiente de generar',importacion:c?.disponible?(c.revisionNV!==nv?.revision?'Volver a verificar':c.resumen.notasVenta+' NV · '+c.resumen.revisar+' diferencias'):'Sin verificar',comex:payload.comex?'Archivos preparados':'Pendiente de preparar'};for(const [id,e]of estados)e.textContent=soloStock&&['nv','importacion'].includes(id)?'No aplica · Solo Stock':mensajes[id];}
 for(const [id,b]of botones){b.addEventListener('click',()=>activar(id));b.addEventListener('keydown',e=>{const ids=[...botones.keys()].filter(k=>!botones.get(k).disabled),i=ids.indexOf(id);let n;if(e.key==='ArrowRight')n=(i+1)%ids.length;else if(e.key==='ArrowLeft')n=(i+ids.length-1)%ids.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=ids.length-1;else return;e.preventDefault();activar(ids[n],true);});}
 contenedor.addEventListener('comercial-actualizado',actualizar);contenedor.addEventListener('precios-nv-cambiados',actualizar);actualizar();activar(contenedor.dataset.comercialFactura===payload.analisis?.id&&secciones.has(contenedor.dataset.comercialSeccion)&&!botones.get(contenedor.dataset.comercialSeccion).disabled?contenedor.dataset.comercialSeccion:soloStock?'precios':'nv');
}
