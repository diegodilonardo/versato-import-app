function plegarResultados(contenedor,validacion){
  let grupo=null;
  for(const nodo of [...contenedor.children]){
    if(nodo.parentNode!==contenedor)continue;
    if(nodo.tagName==='H3'){
      grupo=null;

      const desplegable=document.createElement('details');desplegable.className='result-section';desplegable.open=['Fotos de productos','Archivos analizados','Totales por marca','Control de Factura','Resumen de coincidencias por marca','Control de clientes'].includes(nodo.textContent);
      const resumen=document.createElement('summary');resumen.textContent=nodo.textContent;desplegable.append(resumen);
      const siguiente=nodo.nextElementSibling;
      if(siguiente?.tagName==='P'&&!siguiente.classList.contains('note')){const dato=document.createElement('span');dato.className='section-count';dato.textContent=siguiente.textContent;resumen.append(dato);siguiente.remove();}
      contenedor.insertBefore(desplegable,nodo);nodo.remove();grupo=document.createElement('div');grupo.className='section-content';desplegable.append(grupo);
    }else if(nodo===validacion||nodo.tagName==='BUTTON'||nodo.classList.contains('presea-download')){
      grupo=null;
    }else if(grupo){grupo.append(nodo);}
  }
}
const form = document.querySelector('#upload');
const input = document.querySelector('#archivo');
const button = document.querySelector('#submit');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const drop = document.querySelector('#drop');
let selected;
function select(file) {
  selected = file;
  document.querySelector('#selection').textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'Ningún archivo seleccionado';
  result.hidden = true; status.textContent = '';
}
input.addEventListener('change', () => select(input.files[0]));
for (const event of ['dragover', 'dragleave', 'drop']) drop.addEventListener(event, e => {
  e.preventDefault();
  if (button.disabled) return;
  drop.classList.toggle('dragging', event === 'dragover');
  if (event === 'drop') {
    if (e.dataTransfer.files.length !== 1) { status.textContent = 'Arrastrá un solo archivo.'; return; }
    input.files = e.dataTransfer.files;
    select(e.dataTransfer.files[0]);
  }
});
function element(tag, text, parent) {
  const node = document.createElement(tag); node.textContent = text; parent.append(node); return node;
}
function showCandidate(candidate, parent) {
  element('h3', `${candidate.nombre} · ${candidate.hoja} · fila ${candidate.filaEncabezados}`, parent);
  const chips = document.createElement('div'); chips.className = 'chips'; parent.append(chips);
  for (const h of candidate.encabezados) element('span', `${h.columna} · ${h.texto}`, chips);
  if (candidate.faltantes?.length) element('p', `Faltan: ${candidate.faltantes.join(', ')}`, parent);
}
let fotosActivas=new Map();
let visorFoto;
function abrirFoto(foto){
 if(!visorFoto){visorFoto=element('dialog','',document.body);visorFoto.className='image-dialog';const cerrar=element('button','Cerrar imagen ×',visorFoto);cerrar.type='button';cerrar.addEventListener('click',()=>visorFoto.close());element('img','',visorFoto);element('p','',visorFoto);visorFoto.addEventListener('click',e=>{if(e.target===visorFoto)visorFoto.close();});}
 const img=visorFoto.querySelector('img');img.src=foto.url;img.alt='Producto '+foto.PRODUCTO;visorFoto.querySelector('p').textContent=foto.PRODUCTO;visorFoto.showModal();
}
function miniatura(parent,producto){
 const foto=fotosActivas.get(producto);if(!foto){element('span','Sin foto',parent).className='no-photo';return;}
 const b=element('button','',parent);b.type='button';b.className='product-photo';b.setAttribute('aria-label','Ampliar foto de '+producto);b.addEventListener('click',()=>abrirFoto(foto));
 const img=element('img','',b);img.src=foto.url;img.alt='Producto '+producto;img.loading='lazy';img.width=64;img.height=52;
 img.addEventListener('error',()=>{b.disabled=true;b.title='La foto no está disponible. La vista previa puede haber vencido.';img.hidden=true;b.textContent='Sin foto';});
}
function mostrarFotos(payload,parent){
 const fotos=payload.imagenes;if(!fotos?.resumen.cargadas&&!fotos?.resumen.conFoto&&payload.analisis?.confirmado===false)return;
 element('h3','Fotos de productos',parent);
 if(payload.analisis?.confirmado!==false){
  const form=element('form','',parent);form.className='photo-upload';const label=element('label','Agregar fotos faltantes de este análisis',form);const input=element('input','',label);input.type='file';input.accept='.jpg,.jpeg,.png,.webp';input.multiple=true;input.required=true;
  element('p','Las fotos ya guardadas se reutilizan automáticamente. Solo se agregan imágenes de productos que todavía no tienen foto; las existentes no se reemplazan.',form).className='note';
  const guardar=element('button','Aceptar y guardar fotos',form);guardar.type='submit';const estado=element('p','',form);estado.setAttribute('role','status');
  form.addEventListener('submit',async e=>{e.preventDefault();const files=[...input.files];if(files.length>300||files.some(f=>f.size>5*1024*1024)||files.reduce((n,f)=>n+f.size,0)>150*1024*1024){estado.textContent='Hasta 300 fotos, 5 MB cada una y 150 MB en total.';return;}guardar.disabled=true;input.disabled=true;estado.textContent='Guardando fotos…';try{const data=new FormData();files.forEach(f=>data.append('imagenes',f));const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/imagenes',{method:'POST',body:data});const actualizado=await response.json();if(!response.ok)throw new Error(actualizado.error);mostrarAnalisis(actualizado);crossStatus.textContent='Fotos revisadas. Consultá las coincidencias y los archivos sin asociación en Fotos de productos.';}catch(error){estado.textContent=error.message||'No se pudieron guardar las fotos.';guardar.disabled=false;input.disabled=false;}});
 }
 if(!fotos?.resumen.cargadas&&!fotos?.resumen.conFoto){element('p','Todavía no hay fotos guardadas para este análisis.',parent).className='note';return;}
 const r=fotos.resumen;
 element('p',r.conFoto+' productos con foto · '+(r.reutilizadas||0)+' fotos reutilizadas · '+r.sinFoto+' sin foto · '+r.noCoincidentes+' archivos sin coincidencia',parent);
 const buscar=element('input','',parent);buscar.type='search';buscar.placeholder='Buscar producto con foto';buscar.setAttribute('aria-label','Buscar producto con foto');
 const listado=element('div','',parent);let paginaFotos=0;const porPagina=40;const render=()=>{listado.replaceChildren();const rows=[...fotosActivas.keys()].filter(p=>p.includes(buscar.value.trim()));const paginas=Math.max(1,Math.ceil(rows.length/porPagina));paginaFotos=Math.min(paginaFotos,paginas-1);const desde=paginaFotos*porPagina;const estado=element('p','Mostrando '+(rows.length?desde+1:0)+'–'+Math.min(desde+porPagina,rows.length)+' de '+rows.length+' fotos'+(buscar.value.trim()?' · '+fotosActivas.size+' en total':'')+'.',listado);estado.className='note';estado.setAttribute('role','status');
 const navegar=()=>{const nav=element('nav','',listado);nav.className='photo-pagination';nav.setAttribute('aria-label','Páginas de fotos');const anterior=element('button','Anterior',nav);anterior.type='button';anterior.disabled=paginaFotos===0;anterior.addEventListener('click',()=>{paginaFotos--;render();listado.scrollIntoView({block:'start'});});element('span','Página '+(paginaFotos+1)+' de '+paginas,nav);const siguiente=element('button','Siguiente',nav);siguiente.type='button';siguiente.disabled=paginaFotos>=paginas-1;siguiente.addEventListener('click',()=>{paginaFotos++;render();listado.scrollIntoView({block:'start'});});};
 navegar();const grid=element('div','',listado);grid.className='photo-grid';for(const producto of rows.slice(desde,desde+porPagina)){const card=element('article','',grid);miniatura(card,producto);element('p',producto,card);}if(!rows.length)element('p','No hay fotos para esta búsqueda.',listado).className='note';if(rows.length>porPagina)navegar();};buscar.addEventListener('input',()=>{paginaFotos=0;render();});render();
 if(fotos.noCoincidentes.length){const d=element('details','',parent);element('summary','Fotos sin coincidencia ('+fotos.noCoincidentes.length+')',d);table(['Archivo','Motivo'],fotos.noCoincidentes.map(f=>[f.nombre,f.motivo]),d);}
 if(r.omitidasExistentes)element('p',r.omitidasExistentes+' fotos seleccionadas ya estaban disponibles y no se volvieron a guardar.',parent).className='note';
 if(r.repetidas)element('p',r.repetidas+' fotos idénticas repetidas se consolidaron.',parent).className='note';
}
function table(headers, rows, parent) {
  const wrapper = document.createElement('div'); wrapper.className = 'table-scroll'; parent.append(wrapper);
  const table = document.createElement('table'); wrapper.append(table);
  const head = table.createTHead().insertRow();
  const productoCol=headers.indexOf('PRODUCTO');const conFoto=productoCol>=0&&fotosActivas.size>0;
  if(conFoto)element('th','Foto',head).scope='col';
  for (const label of headers) element('th', label, head).scope = 'col';
  const body = table.createTBody();
  if (!rows.length) {
    const cell = element('td', 'No hay registros para los filtros seleccionados.', body.insertRow());
    cell.colSpan = headers.length+(conFoto?1:0);
  }
  for (const row of rows) {
    const tr = body.insertRow();
    const total = row[0] === 'TOTAL GENERAL';
    if (total) tr.className = 'total-general';
    if(conFoto)miniatura(element('td','',tr),row[productoCol]);
    row.forEach((value, index) => {
      const cell = element(total && index === 0 ? 'th' : 'td', String(value ?? ''), tr);
      if (total && index === 0) cell.scope = 'row';
    });
  }
}
function showPreview(preview, parent) {
  element('h3', 'Vista previa y validación', parent);
  const stats = document.createElement('div'); stats.className = 'chips'; parent.append(stats);
  const s = preview.resumen;
  for (const text of [`${s.total} registros`, `${s.validos} válidos`, `${s.conErrores} con errores`, `${s.conAdvertencias} con advertencias`]) element('span', text, stats);

  if (preview.agrupacion) {
    const a = preview.agrupacion;
    element('h3', 'EAN agrupados', parent);
    element('p', `${a.resumen.grupos} grupos · ${a.resumen.repeticionesConsolidadas} repeticiones consolidadas · ${a.resumen.filasExcluidas} filas excluidas por errores · ${a.resumen.conflictos} conflictos de asignación`, parent);
    element('p', `Clave: ${a.columnasClave.join(' + ')}. Pares totales: ${a.resumen.pares ?? 'No disponible: faltan cantidades o hay una suma fuera de rango'}.`, parent).className = 'note';
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Buscar EAN, estilo o talle'; search.setAttribute('aria-label', 'Buscar grupos EAN'); parent.append(search);
    const list = document.createElement('div'); parent.append(list);
    const render = () => {
      list.replaceChildren();
      const query = search.value.trim().toLowerCase();
      const matches = a.grupos.filter(g => [...a.columnasClave.map(c => g[c]), ...g.MARCAS].some(v => v.toLowerCase().includes(query)));
      element('p', `Mostrando ${Math.min(matches.length, 100)} de ${matches.length} grupos.`, list).className = 'note';
      table(['Marcas', ...a.columnasClave, 'Pares sumados', 'Registros origen', 'Filas Excel'], matches.slice(0, 100).map(g => [g.MARCAS.join(', '), ...a.columnasClave.map(c => g[c]), g.PARES ?? 'Cantidad incompleta', g.registrosOrigen, g.filasOrigen.join(', ')]), list);
    };
    search.addEventListener('input', render); render();
    const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Descargar agrupación completa (JSON)'; parent.append(download);
    download.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'ean-agrupados.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  const mapping = document.createElement('details'); parent.append(mapping);
  element('summary', 'Ver mapeo de columnas', mapping);
  table(['Columna Excel', 'Encabezado', 'Campo de destino'], preview.mapeo.map(m => [m.columna || '—', m.origen || 'No disponible (opcional)', m.destino]), mapping);
  element('h3', 'Primeras 20 filas', parent);
  const campos = preview.mapeo.map(m => m.destino);
  table(['Fila Excel', ...campos, 'Estado'], preview.filas.map(r => [r.fila, ...campos.map(c => r.datos[c]), r.errores.length ? 'Con errores' : r.advertencias.length ? 'Revisar advertencias' : 'Válido']), parent);
  if (preview.totalProblemas) {
    element('h3', `Filas para revisar (${preview.totalProblemas})`, parent);
    element('p', `Se muestran hasta ${preview.limiteProblemas} filas con problemas.`, parent).className = 'note';
    table(['Fila Excel', 'Errores', 'Advertencias'], preview.problemas.map(r => [r.fila, r.errores.join(' · '), r.advertencias.join(' · ')]), parent);
  }
  if (!s.total) element('p', 'La hoja tiene encabezados pero no contiene registros.', parent);
}
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!selected) { status.textContent = 'Seleccioná un archivo.'; return; }
  result.hidden = true;
  if (!/\.(xls|xlsx|xlsm)$/i.test(selected.name) || selected.size > 60 * 1024 * 1024) {
    status.textContent = 'Usá un Excel .xls, .xlsx o .xlsm de hasta 60 MB.'; return;
  }
  button.disabled = true; input.disabled = true; form.setAttribute('aria-busy', 'true');
  status.textContent = 'Analizando las hojas del archivo…';
  const data = new FormData(); data.append('archivo', selected);
  try {
    const response = await fetch('/api/importaciones/detectar', { method: 'POST', body: data });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error),{analisisId:payload.analisisId});
    result.replaceChildren(); result.hidden = false;
    element('p', payload.estado === 'DETECTADO' ? 'DETECCIÓN COMPLETA' : payload.estado.replaceAll('_', ' '), result).className = 'eyebrow';
    element('h2', payload.estado === 'DETECTADO' ? payload.nombre : 'Revisá el archivo', result);
    element('p', payload.archivo, result).className = 'filename';
    if (payload.estado === 'DETECTADO') {
      showCandidate(payload, result);
      if (payload.vistaPrevia) showPreview(payload.vistaPrevia, result);
      else element('p', 'No se recibió una vista previa para este archivo.', result).className = 'note';
    }
    else {
      element('p', payload.mensaje, result);
      for (const candidate of payload.coincidencias.length ? payload.coincidencias : payload.diagnostico) showCandidate(candidate, result);
    }
    const details = document.createElement('details'); result.append(details);
    element('summary', 'Ver respuesta JSON', details);
    element('pre', JSON.stringify(payload, null, 2), details);
    status.textContent = 'Análisis finalizado.';
  } catch (error) { status.textContent = error.message || 'No se pudo conectar con el servidor.'; }
  finally { button.disabled = false; input.disabled = false; form.removeAttribute('aria-busy'); }
});
const crossForm = document.querySelector('#cross-form');
const crossFiles = document.querySelector('#cross-files');
const crossButton = document.querySelector('#cross-submit');
const crossStatus = document.querySelector('#cross-status');
const crossResult = document.querySelector('#cross-result');
const crossError = document.createElement('div'); crossError.className = 'error-notice'; crossError.hidden = true;
crossError.setAttribute('role', 'alert'); crossError.tabIndex = -1; crossResult.before(crossError);
const crossDrop = document.querySelector('#cross-drop');
function crossSelection() {
  crossResult.hidden = true; crossError.hidden = true; crossStatus.textContent = '';
  const files = [...crossFiles.files];
  document.querySelector('#cross-selection').textContent = files.length
    ? `${files.length} archivos (3 habituales + Factura opcional): ${files.map(f => `${f.name} (${(f.size / 1024).toFixed(0)} KB)`).join(' · ')}`
    : 'Ningún archivo seleccionado';
}
crossFiles.addEventListener('change', crossSelection);
for (const event of ['dragover', 'dragleave', 'drop']) crossDrop.addEventListener(event, e => {
  e.preventDefault(); if (crossButton.disabled) return;
  crossDrop.classList.toggle('dragging', event === 'dragover');
  if (event === 'drop') {
    if (![3,4].includes(e.dataTransfer.files.length)) { crossResult.hidden = true; crossStatus.textContent = 'Arrastrá Packing List, Códigos de Barra y EAN; podés sumar la Factura como cuarto archivo.'; return; }
    crossFiles.files = e.dataTransfer.files; crossSelection();
  }
});
const photoInput=document.querySelector('#product-photos');
photoInput.addEventListener('change',()=>{document.querySelector('#photo-selection').textContent=photoInput.files.length?photoInput.files.length+' fotos seleccionadas.':'Sin fotos seleccionadas.';});
crossForm.addEventListener('submit', async e => {
  e.preventDefault(); crossResult.hidden = true; crossError.hidden = true;
  const files = [...crossFiles.files];
  if (![3,4].includes(files.length) || files.some(f => !/\.(xls|xlsx|xlsm)$/i.test(f.name) || f.size > 60 * 1024 * 1024)) {
    crossStatus.textContent = 'Seleccioná los tres archivos habituales y la Factura opcional, de hasta 60 MB cada uno.'; return;
  }
  const fotos=[...photoInput.files];
  if(fotos.length>300||fotos.some(f=>!(/\.(jpe?g|png|webp)$/i.test(f.name))||f.size>5*1024*1024)||fotos.reduce((n,f)=>n+f.size,0)>150*1024*1024){crossStatus.textContent='Seleccioná hasta 300 fotos JPG, PNG o WebP, de hasta 5 MB cada una y 150 MB en total.';return;}
  const data = new FormData(); fotos.forEach(f=>data.append('imagenes',f)); files.forEach(f => data.append('archivos', f));
  crossButton.disabled = true; crossFiles.disabled = true; photoInput.disabled=true; crossForm.setAttribute('aria-busy', 'true');
  crossStatus.textContent = 'Analizando la factura: archivos, EAN, cantidades y maestro…';
  let respuestaRecibida = false;
  try {
    const response = await fetch('/api/importaciones/cruzar', { method: 'POST', body: data });
    const payload = await response.json();
    respuestaRecibida = true;
    if (!response.ok) throw new Error(payload.error);
    mostrarAnalisis(payload);
  } catch (error) {
    const conexionInterrumpida = !respuestaRecibida && error instanceof TypeError;
    crossStatus.textContent = conexionInterrumpida ? 'Análisis interrumpido por un problema de conexión.' : 'No se completó el análisis de la factura.';
    crossError.replaceChildren(); crossError.hidden = false;
    element('strong', 'No se pudo analizar la factura', crossError);
    element('p', conexionInterrumpida ? 'Se perdió la conexión con la app. Volvé a intentar con los mismos archivos.' : error.message || 'No se pudo comparar.', crossError);
    if(error.analisisId){const link=element('a','Abrir el análisis ya registrado',crossError);link.href='/importaciones?analisis='+encodeURIComponent(error.analisisId);}
    if (/SIZE RUN/i.test(error.message || '')) element('p', 'SIZE RUN es un requisito obligatorio. Corregí el archivo de Factura para incluir esa columna y sus valores, y volvé a cargarlo.', crossError);
    crossError.focus();
  }
  finally { crossButton.disabled = false; crossFiles.disabled = false; photoInput.disabled=false; crossForm.removeAttribute('aria-busy'); }
});


const numeroResumen=n=>n==null?'No disponible':Number(n).toLocaleString('es-AR');
function crearTarjeta(parent,titulo,clase=''){
 const card=element('article','',parent);card.className='summary-card '+clase;const heading=element('h4',titulo,card);heading.className='summary-title';return card;
}
function datosTarjeta(card,datos){const dl=element('dl','',card);dl.className='card-data';for(const [etiqueta,valor]of datos){const item=element('div','',dl);element('dt',etiqueta,item);element('dd',valor,item);}return dl;}
function indicadores(parent,items){const grid=element('div','',parent);grid.className='stats-grid';for(const [titulo,valor,tono]of items){const c=crearTarjeta(grid,titulo,tono||'');element('strong',numeroResumen(valor),c).className='stat-value';}return grid;}


function organizarAcciones(contenedor,payload,controles){
 const secciones=[...contenedor.querySelectorAll(':scope > section.presea-download')];if(!secciones.length)return;
 const panel=element('section','',contenedor);panel.className='presea-download delivery-panel';contenedor.insertBefore(panel,secciones[0]);
 element('h3','Archivos para Presea',panel);element('p','Descargá cada archivo del análisis o enviá el lote completo al FTP.',panel).className='card-caption';
 const grid=element('div','',panel);grid.className='download-grid';
 const productos=payload.exportacionProductosPresea,dbi=payload.exportacionDBI,extras=payload.exportacionAdicionalesDBI;
 const opciones=[
  ['Modelos','MODELOS_VERSATO.DBI',extras?.modelos?.total,'modelos','Modelos nuevos',extras?.modelos],
  ['Productos','PRODUCTOS_VERSATO.DBI',productos?.total,'productos',productos?productos.modulos+' módulos · '+productos.sueltos+' sueltos':'',productos],
  ['Datos adicionales','PRODUCTOS_VERSATO_STOCKADI.DBI',extras?.stockadi?.total,'registros','Datos de módulos y sueltos',extras?.stockadi],
  ['Fórmulas de módulos','PRODUCTOS_RELFORMU.DBI',dbi?.modulos,'fórmulas','Cabecera de cada módulo',dbi],
  ['Relaciones de sueltos','PRODUCTOS_RELACION.DBI',dbi?.componentes,'relaciones','Talles y cantidades por módulo',dbi]
 ];
 const botones=secciones.flatMap(section=>[...section.querySelectorAll('button')]);
 for(const [titulo,nombre,total,unidad,descripcion,datos]of opciones){
  const boton=botones.find(b=>b.textContent.includes(nombre));if(!boton||!datos)continue;
  const card=crearTarjeta(grid,titulo,'download-card');element('p',nombre,card).className='download-filename';
  const cantidad=element('p','',card);cantidad.className='download-count';element('strong',numeroResumen(total),cantidad);element('span',unidad,cantidad);
  element('p',descripcion,card).className='card-caption';
  const estado=payload.analisis?.confirmado===false?'Pendiente de aceptación':datos.bloqueada?'Pendiente de revisión':total?'Disponible':'Sin registros';element('span',estado,card).className='download-state '+(!boton.disabled?'is-ready':'');
  if(datos.mensaje)element('p',datos.mensaje,card).className='download-notice';
  if(datos.excluidas?.length){const d=element('details','',card);d.className='download-issues';element('summary',datos.excluidas.length+' excluidos · Ver motivos',d);table(['Clave','Motivos'],datos.excluidas.map(r=>[r.clave,(r.motivos||[]).join(' · ')]),d);}
  boton.textContent='Descargar DBI';boton.setAttribute('aria-label','Descargar '+nombre);card.append(boton);
  const enviar=element('button','Enviar al FTP',card);enviar.type='button';enviar.className='secondary';enviar.disabled=boton.disabled;enviar.setAttribute('aria-label','Enviar '+nombre+' al FTP');const mensajeFTP=element('p','',card);mensajeFTP.className='note';mensajeFTP.setAttribute('role','status');enviar.title='Destino: /ALTAS_PRODUCTOS/VERSATO. Reemplaza el archivo con el mismo nombre.';enviar.addEventListener('click',async()=>{enviar.disabled=true;mensajeFTP.textContent='Enviando '+nombre+'…';try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/enviar-ftp/'+encodeURIComponent(nombre),{method:'POST'});const r=await response.json();mensajeFTP.textContent=r.mensaje||r.error||'No se pudo confirmar el envío.';}catch(error){mensajeFTP.textContent='No se pudo confirmar el envío. Revisá el FTP antes de reintentar.';}finally{enviar.disabled=boton.disabled;}});
 }
 const ftp=secciones.find(section=>section.querySelector('button')?.textContent==='Enviar los 5 DBI al FTP');
 for(const section of secciones)if(section!==ftp)section.remove();
 if(ftp){ftp.classList.add('ftp-card');const heading=ftp.querySelector('h3');heading.textContent='Enviar lote completo al FTP';const boton=ftp.querySelector('button');boton.textContent='Enviar los 5 DBI al FTP';contenedor.insertBefore(ftp,panel.nextSibling);}
 const control=element('section','',contenedor);control.className='presea-download control-downloads';element('h3','Archivos de consulta',control);const controlGrid=element('div','',control);controlGrid.className='control-download-grid';
 for(const [i,boton]of controles.entries()){const card=crearTarjeta(controlGrid,i===0?'Cruce completo':'Comparación de datos','control-download-card');element('p',i===0?'Excel con todos los controles y resultados.':'Respuesta completa del análisis en formato JSON.',card).className='card-caption';boton.style.marginTop='0';card.append(boton);}
}

function mostrarCambiosClienteNV(payload,card,cliente){
 const cambios=globalThis.historialClienteNV.cambiosDelCliente(payload.correccionesClientes,cliente);
 if(!cambios.length)return;
 const aviso=element('div','',card);aviso.className='nv-change-notice';
 element('strong','NV modificada · cambio de cliente',aviso);
 element('p','La asignación original fue modificada. Revisá el cliente y el domicilio de entrega antes de enviar esta NV.',aviso);
 const fecha=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'Fecha no disponible':d.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});};
 const ultimo=cambios.at(-1);
 element('p','Último cambio: '+fecha(ultimo.fecha),aviso).className='nv-change-date';
 const detalle=element('details','',aviso);element('summary','Ver cambios de cliente ('+cambios.length+')',detalle);
 const lista=element('ol','',detalle);lista.className='nv-change-history';
 const cantidad=v=>typeof v==='number'?numeroResumen(v):'—';
 for(const c of cambios){
  const item=element('li','',lista);
  element('strong',(c.anterior||'Sin código')+' · '+(c.nombreAnterior||'Sin nombre')+' → '+c.nuevo+' · '+(c.nombreNuevo||'Sin nombre'),item);
  element('p',fecha(c.fecha),item).className='nv-change-date';
  element('p','Motivo: '+(c.motivo||'No registrado'),item);
  element('p','Packing: '+cantidad(c.cajasPacking)+' cajas · '+cantidad(c.paresPacking)+' pares. Códigos de barra: '+cantidad(c.cajasCodigos)+' cajas · '+cantidad(c.paresCodigos)+' pares.',item);
  element('p','Se reasignaron todas las cajas del cliente de origen en esta factura.',item);
  element('p','Referencia anterior: nv_cliente_'+c.anterior+'.dbi',item).className='download-filename';
 }
}
function mostrarNV(payload,parent){
 const section=element('section','',parent);section.className='presea-download nv-panel';section.dataset.comercial='nv';element('h3','Notas de Venta por cliente',section);
 element('p','Un DBI por cliente. Las NV y los domicilios elegidos quedan guardados con la factura. Administración (131600) queda excluido.',section).className='card-caption';
 const preparar=element('button','Generar NV',section);preparar.type='button';const pendiente=payload.analisis?.confirmado===false||!payload.analisis?.persistente;preparar.disabled=pendiente;const revisarPendientes=element('button','Revisar pendientes desde maestros',section);revisarPendientes.type='button';revisarPendientes.className='secondary';revisarPendientes.hidden=true;
 const estado=element('p','',section);estado.setAttribute('role','status');const contenido=element('div','',section);let guardadas=payload.notasVenta||null;
 const base='/api/importaciones/analisis/'+encodeURIComponent(payload.analisis?.id)+'/nv';
 function nvExistePresea(cliente) {
  const c = payload.controlNVPresea;
  return !!(c?.disponible && c.revisionNV === guardadas?.revision &&
   c.correccionesOrigen === JSON.stringify(payload.correccionesClientes || []) &&
   c.filas.some(r => r.cliente === cliente && r.importadas > 0 && r.numeros?.length));
 }
 function pintar(p){
  guardadas=p;payload.notasVenta=p;if(typeof verificarImportacion!=='undefined')verificarImportacion.disabled=pendiente||!guardadas;preparar.textContent='NV generadas';preparar.disabled=true;revisarPendientes.hidden=!(p.clientes.some(c=>c.bloqueada)||p.correccionesOrigen!==JSON.stringify(payload.correccionesClientes||[]));revisarPendientes.disabled=pendiente;contenido.replaceChildren();
  const desactualizadas=p.correccionesOrigen!==JSON.stringify(payload.correccionesClientes||[]);
  element('p',p.clientes.length+' clientes · '+p.cajasExcluidas+' cajas de Administración excluidas · Guardadas: '+new Date(p.preparado).toLocaleString('es-AR'),contenido).className='note';
  if(p.controlProductos){const cp=p.controlProductos;element('p','Maestro de productos consultado: '+new Date(cp.consultado).toLocaleString('es-AR')+' · '+cp.archivo,contenido).className='note';if(cp.pendientes){element('p',cp.pendientes+' productos de clientes pendientes de impacto en Presea. Sus NV no se pueden descargar ni enviar. Después de importar y exportar el maestro desde Presea, volvé a actualizar.',contenido).className='download-notice';const d=element('details','',contenido);element('summary','Productos pendientes de impacto en Presea',d);table(['Cliente','Producto','SIZE RUN','Código Versato','Cajas'],cp.filas.filter(r=>r.estado==='PENDIENTE_IMPACTO_PRESEA').map(r=>[r.cliente,r.PRODUCTO,r.SIZE_RUN,r.claveVersato,r.cajas]),d);}else element('p',cp.filas.some(r=>r.estado!=='ENCONTRADO')?'Hay productos con datos ambiguos en el maestro; revisá sus NV.':'Todos los productos de las NV fueron encontrados en el maestro de Presea.',contenido).className='note';}
  if(desactualizadas)element('p','Cambió la asignación de clientes. Actualizá las NV desde maestros antes de descargar.',contenido).className='download-notice';
  for(const error of p.errores||[])element('p',error,contenido).className='download-notice';
  const grid=element('div','',contenido);grid.className='download-grid';
  for(const c of p.clientes){
   const card=crearTarjeta(grid,c.nombre||('Cliente '+c.cliente),'download-card');element('p',c.nombreArchivo,card).className='download-filename';element('p',c.cajas+' cajas · '+c.filas.length+' productos',card).className='card-caption';const estadoImportacion=element('div','',card);estadoImportacion.dataset.nvImportacionCliente=c.cliente;estadoImportacion.dataset.estadoBase=c.pendientesImpacto?'Pendiente de impacto en Presea':c.bloqueada?'Para revisar':'Disponible';estadoImportacion.dataset.disponible=String(!c.bloqueada);
   mostrarCambiosClienteNV(payload,card,c.cliente);
   for(const error of c.errores)element('p',error,card).className='download-notice';
   if(c.requiereDomicilio&&!nvExistePresea(c.cliente)&&!desactualizadas&&!pendiente)mostrarCorreccionCliente(payload,card,c.cliente);
   const detalle=element('details','',card);element('summary','Ver detalle',detalle);table(['Marca','Modelo','Color','COD_ALFA','Cantidad'],globalThis.detalleNV.filas(payload,c.cliente).map(r=>[r.marca||'—',r.modelo||'—',r.color||'—',r.codAlfa,numeroResumen(r.cantidad)]),detalle);detalle.classList.add('nv-product-detail');
   let domicilio=null,sinGuardar=false;const actual=Object.hasOwn(c,'domicilioElegido')?c.domicilioElegido:!c.requiereDomicilio?c.filas[0]?.DOMI_ENTRE:undefined;
   if(c.domicilios.length>1){
    const label=element('label','Domicilio de entrega',card);domicilio=element('select','',label);domicilio.setAttribute('aria-label','Domicilio de entrega de '+c.cliente);const domicilioBloqueado=!c.requiereDomicilio||nvExistePresea(c.cliente)||desactualizadas;domicilio.disabled=domicilioBloqueado;const inicial=element('option','Seleccioná un domicilio',domicilio);inicial.value='';inicial.disabled=true;inicial.selected=true;
    for(const [i,d]of c.domicilios.entries()){const direccion=c.detalleDomicilios?.find(v=>v.codigo===d)?.direccion;const option=element('option',(d||'Sin código de domicilio')+(direccion?' - '+direccion:''),domicilio);option.value=String(i);if(actual!==undefined&&actual===d)option.selected=true;}
    const guardar=element('button','Guardar domicilio',card);guardar.type='button';guardar.className='secondary';guardar.disabled=true;guardar.hidden=domicilioBloqueado;if(domicilioBloqueado)element('p','Domicilio fijado en la NV generada.',card).className='note';
    domicilio.addEventListener('change',()=>{sinGuardar=c.domicilios[Number(domicilio.value)]!==actual;domicilio.dataset.sinGuardar=String(sinGuardar);guardar.disabled=!sinGuardar||desactualizadas;descargar.disabled=sinGuardar||c.bloqueada||desactualizadas;});
    guardar.addEventListener('click',async()=>{guardar.disabled=true;domicilio.disabled=true;estado.textContent='Guardando domicilio…';try{const r=await fetch(base+'/'+encodeURIComponent(c.cliente)+'/domicilio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domicilio:c.domicilios[Number(domicilio.value)],revision:guardadas.revision})}),nv=await r.json();if(!r.ok)throw new Error(nv.error);pintar(nv);estado.textContent='Domicilio guardado con la factura.';}catch(e){estado.textContent=e.message;guardar.disabled=false;domicilio.disabled=false;}});
   }else if(c.detalleDomicilios?.length){const d=c.detalleDomicilios[0];element('p','Domicilio: '+(d.codigo||'Sin código')+(d.direccion?' - '+d.direccion:''),card).className='card-caption';}
   const descargar=element('button','Descargar NV (DBI)',card);descargar.type='button';descargar.disabled=c.bloqueada||!c.filas.length||desactualizadas;
   descargar.addEventListener('click',async()=>{descargar.disabled=true;try{const r=await fetch(base+'/'+encodeURIComponent(c.cliente));if(!r.ok)throw new Error((await r.json()).error);const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=c.nombreArchivo;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);estado.textContent=c.nombreArchivo+' descargado desde las NV guardadas.';}catch(e){estado.textContent=e.message;}finally{descargar.disabled=sinGuardar||c.bloqueada||desactualizadas;}});
   const excel=element('button','Descargar detalle (Excel)',card);excel.type='button';excel.className='secondary';excel.disabled=pendiente||c.bloqueada||desactualizadas;
   excel.addEventListener('click',async()=>{excel.disabled=true;estado.textContent='Preparando detalle Excel de '+c.nombre+'…';try{const r=await fetch(base+'/'+encodeURIComponent(c.cliente)+'/detalle.xlsx');if(!r.ok)throw Error((await r.json()).error);const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='Detalle NV - '+String(payload.facturas?.[0]||'factura').replace(/[^A-Za-z0-9-]/g,'-')+' - Cliente '+c.cliente+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);estado.textContent='Detalle Excel del cliente '+c.cliente+' descargado.';}catch(e){estado.textContent=e.message;}finally{excel.disabled=pendiente||c.bloqueada||desactualizadas;}});

  }
  actualizarEstadosImportacion();parent.dispatchEvent(new Event('comercial-actualizado'));
 }
 async function generarNV(actualizar=false){preparar.disabled=true;revisarPendientes.disabled=true;estado.textContent=actualizar?'Revisando pendientes con los maestros actuales…':'Generando NV…';try{const response=await fetch(base+(actualizar?'/actualizar':'/preparar'),{method:'POST'}),p=await response.json();if(!response.ok)throw new Error(p.error);pintar(p);estado.textContent='NV guardadas. Las que ya estaban listas se conservan sin regenerarlas.';}catch(e){
  if(e instanceof TypeError){
   try {
    const response=await fetch('/api/historial/'+encodeURIComponent(payload.analisis.id),{cache:'no-store'});
    if(response.ok){
     const guardado=await response.json();
     if(guardado.notasVenta?.revision&&guardado.notasVenta.revision!==guardadas?.revision){
      pintar(guardado.notasVenta);
      estado.textContent='NV recuperadas de la base de datos.';
      return;
     }
    }
   } catch {}
   estado.textContent='Se interrumpió la conexión. Volvé a intentar generar las NV.';
  } else estado.textContent=e.message||'No se pudieron generar las NV.';
 }finally{preparar.disabled=pendiente||!!guardadas;revisarPendientes.disabled=pendiente;}}
 preparar.addEventListener('click',()=>generarNV(false));revisarPendientes.addEventListener('click',()=>generarNV(true));
 const panelImportacion=element('section','',section);panelImportacion.className='nv-import-panel';panelImportacion.dataset.comercial='importacion';element('h3','Control de NV importadas en Presea',panelImportacion);element('p','Consultá los números asignados por Presea y controlá clientes, productos y cantidades.',panelImportacion).className='card-caption';const estadoControlNV=element('p','',panelImportacion);estadoControlNV.setAttribute('role','status');
 const verificarImportacion=element('button','Verificar NV importadas en Presea',panelImportacion);verificarImportacion.type='button';verificarImportacion.className='secondary';verificarImportacion.disabled=pendiente||!guardadas;
 const controlImportacion=element('div','',panelImportacion);
 function actualizarEstadosImportacion(){const c=payload.controlNVPresea;const vigente=!!(c?.disponible&&c.revisionNV===guardadas?.revision&&c.correccionesOrigen===JSON.stringify(payload.correccionesClientes||[]));for(const destino of section.querySelectorAll('[data-nv-importacion-cliente]')){destino.replaceChildren();const filas=(c?.filas||[]).filter(r=>r.cliente===destino.dataset.nvImportacionCliente),numeros=[...new Set(filas.flatMap(r=>r.numeros||[]))].sort(),existe=vigente&&filas.length>0&&filas.every(r=>r.estado==='IMPORTADO');const badge=element('span',existe?'Ya existe en Presea':vigente&&numeros.length?'Impactó en Presea · Revisar':destino.dataset.estadoBase,destino);badge.className='download-state '+(existe||destino.dataset.disponible==='true'?'is-ready':'');if(numeros.length){element('p',(numeros.length===1?'NV Presea: ':'NV Presea: ')+numeros.join(' · '),destino).className='card-caption';if(!vigente)element('p','Números de la última consulta. Volvé a verificar el estado actual.',destino).className='note';}}}
 function pintarImportacion(c){actualizarEstadosImportacion();controlImportacion.replaceChildren();if(!c)return;const vigente=c.revisionNV===guardadas?.revision&&c.correccionesOrigen===JSON.stringify(payload.correccionesClientes||[]);element('p','Consulta: '+new Date(c.fecha).toLocaleString('es-AR')+' · '+(c.maestro?.archivo||'Detalle_NV.TXT'),controlImportacion).className='note';if(!vigente)element('p','Las NV o los clientes cambiaron después del control. Volvé a verificar.',controlImportacion).className='download-notice';if(!c.disponible){element('p',c.mensaje,controlImportacion);return;}const r=c.resumen;element('p',r.notasVenta+' NV en Presea · '+r.importados+' productos importados · '+r.revisar+' para revisar · '+r.cajasPresea+' cajas en Presea / '+r.cajasEsperadas+' esperadas',controlImportacion);const detalle=element('details','',controlImportacion);element('summary','Detalle de importación por cliente y producto',detalle);const label=element('label','',detalle),check=element('input','',label);check.type='checkbox';check.checked=true;label.append(' Mostrar solo diferencias');const tabla=element('div','',detalle);const dibujar=()=>{tabla.replaceChildren();table(['Cliente','Nombre','COD_ALFA','NV Presea','Cajas esperadas','Cajas Presea','Precio Presea','Estado'],c.filas.filter(r=>!check.checked||r.estado!=='IMPORTADO').map(r=>[r.cliente,r.nombre,r.codAlfa,r.numeros.join(', '),r.esperadas,r.importadas,r.precios.join(' / '),r.diferencias.join(' · ')||'Importado']),tabla);};check.addEventListener('change',dibujar);dibujar();}
 verificarImportacion.addEventListener('click',async()=>{verificarImportacion.disabled=true;estadoControlNV.textContent='Consultando Detalle_NV.TXT del FTP…';try{const r=await fetch(base+'/verificar-presea',{method:'POST'}),c=await r.json();if(!r.ok)throw new Error(c.error);payload.controlNVPresea=c;pintarImportacion(c);parent.dispatchEvent(new Event('comercial-actualizado'));estadoControlNV.textContent=c.valida?'Todas las NV guardadas coinciden con Presea.':c.mensaje||'Control guardado. Hay diferencias para revisar.';}catch(e){estadoControlNV.textContent=e.message;}finally{verificarImportacion.disabled=pendiente||!guardadas;}});pintarImportacion(payload.controlNVPresea);
 if(guardadas)pintar(guardadas);
}
function preciosNVListos(payload){const p=payload.preciosNV;return !!(p?.revision&&!p.bloqueada&&p.filas?.length);}
function mostrarPreciosNV(payload,parent){
 const section=element('section','',parent);section.className='presea-download nv-panel';section.dataset.comercial='precios';element('h3','Precios de la factura · PRECIOS_NV.DBI',section);
 element('p','Todos los módulos y sueltos de la factura. Listas 03 y 980: mismo precio; lista 04: precio × 1,05. Versión 1.',section).className='card-caption';
 element('p','El control actualiza la lista de Presea en SQL y la compara con el consolidado activo. El DBI incluye los precios faltantes o distintos.',section).className='note';const accionesPrecios=element('div','',section);accionesPrecios.className='price-actions';
 const preparar=element('button','Calcular y controlar precios',accionesPrecios);preparar.type='button';const pendiente=payload.analisis?.confirmado===false||!payload.analisis?.persistente;preparar.disabled=pendiente;const estado=element('p','',section);estado.setAttribute('role','status');const contenido=element('div','',section);
 const base='/api/importaciones/analisis/'+encodeURIComponent(payload.analisis?.id)+'/precios-nv';
 function pintar(p){payload.preciosNV=p;parent.dispatchEvent(new Event('precios-nv-cambiados'));contenido.replaceChildren();accionesPrecios.replaceChildren(preparar);preparar.textContent='Calcular y controlar precios';element('p',p.resumen.modulos+' módulos · '+p.resumen.sueltos+' sueltos · '+p.resumen.registros+' registros para las tres listas',contenido);element('p','Guardado: '+new Date(p.preparado).toLocaleString('es-AR')+' · Coeficientes vigentes al '+p.fecha+'. Las descargas conservan este cálculo.',contenido).className='note';
  element('span',p.bloqueada?'Pendiente de revisión':'Disponible',contenido).className='download-state '+(p.bloqueada?'':'is-ready');
  if(p.errores.length){const d=element('details','',contenido);element('summary',p.errores.length+' problemas para revisar',d);table(['Tipo','Producto / EAN','Motivo'],p.errores.map(e=>[e.tipo,e.clave,e.motivo]),d);}
  const detalle=element('details','',contenido);element('summary','Ver primeras 20 definiciones de precio',detalle);table(['Tipo','Modelo','Código','COD_ALFA','Pares','Mayorista por par','Precio listas 03/980'],p.productos.slice(0,20).map(r=>[r.tipo,r.modelo,r.codigo,r.cod_alfa,r.pares,r.precioPar,r.precioBase]),detalle);
  const c=p.comprobacionMaestro?.criterio==='PRECIOS_FACTURA'?p.comprobacionMaestro:null;
  const puedeEnviar=!pendiente&&!p.bloqueada&&c?.revision===p.revision&&c.pendientes>0&&!c.resumen.conflictos;
  const resultado = p.bloqueada ? 'Resolvé los problemas del cálculo y volvé a intentar.'
   : !c ? 'Calculá y controlá los precios para obtener el resultado.'
   : c.resumen.conflictos ? 'Hay precios contradictorios en Presea. Revisá el detalle antes de enviar.'
   : c.pendientes ? c.pendientes + ' precios para actualizar en Presea.'
   : 'No hay precios para actualizar. Todos coinciden con Presea.';
  element('p',resultado,contenido).className='download-notice';
  if(c?.pendientes && p.flujoFTP?.envio?.ok)element('p','Después de importar el DBI, actualizá la lista desde Presea y volvé a calcular y controlar.',contenido).className='note';
  const soloStock = facturaSoloAdministracion(payload);
  const nv = payload.notasVenta;
  const controlNV = payload.controlNVPresea;
  const nvVigentes = nv?.revision && nv.correccionesOrigen === JSON.stringify(payload.correccionesClientes || []);
  const hayNVPendientes = nvVigentes && nv.clientes.some(cliente =>
   cliente.cliente !== '131600' && !cliente.bloqueada && cliente.filas.length &&
   !(controlNV?.disponible && controlNV.revisionNV === nv.revision &&
     controlNV.correccionesOrigen === nv.correccionesOrigen &&
     controlNV.filas.some(fila => fila.cliente === cliente.cliente && fila.importadas > 0 && fila.numeros?.length)));
  const puedeEnviarLote = soloStock ? puedeEnviar :
   !pendiente && !p.bloqueada && c?.revision === p.revision && !c.resumen.conflictos && !!hayNVPendientes;
  const enviar = element('button', soloStock ? 'Enviar precios al FTP' : 'Enviar precios y NV al FTP', accionesPrecios);
  enviar.type = 'button';
  enviar.className = 'secondary';
  enviar.disabled = !puedeEnviarLote;
  if (!soloStock && !hayNVPendientes) element('p', nvVigentes
   ? 'Se requiere al menos una NV lista y pendiente de envío.'
   : 'Generá las notas en el paso 1 para habilitar el envío.', contenido).className = 'note';
  enviar.addEventListener('click', async () => {
   if (!soloStock && parent.querySelector('[data-sin-guardar="true"]')) {
    estado.textContent = 'Guardá los cambios de domicilio antes de enviar las NV.';
    return;
   }
   const controles = [...parent.querySelectorAll('button,select')].map(control => [control, control.disabled]);
   for (const [control] of controles) control.disabled = true;
   estado.textContent = soloStock ? 'Enviando precios al FTP…' : 'Comprobando las NV y enviando el lote al FTP…';
   const barra = element('progress', '', estado);
   barra.setAttribute('aria-label', 'Actividad del envío al FTP');
   const tiempo = element('span', '', estado);
   const inicio = performance.now();
   function mostrarTiempo() {
    const segundos = Math.floor((performance.now() - inicio) / 1000);
    tiempo.textContent = ' Tiempo transcurrido ' + [Math.floor(segundos / 60), segundos % 60].map(n => String(n).padStart(2,'0')).join(':');
   }
   mostrarTiempo();
   const reloj = setInterval(mostrarTiempo, 1000);
   try {
    const destino = soloStock ? base + '/enviar-ftp' : base.replace(/precios-nv$/, 'nv') + '/enviar-ftp';
    const respuesta = await fetch(destino, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
     revision:soloStock ? p.revision : nv.revision, revisionPrecios:p.revision
    })});
    const datos = await respuesta.json();
    const envio = soloStock ? datos.envio : datos;
    if (datos.precios) pintar(datos.precios);
    estado.textContent = datos.error || envio?.mensaje || 'No se pudo confirmar el envío.';
    if (envio?.archivos?.length) table(['Archivo','Estado'], envio.archivos.map(archivo => [archivo.nombre,archivo.estado]), contenido);
    if (envio?.excluidos?.length) estado.textContent += ' NV excluidas: ' + envio.excluidos.length + '.';
   } catch (error) {
    estado.textContent = 'No se pudo confirmar el envío. Revisá el historial y el FTP.';
   } finally {
    clearInterval(reloj);
    barra.remove();
    mostrarTiempo();
    estado.append(tiempo);
    for (const [control, disabled] of controles) control.disabled = disabled;
   }
  });
  if(c){
   const {iguales,faltantes,distintos,conflictos}=c.resumen;
   element('p','Copia de Presea del '+new Date(c.fecha).toLocaleString('es-AR')+' · '+iguales+' iguales · '+faltantes+' faltantes · '+distintos+' distintos · '+conflictos+' en conflicto',contenido).className='note';
   const diferencias=c.filas.filter(r=>r.estado!=='IGUAL');
   if(diferencias.length){
    const d=element('details','',contenido);d.open=true;
    element('summary',diferencias.length+' precios para revisar',d);
    table(['Código','COD_ALFA','Lista','Versión','Calculado','En Presea','Estado'],diferencias.map(r=>[r.codigo,r.cod_alfa,r.LISTAPRE,r.VERSION,r.PRECIO,r.presea.join(' / ')||'—',r.estado]),d);
   }
  }
  const b=element('button','Descargar DBI',accionesPrecios);b.type='button';b.className='secondary';b.disabled=!puedeEnviar;b.addEventListener('click',async()=>{b.disabled=true;try{const r=await fetch(base);if(!r.ok)throw new Error((await r.json()).error);const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='PRECIOS_NV.DBI';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);estado.textContent='PRECIOS_NV.DBI descargado. La importación se realiza desde Presea.';}catch(e){estado.textContent=e.message;}finally{b.disabled=!puedeEnviar;}});
 }
 parent.addEventListener('comercial-actualizado',()=>{if(payload.preciosNV)pintar(payload.preciosNV);});
 preparar.addEventListener('click', async () => {
  const controles = [...accionesPrecios.querySelectorAll('button')].map(boton => [boton, boton.disabled]);
  for (const [boton] of controles) boton.disabled = true;
  estado.textContent = 'Actualizando la lista de Presea y controlando los precios…';
  const barra = element('progress', '', estado);
  barra.setAttribute('aria-label', 'Actividad del cálculo y control de precios');
  const tiempo = element('span', '', estado);
  const inicio = performance.now();
  function mostrarTiempo() {
   const segundos = Math.floor((performance.now() - inicio) / 1000);
   const reloj = [Math.floor(segundos / 60), segundos % 60].map(n => String(n).padStart(2, '0')).join(':');
   tiempo.textContent = ' Tiempo transcurrido ' + reloj;
  }
  mostrarTiempo();
  const intervalo = setInterval(mostrarTiempo, 1000);
  try {
   const respuesta = await fetch(base + '/preparar', { method: 'POST' });
   const precios = await respuesta.json();
   if (!respuesta.ok) throw new Error(precios.error);
   pintar(precios);
   estado.textContent = precios.bloqueada ? 'Cálculo pendiente de revisión.' : 'Control de precios completado.';
  } catch (error) {
   estado.textContent = error instanceof TypeError ? 'Se interrumpió la conexión durante el control de precios.' : error.message;
  } finally {
   clearInterval(intervalo);
   mostrarTiempo();
   barra.remove();
   estado.append(tiempo);
   for (const [boton, deshabilitado] of controles) boton.disabled = deshabilitado;
  }
 });
 if (payload.preciosNV) pintar(payload.preciosNV);
}
function mostrarCOMEX(payload,parent){
 const section=element('section','',parent);section.className='presea-download comex-panel';section.dataset.comercial='comex';element('h3','Archivos para COMEX',section);
 element('p','Todos los módulos de la factura, existentes y nuevos. Cantidades por caja y precios por módulo.',section).className='card-caption';
 const acciones=element('div','',section);acciones.className='comex-toolbar';const preparar=element('button',payload.comex?'Actualizar datos COMEX':'Preparar archivos COMEX',acciones);preparar.type='button';preparar.className='comex-prepare';preparar.disabled=payload.analisis?.confirmado===false;
 element('p',payload.comex?'Actualiza únicamente COMEX con el maestro de productos del FTP. Los DBI para Presea se conservan.':(payload.analisis?.confirmado===false?'Guardá el análisis para habilitar COMEX.':'Prepará las salidas con las filas originales guardadas y el maestro de productos del FTP.'),acciones).className='note';
 const estado=element('p','',section);estado.setAttribute('role','status');
 preparar.addEventListener('click',async()=>{preparar.disabled=true;estado.textContent='Preparando COMEX y actualizando el maestro…';try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/comex/preparar',{method:'POST'});const r=await response.json();if(!response.ok)throw new Error(r.error);mostrarAnalisis(r);crossStatus.textContent='Archivos COMEX preparados. Revisá su estado antes de descargarlos.';}catch(error){estado.textContent=error.message||'No se pudo preparar COMEX.';preparar.disabled=false;}});
 if(!payload.comex)return;
 for(const aviso of payload.comex.advertencias||[])element('p',aviso,section).className='download-notice';
 const grid=element('div','',section);grid.className='download-grid comex-grid';
 for(const [tipo,titulo,descripcion]of [['pedidos','Pedidos COMEX','Precio por módulo · Cantidad de cajas · Factura'],['masterData','Master Data COMEX','Datos del módulo · Proveedor · Modelo · Curva de talles']]){
  const original=payload.comex[tipo];if(!original)continue;const facturaCOMEX=payload.facturas?.length===1?payload.facturas[0]:original.filas?.find(r=>r.po)?.po;const baseCOMEX=tipo==='pedidos'?'SALIDA PEDIDOS APP COMEX':'SALIDA MASTER DATA APP COMEX';const p={...original,nombre:baseCOMEX+(facturaCOMEX?' - '+facturaCOMEX.replace(/[^0-9A-Za-z.-]/g,'-'):'')+'.XLSX',columnas:original.columnas.filter(c=>c!=='numero_factura')};const card=crearTarjeta(grid,titulo,'download-card');element('p',p.nombre,card).className='download-filename';const count=element('p','',card);count.className='download-count';element('strong',numeroResumen(p.total),count);element('span','módulos · '+p.columnas.length+' columnas',count);element('p',descripcion,card).className='card-caption';
  const pendiente=payload.analisis?.confirmado===false;element('span',pendiente?'Pendiente de aceptación':p.bloqueada?'Para revisar':'Disponible',card).className='download-state '+(!pendiente&&!p.bloqueada?'is-ready':'');
  if(p.mensaje)element('p',p.mensaje,card).className='download-notice';
  if(p.errores?.length){const d=element('details','',card);d.className='download-issues';element('summary',p.errores.length+' módulos para revisar',d);table(['Módulo','Motivos'],p.errores.map(r=>[r.clave,r.motivos.join(' · ')]),d);}
  const detalle=element('details','',card);detalle.className='download-issues';element('summary','Ver primeras 20 filas',detalle);table(p.columnas,p.filas.slice(0,20).map(r=>p.columnas.map(c=>r[c]??'—')),detalle);
  const boton=element('button','Descargar Excel',card);boton.type='button';boton.disabled=pendiente||p.bloqueada||!p.total;boton.addEventListener('click',async()=>{boton.disabled=true;try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/comex/'+tipo);if(!response.ok)throw new Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=p.nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);estado.textContent=p.nombre+' descargado.';}catch(error){estado.textContent=error.message||'No se pudo descargar COMEX.';}finally{boton.disabled=pendiente||p.bloqueada||!p.total;}});
 }
}
function mostrarCorreo(payload,parent){
 const panel=element('section','',parent);panel.className='presea-download mail-panel';panel.id='correo-factura';panel.tabIndex=-1;element('h3','Correo informativo de factura',panel);element('p','Resumen por marca, por cliente y por cliente/marca. El correo se prepara para revisar y abrir en Outlook.',panel).className='card-caption';
 const preparar=element('button',payload.informeCorreo?'Actualizar informe':'Preparar informe del correo',panel);preparar.type='button';preparar.className='mail-prepare';preparar.disabled=payload.analisis?.confirmado===false;
 const estado=element('p','',panel);estado.setAttribute('role','status');
 preparar.addEventListener('click',async()=>{preparar.disabled=true;estado.textContent='Preparando totales y actualizando el maestro de clientes…';try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/correo/preparar',{method:'POST'}),r=await response.json();if(!response.ok)throw new Error(r.error);mostrarAnalisis(r);crossStatus.textContent='Informe del correo preparado. Revisá los datos y completá sus campos.';}catch(error){estado.textContent=error.message||'No se pudo preparar el informe.';preparar.disabled=false;}});
 const informe=payload.informeCorreo;if(!informe){element('p',payload.analisis?.confirmado===false?'Primero guardá el análisis para habilitar el informe.':'La preparación usa las filas guardadas y completa nombres desde Clientes_Versato.TXT del FTP.',panel).className='note';return;}
 const stats=element('div','',panel);stats.className='chips';for(const [n,etiqueta]of [[informe.total.cajas,'cajas'],[informe.total.pares,'pares'],[informe.marcas.length,'marcas'],[informe.clientes.length,'clientes']])element('span',numeroResumen(n)+' '+(n===1?({cajas:'caja',pares:'par',marcas:'marca',clientes:'cliente'}[etiqueta]||etiqueta):etiqueta),stats);
 if(informe.clientes.some(c=>c.cliente==='131600'))element('p','El cliente 131600 corresponde a ADMINISTRACIÓN. Revisá depósito y observaciones según sea compra de stock o pedido de clientes.',panel).className='download-notice';
 if(informe.predeterminados?.tipo==='MIXTO')element('p','Esta factura incluye Administración y otros clientes. Completá el depósito que corresponda antes de usar el borrador.',panel).className='download-notice';
 if(informe.bloqueada){const aviso=element('div','',panel);aviso.className='error-notice';element('strong','Revisá estas observaciones antes de descargar el borrador',aviso);for(const mensaje of informe.errores)element('p',mensaje,aviso);}
 const archivo=payload.archivoDeposito,adjuntoListo=archivo&&!archivo.bloqueada;
 const adjunto=element('div','',panel);adjunto.className='mail-attachment';element('strong',adjuntoListo?'Adjunto para depósito':'Archivo de depósito pendiente',adjunto);
 if(adjuntoListo){element('p',archivo.nombre+' · '+archivo.hojas.length+' hojas · '+numeroResumen(archivo.total.cajas)+' cajas · '+numeroResumen(archivo.total.pares)+' pares',adjunto).className='card-caption';const excel=element('button','Descargar Excel de depósito',adjunto);excel.type='button';excel.addEventListener('click',async()=>{excel.disabled=true;try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/correo/deposito');if(!response.ok)throw new Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=archivo.nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){estado.textContent=error.message||'No se pudo descargar el archivo.';}finally{excel.disabled=false;}});}else{element('p','Usá Actualizar informe para generar el archivo y adjuntarlo al borrador.',adjunto).className='note';for(const error of archivo?.errores||[])element('p',error,adjunto).className='download-notice';}
 if(payload.notasVenta?.clientes?.length){const nvAdjunto=element('div','',panel);nvAdjunto.className='mail-attachment';element('strong','Adjunto con detalle de Notas de Venta',nvAdjunto);element('p','Códigos alfa, detalle de producto y cliente, marca, modelo, color, SIZE_RUN, composición de curva y cantidades de módulos.',nvAdjunto).className='card-caption';const boton=element('button','Descargar Excel de NV',nvAdjunto);boton.type='button';boton.addEventListener('click',async()=>{boton.disabled=true;try{const r=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/correo/notas-venta.xlsx');if(!r.ok)throw new Error((await r.json()).error);const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='Detalle NV - '+informe.factura.replace(/[^A-Za-z0-9-]/g,'-')+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){estado.textContent=e.message;}finally{boton.disabled=false;}});}
 const form=element('form','',panel);form.className='mail-form';const campos={};const predeterminados=informe.predeterminados||{};
 for(const [campo,titulo,placeholder,multi]of [['para','Para','correo@empresa.com; otro@empresa.com',true],['copia','CC','Destinatarios en copia (opcional)',true],['asunto','Asunto',''],['deposito','Depósito','Ej. 105 FC CLIENTES'],['observaciones','Observaciones','Ej. Factura correspondiente a pedidos de clientes',true],['firma','Firma','Tu nombre o firma',true]]){const label=element('label',titulo,form);label.className='mail-field '+(['para','copia','asunto','observaciones'].includes(campo)?'is-wide':'');const control=element(multi?'textarea':'input','',label);if(!multi)control.type='text';if(multi)control.rows=['observaciones','copia'].includes(campo)?3:2;control.placeholder=placeholder;control.maxLength={para:1500,copia:1500,asunto:180,deposito:150,observaciones:3000,firma:500}[campo];control.value=predeterminados[campo]??(campo==='asunto'?'Industrias Versato - Factura: '+informe.factura:'');campos[campo]=control;}
 const acciones=element('div','',form);acciones.className='mail-actions';const vista=element('button','Generar vista previa',acciones);vista.type='submit';const copiar=element('button','Copiar cuerpo del correo',acciones);copiar.type='button';copiar.className='secondary';copiar.disabled=true;const descargar=element('button','Descargar borrador (.eml)',acciones);descargar.type='button';descargar.disabled=informe.bloqueada||!adjuntoListo;
 element('p','El borrador incluye automáticamente el Excel para depósito y, si hay NV preparadas, su Excel de detalle. Si copiás solo el cuerpo del correo, descargá y adjuntá el archivo por separado. Revisá los destinatarios antes de enviar.',form).className='note mail-disclaimer';
 const contenedor=element('details','',panel);contenedor.className='mail-preview';element('summary','Vista previa del correo',contenedor);const frame=element('iframe','',contenedor);frame.title='Vista previa del correo informativo';frame.setAttribute('sandbox','');
 const valores=()=>Object.fromEntries(Object.entries(campos).map(([k,v])=>[k,v.value]));
 const guardarConfig=element('button','Guardar configuración del mail',acciones);guardarConfig.type='button';guardarConfig.className='secondary';guardarConfig.addEventListener('click',async()=>{guardarConfig.disabled=true;estado.textContent='Guardando configuración del correo…';try{const r=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/correo/configuracion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(valores())}),p=await r.json();if(!r.ok)throw new Error(p.error);estado.textContent='Configuración guardada. Se aplicará a los próximos correos; el número de factura se actualiza automáticamente.';}catch(e){estado.textContent=e.message;}finally{guardarConfig.disabled=false;}});
 const pedir=async accion=>{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/correo/'+accion,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(valores())});if(!response.ok)throw new Error((await response.json()).error);return response;};
 form.addEventListener('submit',async e=>{e.preventDefault();vista.disabled=true;estado.textContent='Generando vista previa…';try{const r=await(await pedir('vista-previa')).json();frame.srcdoc=r.html;contenedor.open=true;copiar.disabled=informe.bloqueada||!adjuntoListo;estado.textContent='Vista previa lista. El correo todavía no se envió.';}catch(error){estado.textContent=error.message||'No se pudo generar la vista previa.';}finally{vista.disabled=false;}});
 copiar.addEventListener('click',async()=>{try{const r=await(await pedir('vista-previa')).json();if(navigator.clipboard.write&&window.ClipboardItem)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([r.html],{type:'text/html'}),'text/plain':new Blob([r.texto],{type:'text/plain'})})]);else await navigator.clipboard.writeText(r.texto);estado.textContent='Cuerpo copiado. Pegalo en tu correo y adjuntá el Excel de depósito por separado.';}catch(error){estado.textContent='No se pudo copiar. Podés descargar el borrador para abrirlo en Outlook.';}});
 const abrir=element('button','Abrir en mi correo',acciones);abrir.type='button';abrir.disabled=informe.bloqueada||!adjuntoListo;
 const estadoDescarga=element('p','',form);estadoDescarga.setAttribute('role','status');estadoDescarga.setAttribute('aria-live','polite');
 element('p','Desde cualquier equipo: descargá el borrador y abrí el archivo .eml en Outlook. El navegador no puede abrir automáticamente el correo de tu PC con sus adjuntos.',form).className='note';
 const descargarCorreo=async abrirEnEquipo=>{descargar.disabled=true;abrir.disabled=true;estadoDescarga.textContent='Preparando el borrador y los archivos adjuntos…';try{const response=await pedir(abrirEnEquipo?'abrir':'borrador'),blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Informe-Versato-'+informe.factura.replace(/[^0-9A-Za-z-]/g,'-')+'.eml';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);estadoDescarga.textContent='Borrador descargado con sus adjuntos. Abrí el archivo .eml desde las descargas del navegador para revisarlo en Outlook y enviarlo.';}catch(error){estadoDescarga.textContent=error.message||'No se pudo descargar el borrador.';}finally{descargar.disabled=abrir.disabled=informe.bloqueada||!adjuntoListo;}};
 abrir.addEventListener('click',()=>descargarCorreo(true));
 descargar.addEventListener('click',()=>descargarCorreo(false));
}
function mostrarCorreccionCliente(payload,parent,clienteNV){
 const boton=element('button',clienteNV?'Cambiar cliente':'Corregir cliente',parent);boton.type='button';boton.className='secondary';boton.disabled=payload.analisis?.confirmado===false||!payload.controlClientes?.filas?.length;
 const area=element('div','',parent);area.hidden=true;
 boton.addEventListener('click',async()=>{boton.disabled=true;area.hidden=false;area.replaceChildren();const estado=element('p','Consultando clientes disponibles…',area);estado.setAttribute('role','status');
 try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/clientes/catalogo',{method:'POST'});const catalogo=await response.json();if(!response.ok)throw new Error(catalogo.error);
 estado.textContent='La corrección reasigna todas las cajas del código elegido, solo en esta factura. Los archivos originales se conservan.';
 const form=element('form','',area);form.className='mail-fields client-correction-form';
 const labelOrigen=element('label','Cliente cargado en los documentos',form);labelOrigen.className='mail-field';const origen=element('select','',labelOrigen);for(const r of payload.controlClientes.filas.filter(r=>!clienteNV||r.codigo===clienteNV)){const o=element('option',(r.codigo||'Sin código')+' · '+(r.nombre||'Sin nombre'),origen);o.value=r.codigo;}if(clienteNV)origen.disabled=true;
 const labelDestino=element('label','Cliente correcto: buscá por código o nombre',form);labelDestino.className='mail-field';const destino=element('input','',labelDestino);destino.type='text';destino.required=true;destino.autocomplete='off';const lista=element('datalist','',form);lista.id='clientes-destino-'+payload.analisis.id+(clienteNV?'-'+clienteNV:'');destino.setAttribute('list',lista.id);for(const r of catalogo.clientes){const o=element('option',r.nombre,lista);o.value=r.codigo+' · '+r.nombre;}
 const labelMotivo=element('label','Motivo de la corrección',form);labelMotivo.className='mail-field is-wide';const motivo=element('textarea','',labelMotivo);motivo.required=true;motivo.minLength=3;motivo.maxLength=500;motivo.rows=2;
 const revisar=element('button','Revisar corrección',form);revisar.type='submit';const cancelar=element('button','Cancelar',form);cancelar.type='button';cancelar.className='secondary';cancelar.addEventListener('click',()=>{area.hidden=true;area.replaceChildren();boton.disabled=false;});
 const resumen=element('div','',area);const confirmar=element('button','Confirmar corrección y actualizar',area);confirmar.type='button';confirmar.hidden=true;let propuesta=null;
 form.addEventListener('input',()=>{propuesta=null;confirmar.hidden=true;resumen.replaceChildren();});form.addEventListener('change',()=>{propuesta=null;confirmar.hidden=true;resumen.replaceChildren();});
 form.addEventListener('submit',e=>{e.preventDefault();const codigo=destino.value.split(' · ')[0].trim(),cliente=catalogo.clientes.find(r=>r.codigo===codigo),fuente=payload.controlClientes.filas.find(r=>r.codigo===origen.value);if(!cliente||codigo===origen.value||motivo.value.trim().length<3){estado.textContent='Elegí un cliente diferente del maestro y completá el motivo.';return;}propuesta={anterior:origen.value,nuevo:codigo,motivo:motivo.value.trim(),version:payload.correccionesClientes?.length||0,huellaMaestro:catalogo.huellaMaestro,...(clienteNV?{desdeNV:true,revisionNV:payload.notasVenta?.revision}:{})};resumen.replaceChildren();element('p','Factura '+payload.facturas?.join(', ')+' · '+(fuente.codigo||'Sin código')+' → '+cliente.codigo+' · '+cliente.nombre,resumen);element('p','Se reasignan todas las cajas de este código: Packing '+numeroResumen(fuente.cajasPacking)+' cajas / '+numeroResumen(fuente.paresPacking)+' pares; Códigos '+numeroResumen(fuente.cajasCodigos)+' cajas / '+numeroResumen(fuente.paresCodigos)+' pares.',resumen);element('p','Motivo: '+propuesta.motivo,resumen);confirmar.hidden=false;estado.textContent='Revisá el alcance antes de confirmar. Si solo algunas cajas son de otro cliente, no apliques este reemplazo completo.';});
 confirmar.addEventListener('click',async()=>{if(!propuesta)return;confirmar.disabled=true;revisar.disabled=true;cancelar.disabled=true;estado.textContent='Guardando corrección y actualizando el informe…';try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/clientes/corregir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(propuesta)});const r=await response.json();if(!response.ok)throw new Error(r.error);if(clienteNV){try{const respuestaNV=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/nv/actualizar',{method:'POST'}),nv=await respuestaNV.json();if(!respuestaNV.ok)throw Error(nv.error);r.notasVenta=nv;}catch(e){mostrarAnalisis(r);crossStatus.textContent='Cliente corregido. No se pudieron actualizar las NV: '+e.message+'. Usá Revisar pendientes desde maestros.';return;}}mostrarAnalisis(r);crossStatus.textContent=clienteNV?'Cliente cambiado y NV actualizadas. Revisá el domicilio de entrega del nuevo cliente.':'Cliente corregido. El informe del correo y el archivo de depósito están actualizados.';}catch(error){estado.textContent=error.message||'No se pudo guardar la corrección.';confirmar.disabled=false;revisar.disabled=false;cancelar.disabled=false;}});
 }catch(error){estado.textContent=error.message||'No se pudo consultar el maestro.';boton.disabled=false;}});
 if(payload.correccionesClientes?.length){const historial=element('details','',parent);element('summary','Historial de correcciones de clientes ('+payload.correccionesClientes.length+')',historial);table(['Fecha','Código anterior','Código nuevo','Cliente nuevo','Cajas Packing','Pares Packing','Motivo'],payload.correccionesClientes.map(r=>[new Date(r.fecha).toLocaleString('es-AR'),r.anterior||'Sin código',r.nuevo,r.nombreNuevo,numeroResumen(r.cajasPacking),numeroResumen(r.paresPacking),r.motivo]),historial);}
}
function mostrarControlClientes(payload,parent){
 const seccion=element('details','',parent);seccion.className='result-section';seccion.open=true;element('summary','Control de clientes',seccion);parent=element('div','',seccion);parent.className='section-content';
 const c=payload.controlClientes;
 const estado=element('p',c?c.resumen.total+(c.resumen.total===1?' cliente · ':' clientes · ')+c.resumen.encontrados+(c.resumen.encontrados===1?' encontrado · ':' encontrados · ')+c.resumen.revisar+' para revisar · '+c.resumen.pendientes+' pendientes':'Consultá el maestro para identificar los clientes de esta factura.',parent);
 const actualizar=element('button','Actualizar control de clientes',parent);actualizar.type='button';actualizar.className='secondary';actualizar.disabled=payload.analisis?.confirmado===false;
 actualizar.addEventListener('click',async()=>{actualizar.disabled=true;estado.textContent='Consultando Clientes_Versato.TXT desde el FTP…';try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/correo/preparar',{method:'POST'});const r=await response.json();if(!response.ok)throw new Error(r.error);mostrarAnalisis(r);crossStatus.textContent='Control de clientes actualizado.';}catch(error){estado.textContent=error.message||'No se pudo actualizar el maestro de clientes.';actualizar.disabled=false;}});
 if(!c)return;
 const listado=element('div','',parent);const etiquetas={ENCONTRADO:'Encontrado',NO_ENCONTRADO:'No encontrado',AMBIGUO:'Más de un nombre en el maestro',SIN_CODIGO:'Falta código de cliente',PENDIENTE_MAESTRO:'Pendiente de maestro'};
 table(['Cliente','Nombre del cliente','Cajas Packing','Cajas Códigos','Pares Packing','Pares Códigos','Estado'],c.filas.map(r=>[r.codigo||'Sin código',r.nombre||'Sin nombre confirmado',numeroResumen(r.cajasPacking),numeroResumen(r.cajasCodigos),numeroResumen(r.paresPacking),numeroResumen(r.paresCodigos),etiquetas[r.estado]||r.estado]),listado);
 if(c.filas.some(r=>r.origenNombre==='ADMINISTRACIÓN CONFIGURADA'))element('p','131600 corresponde a ADMINISTRACIÓN por la equivalencia configurada.',listado).className='note';
 mostrarCorreccionCliente(payload,listado);
 if(c.maestro.actualizado)element('p','Maestro: '+(c.maestro.archivo||'Clientes_Versato.TXT')+' · '+new Date(c.maestro.actualizado).toLocaleString('es-AR'),listado).className='note';
}
function mostrarAnalisis(payload){

    const baseFoto='/api/importaciones/'+(payload.analisis?.confirmado===false?'vistas-previas':'analisis')+'/'+encodeURIComponent(payload.analisis.id)+'/imagenes/';
    fotosActivas=new Map((payload.imagenes?.fotos||[]).map(f=>[f.PRODUCTO,{...f,url:f.analisisOrigen?'/api/importaciones/analisis/'+encodeURIComponent(f.analisisOrigen)+'/imagenes/'+encodeURIComponent(f.PRODUCTO):baseFoto+encodeURIComponent(f.PRODUCTO)}]));
    crossResult.replaceChildren(); crossResult.hidden = false;
    element('h2', payload.estado === 'PARCIAL' ? 'Análisis parcial: hay filas excluidas' : 'Análisis de factura completo', crossResult);
    const s = payload.resumen;
    indicadores(crossResult,[['Combinaciones',s.combinaciones],['Coinciden',s.coinciden,'is-success'],['Para revisar',s.revisar,s.revisar?'is-warning':''],['Sin EAN válido con cantidad',s.sinEan,s.sinEan?'is-warning':''],['Filas excluidas',s.filasExcluidas,s.filasExcluidas?'is-warning':'']]);
    mostrarFotos(payload,crossResult);
    element('h3','Archivos analizados',crossResult);
    const archivosCards=element('div','',crossResult);archivosCards.className='summary-grid files-grid';
    for(const a of payload.archivos){const card=crearTarjeta(archivosCards,a.deteccion?.nombre||a.tipo);element('p',a.archivo,card).className='file-card-name';const pares=a.tipo==='FACTURA'?a.vistaPrevia.totales.pares:s.pares[a.tipo];element('strong',numeroResumen(pares),card).className='stat-value';element('p','Pares comparados',card).className='card-caption';datosTarjeta(card,[['Hoja',a.hoja]]);}
    if(payload.resumenMarcas){
      const m=payload.resumenMarcas;
      element('h3','Totales por marca',crossResult);
      const importe=n=>n==null?'No disponible':n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
      const marcasCards=element('div','',crossResult);marcasCards.className='summary-grid brand-grid';
      for(const r of [...m.filas,m.total]){const card=crearTarjeta(marcasCards,r.marca,r===m.total?'is-total':'');datosTarjeta(card,[['Cajas Packing',numeroResumen(r.cajasPacking)],['Cajas Códigos',numeroResumen(r.cajasCodigos)],['Cajas Factura',numeroResumen(r.cajasFactura)],['Pares Packing',numeroResumen(r.paresPacking)],['Pares Códigos',numeroResumen(r.paresCodigos)],['Pares EAN',numeroResumen(r.paresEan)],['Pares Factura',numeroResumen(r.paresFactura)]]);const total=element('div','',card);total.className='amount-highlight';element('span','Importe Factura',total);element('strong',importe(r.importeFactura),total);}
      const help=document.createElement('details');help.className='help';crossResult.append(help);element('summary','Ayuda: totales por marca',help);element('p',m.nota,help).className='note';
    }
    const validation = document.createElement('details'); validation.open = true; validation.className = 'help'; crossResult.append(validation);
    const validationTotals = payload.archivos.reduce((sum, a) => ({
      errores: sum.errores + (a.vistaPrevia?.resumen.conErrores || 0),
      advertencias: sum.advertencias + (a.vistaPrevia?.resumen.conAdvertencias || 0)
    }), { errores: 0, advertencias: 0 });
    element('summary', `Ver validación de archivos · ${validationTotals.errores} filas con errores · ${validationTotals.advertencias} con advertencias`, validation);
    for (const archivo of payload.archivos) {
      if (!archivo.vistaPrevia) continue;
      const v = archivo.vistaPrevia.resumen;
      const details = document.createElement('details'); validation.append(details);
      element('summary', `${archivo.deteccion.nombre} · ${v.total} registros · ${v.conErrores} con errores · ${v.conAdvertencias} con advertencias`, details);
      element('p', archivo.archivo, details).className = 'filename';
      showCandidate(archivo.deteccion, details); showPreview(archivo.vistaPrevia, details);
    }

    if(payload.controlFactura){
      const f=payload.controlFactura;
      element('h3','Control de Factura',crossResult);
      element('p',`${f.resumen.productos} productos · ${f.resumen.coinciden} coinciden · ${f.resumen.revisar} para revisar · ${f.resumen.filasInvalidas} filas inválidas`,crossResult);
      const veredicto=v=>v==null?'No verificable':v?'Coincide':'NO COINCIDE';
      const moneda=n=>n==null?'No disponible':n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
      const facturaCards=element('div','',crossResult);facturaCards.className='summary-grid invoice-grid';
      const sumarCajas=campo=>{const valores=f.filas.map(r=>r[campo]).filter(v=>v!=null);return valores.length?valores.reduce((s,v)=>s+Number(v),0):null;};
      const cajasFC=sumarCajas('cajasFactura'),cajasPacking=sumarCajas('cajasPacking'),cajasCodigos=sumarCajas('cajasCodigos');
      const cajasCoinciden=[cajasFC,cajasPacking,cajasCodigos].some(v=>v==null)?null:cajasFC===cajasPacking&&cajasFC===cajasCodigos;
      const controles=[['Número de factura',f.numerosFactura.join(', ')||'No detectado',null,f.numeroCoincide],['Total de cajas',cajasFC==null?'No disponible':numeroResumen(cajasFC),'Packing: '+(cajasPacking==null?'No disponible':numeroResumen(cajasPacking))+' · Códigos: '+(cajasCodigos==null?'No disponible':numeroResumen(cajasCodigos)),cajasCoinciden],['Total de pares',numeroResumen(f.totales.pares),f.totales.paresDeclarados==null?'Total declarado no disponible':'Declarados: '+numeroResumen(f.totales.paresDeclarados),f.totales.paresCoinciden],['Importe total',moneda(f.totales.importe),f.totales.totalDeclarado==null?'Total declarado no disponible':'Declarado: '+moneda(f.totales.totalDeclarado),f.totales.importeCoincide]];
      for(const [titulo,valor,nota,coincide]of controles){const card=crearTarjeta(facturaCards,titulo,coincide===false?'is-warning':coincide===true?'is-success':'');element('strong',valor,card).className='control-value';if(nota)element('p',nota,card).className='card-caption';element('span',veredicto(coincide),card).className='control-status';}
      const help=document.createElement('details');help.className='help';crossResult.append(help);
      element('summary','Ayuda: controles de Factura',help);for(const note of f.notas)element('p',note,help).className='note';
      const controls=document.createElement('div');crossResult.append(controls);
      const label=document.createElement('label');controls.append(label);const issues=document.createElement('input');issues.type='checkbox';issues.checked=true;label.append(issues,' Solo diferencias de Factura');
      const listado=document.createElement('div');crossResult.append(listado);
      const renderFactura=()=>{listado.replaceChildren();const rows=f.filas.filter(r=>!issues.checked||r.estado!=='COINCIDE');element('p',`Mostrando ${Math.min(100,rows.length)} de ${rows.length} productos; el Excel incluye todos.`,listado).className='note';table(['PRODUCTO','Pares Factura','Packing','Códigos','EAN','Cajas Factura','Cajas Packing','Cajas Códigos','Importe','Estado','Detalle'],rows.slice(0,100).map(r=>[r.PRODUCTO,r.paresFactura??'—',r.paresPacking??'—',r.paresCodigos??'—',r.paresEan??'—',r.cajasFactura??'—',r.cajasPacking??'—',r.cajasCodigos??'—',moneda(r.importe),r.estado,r.problemas.join(' · ')]),listado);};
      issues.addEventListener('change',renderFactura);renderFactura();
    }
    const crossHelp = document.createElement('details'); crossHelp.className = 'help'; crossResult.append(crossHelp);
    element('summary', '¿Cómo se cruza la información?', crossHelp);
    for (const note of payload.notas) element('p', note, crossHelp).className = 'note';
    if (payload.productos) {
      const p = payload.productos;

      if (p.presea) {
        if (p.resumenCoincidencias) {
          element('h3', 'Resumen de coincidencias por marca', crossResult);
          const r = p.resumenCoincidencias;
          const coincidenciasCards=element('div','',crossResult);coincidenciasCards.className='summary-grid brand-grid';for(const f of [...r.filas,r.total]){const c=crearTarjeta(coincidenciasCards,f.marca,f===r.total?'is-total':'');datosTarjeta(c,[['Encontrados',numeroResumen(f.encontrados)],['No encontrados',numeroResumen(f.noEncontrados)],['Pendientes de maestro',numeroResumen(f.pendientes)],['Total códigos Versato',numeroResumen(f.total)]]);}
          const help = document.createElement('details'); help.className='help'; crossResult.append(help);
          element('summary','Ayuda: cómo se cuentan los productos',help);element('p',r.nota,help).className='note';
        }

      }
      element('p', `${p.resumen.productos} productos · ${p.resumen.productoTalles} combinaciones con talle`, crossResult);
      const productHelp = document.createElement('details'); productHelp.className = 'help'; crossResult.append(productHelp);
      element('summary', 'Ayuda: productos y búsqueda en el maestro', productHelp);
      for (const note of p.notas) element('p', note, productHelp).className = 'note';
      if(p.modulos){
        const m=p.modulos;element('h3','Productos módulo: MODC propuestos',crossResult);
        element('p',`${m.resumen.total} módulos no encontrados · ${m.resumen.conMODC} con MODC propuesto · ${m.resumen.conCodAlfa} con COD_ALFA · ${m.resumen.pendientes} pendientes`,crossResult);
        const help=document.createElement('details');help.className='help';crossResult.append(help);element('summary','Ayuda: asignación de MODC',help);element('p',m.nota,help).className='note';
        table(['PRODUCTO','SIZE RUN','Año módulo','Marca','Último MODC','MODC propuesto','COD_ALFA','Año COD_ALFA','Estado','Error'],m.filas.slice(0,100).map(r=>[r.PRODUCTO,r.SIZE_RUN,r.AA,r.DMARCA??'Sin definir',r.ultimoMODC??'—',r.MODC??'Pendiente',r.COD_ALFA??'Pendiente',r.ANIO_COD_ALFA,r.estado,r.errorCodAlfa??'']),crossResult);
        element('p',`Se muestran hasta 100 módulos; el Excel incluye todos.`,crossResult).className='note';
        if(m.maestroMarcas){
          const general=document.createElement('details');crossResult.append(general);element('summary','Ver DMODC, fecha de alta y sexo',general);
          table(['PRODUCTO','SIZE RUN','DETALLE','DMODC','Fecha de alta','Sexo'],m.filas.slice(0,100).map(r=>[r.PRODUCTO,r.SIZE_RUN,r.DETALLE??'Pendiente',r.DMODC??'Pendiente',r.FECHA_ALTA?.split('-').reverse().join('/')??'Pendiente',r.SEXO]),general);
          const fixedHelp=document.createElement('details');fixedHelp.className='help';crossResult.append(fixedHelp);
          element('summary','Valores fijos de los módulos para Presea',fixedHelp);
          table(['Campo','Valor'],[['Nivel','950'],['Temporada','1 — IN'],['Origen','IMPORTADO (2)'],['Grupo','99 — SIN GRUPO'],['Subgrupo','99 — SIN SUBGRUPO'],['Línea','9999 — SIN LINEA'],['Clasificación','4 MOD.KID · 7 MOD.HOM · 8 MOD.MUJ']],fixedHelp);
          const details=document.createElement('details');crossResult.append(details);element('summary','Ver marcas, colores y distribución por módulo',details);
          table(['PRODUCTO','SIZE RUN','MARCA','Descripción marca','Rubro','Rubro facturación','Tipo módulo','COLORC','Detalle color','TALLC','Detalle talles','Pares por módulo','Observaciones'],m.filas.slice(0,100).map(r=>[r.PRODUCTO,r.SIZE_RUN,r.MARCA??'Pendiente',r.DMARCA,r.RUBROS,r.RUBRO_FACT??'Pendiente',r.DCLASIFIC,r.COLORC,r.DCOLORC??'Pendiente',r.TALLC,r.DTALLC??'Pendiente',r.PARES??'—',r.erroresDatos?.join(' · ')||'']),details);
        }
      }
      element('h3','Control del maestro de productos',crossResult);
      if (p.maestro) {
        element('p', `Maestro: ${p.maestro.disponible ? p.maestro.archivo : 'no disponible'} · Origen: ${p.maestro.origen || 'LOCAL'} · Actualizado: ${p.maestro.actualizado ? new Date(p.maestro.actualizado).toLocaleString('es-AR') : 'Pendiente'} · Búsqueda: Código de Barra Versato = COD_ALFAB1`, crossResult);
        if (p.maestro.mensaje) element('p', p.maestro.mensaje, crossResult);
        const details = document.createElement('details'); crossResult.append(details);
        element('summary', `Ver asignaciones del maestro (${p.asignaciones.length})`, details);
        const assignmentLabel = document.createElement('label'); details.append(assignmentLabel);
        const assignmentFilter = document.createElement('input'); assignmentFilter.type='checkbox'; assignmentFilter.checked=true; assignmentLabel.append(assignmentFilter,' Solo no coincidentes o pendientes');
        const assignmentList=document.createElement('div');details.append(assignmentList);
        const renderAssignments=()=>{
          assignmentList.replaceChildren();const rows=p.asignaciones.filter(a=>!assignmentFilter.checked||a.coincidencia!=='ENCONTRADO');
          element('p',`Mostrando ${Math.min(100,rows.length)} de ${rows.length} asignaciones; el Excel incluye todas.`,assignmentList).className='note';
          table(['PRODUCTO', 'SIZE RUN', 'AA', 'CODIGO', 'MODC', 'CODIGO DE BARRA', 'Coincidencia'], rows.slice(0, 100).map(a => [a.PRODUCTO, a.SIZE_RUN, a.AA ?? '—', a.CODIGO ?? '—', a.MODC ?? '—', a.CODIGO_DE_BARRA ?? '—', a.coincidencia === 'ENCONTRADO' ? 'Encontrado' : a.coincidencia === 'PENDIENTE' ? 'Pendiente de maestro' : 'No encontrado']), assignmentList);
        };assignmentFilter.addEventListener('change',renderAssignments);renderAssignments();
      }
      element('h3','Productos para preparar en Presea',crossResult);
      const productSearch = document.createElement('input'); productSearch.type = 'search'; productSearch.placeholder = 'Buscar producto o código Versato'; productSearch.setAttribute('aria-label', 'Buscar productos propuestos'); crossResult.append(productSearch);
      const situacion = document.createElement('select'); situacion.setAttribute('aria-label', 'Filtrar situación en maestro'); situacion.style.marginLeft = '12px'; crossResult.append(situacion);
      for (const [value, label] of [['', 'Todas las coincidencias'], ['ENCONTRADO', 'Encontrado'], ['NO_ENCONTRADO', 'No encontrado'], ['PENDIENTE', 'Pendiente de actualización']]) { const o = element('option', label, situacion); o.value = value; }
      const masterFilterLabel = document.createElement('label'); masterFilterLabel.style.display = 'block'; masterFilterLabel.style.marginTop = '12px'; crossResult.append(masterFilterLabel);
      const onlyUnmatched = document.createElement('input'); onlyUnmatched.type = 'checkbox'; masterFilterLabel.append(onlyUnmatched, ' Solo no coincidentes con el maestro');
      onlyUnmatched.checked = true;
      const unmatchedProducts = new Set((p.asignaciones || []).filter(a => a.coincidencia === 'NO_ENCONTRADO').map(a => a.PRODUCTO));
      const productsList = document.createElement('div'); crossResult.append(productsList);
      const showProducts = () => {
        productsList.replaceChildren(); const query = productSearch.value.trim().toLowerCase();
        const matches = p.listado.filter(r => (!onlyUnmatched.checked || unmatchedProducts.has(r.PRODUCTO) || !r.sizeRuns.length)
          && (!situacion.value || r.controlMaestro?.some(a => a.estado === situacion.value))
          && [r.PRODUCTO, ...r.codigosVersato, ...(r.marcas || []), ...(r.descripciones || []), ...(r.codigosInternos || [])].some(v => v.toLowerCase().includes(query)));
        element('p', `Mostrando ${Math.min(matches.length, 100)} de ${matches.length} productos. El Excel incluye todos.`, productsList).className = 'note';
        table(['PRODUCTO', 'Marca', 'Descripción', 'Material', 'Color', 'Talles', 'SIZE RUN', 'Cajas Packing', 'Cajas Códigos', 'Pares Packing', 'Pares Códigos', 'Pares EAN', 'Maestro', 'Código interno', 'MODC', 'Preparación'], matches.slice(0, 100).map(r => [r.PRODUCTO, r.marcas?.join(' / '), r.descripciones?.join(' / '), r.materiales?.join(' / '), r.colores?.join(' / '), r.talles.join(' '), r.sizeRuns.join(', '), r.cajasPacking ?? '—', r.cajasCodigos ?? '—', r.paresPacking, r.paresCodigos, r.paresEan, r.situacionMaestro, r.codigosInternos?.join(', '), r.modelos?.join(', '), r.preparacion]), productsList);
      };
      productSearch.addEventListener('input', showProducts); onlyUnmatched.addEventListener('change', showProducts); situacion.addEventListener('change', () => {onlyUnmatched.checked=false;showProducts();}); showProducts();
    }
    element('h3','Cruce de cantidades',crossResult);crossResult.append(crossHelp);
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Buscar producto, talle o EAN'; search.setAttribute('aria-label', 'Buscar en el cruce'); crossResult.append(search);
    const label = document.createElement('label'); crossResult.append(label);
    const onlyIssues = document.createElement('input'); onlyIssues.type = 'checkbox'; label.append(onlyIssues, ' Solo diferencias o faltantes');
    onlyIssues.checked = true;
    const list = document.createElement('div'); crossResult.append(list);
    const render = () => {
      list.replaceChildren(); const query = search.value.trim().toLowerCase();
      const rows = payload.filas.filter(r => (!onlyIssues.checked || r.estado !== 'COINCIDE') && [r.STYLE, r.MATERIAL, r.COLOR, r.TALLE, ...r.eans].some(v => v.toLowerCase().includes(query)));
      element('p', `Mostrando ${Math.min(rows.length, 100)} de ${rows.length} combinaciones.`, list).className = 'note';
      table(['STYLE', 'Material', 'Color', 'Talle', 'Packing', 'Códigos', 'EAN pares', 'EAN', 'Estado', 'Detalle', 'Filas Packing', 'Filas Códigos', 'Filas EAN'], rows.slice(0, 100).map(r => [r.STYLE, r.MATERIAL, r.COLOR, r.TALLE, r.PACKING_LIST ?? 'Ausente', r.CODIGOS_BARRA ?? 'Ausente', r.EAN ?? 'Ausente', r.eans.join(', '), r.estado, r.problemas.join(' · '), ...['PACKING_LIST', 'CODIGOS_BARRA', 'EAN'].map(t => r.filas[t].join(', '))]), list);
    };
    search.addEventListener('input', render); onlyIssues.addEventListener('change', render); render();
    if (payload.omitidas.length) {
      element('h3', 'Filas excluidas del cruce', crossResult);
      element('p', 'Se muestran hasta 200. El detalle completo está en la descarga.', crossResult).className = 'note';
      table(['Tipo', 'Fila Excel', 'Motivos'], payload.omitidas.slice(0, 200).map(r => [r.tipo, r.fila, r.motivos.join(' · ')]), crossResult);
    }
    if(payload.exportacionPresea){
      const p=payload.exportacionPresea;element('h3','Productos módulos',crossResult);
      const productos=payload.productos,propuestas=new Map((productos.modulos?.filas||[]).map(r=>[r.COD_ALFAB1,r]));
      const excluidos=new Map(p.excluidas.map(r=>[r.clave,r.motivos]));
      const maestrosPendientes=!productos.modulos?.maestro?.disponible||!productos.modulos?.maestroMarcas?.disponible||!productos.modulos?.maestroRubrosFact?.disponible;
      const modulos=(productos.asignaciones||[]).map(a=>{
        const propuesta=propuestas.get(a.claveBuscada),producto=productos.listado.find(r=>r.PRODUCTO===a.PRODUCTO);
        let estado,observaciones=[];
        if(a.coincidencia==='PENDIENTE'||!productos.maestro?.disponible)estado='PENDIENTE_MAESTRO';
        else if(a.estado==='ENCONTRADO')estado='ENCONTRADO';
        else if(a.coincidencia==='ENCONTRADO'){estado='REVISAR';observaciones.push('La coincidencia del maestro es ambigua o incompleta.');}
        else if(maestrosPendientes)estado='PENDIENTE_MAESTRO';
        else if(!propuesta){estado='REVISAR';observaciones.push('No se pudo preparar el módulo.');}
        else{observaciones=[...(excluidos.get(a.claveBuscada)||[]),propuesta.errorCodAlfa,...(propuesta.erroresDatos||[])].filter(Boolean);if(producto?.estado==='REVISAR')observaciones.push('El producto tiene diferencias en el cruce.');estado=observaciones.length?'REVISAR':'NUEVO';}
        if(estado==='PENDIENTE_MAESTRO')observaciones.push('Falta completar la actualización o el control de maestros.');
        return {...propuesta,PRODUCTO:a.PRODUCTO,SIZE_RUN:a.SIZE_RUN,DMARCA:propuesta?.DMARCA||producto?.marcas?.join(', '),CODIGO:a.CODIGO,MODC:estado==='ENCONTRADO'?a.MODC:propuesta?.MODC,COD_ALFA:estado==='ENCONTRADO'?a.COD_ALFA:propuesta?.COD_ALFA,estadoControl:estado,observaciones:[...new Set(observaciones)].join(' · ')};
      });
      const contar=estado=>modulos.filter(r=>r.estadoControl===estado).length;
      element('p',`${contar('ENCONTRADO')} encontrados · ${contar('NUEVO')} nuevos · ${contar('REVISAR')} para revisar · ${contar('PENDIENTE_MAESTRO')} pendientes de maestro`,crossResult);
      if(p.mensaje)element('p',p.mensaje,crossResult);
      const buscarModulo=document.createElement('input');buscarModulo.type='search';buscarModulo.placeholder='Buscar producto, marca o MODC';buscarModulo.setAttribute('aria-label','Buscar módulos para Presea');crossResult.append(buscarModulo);
      const filtroModulo=element('label','',crossResult),soloNoCoincidentes=document.createElement('input');soloNoCoincidentes.type='checkbox';soloNoCoincidentes.checked=true;filtroModulo.append(soloNoCoincidentes,' Solo no coincidentes');
      const listaModulos=element('div','',crossResult);
      const mostrarModulos=()=>{listaModulos.replaceChildren();const q=buscarModulo.value.trim().toLowerCase();const rows=modulos.filter(r=>(!soloNoCoincidentes.checked||r.estadoControl!=='ENCONTRADO')&&[r.PRODUCTO,r.DMARCA,r.MODC,r.COD_ALFA,r.DETALLE,r.CODIGO].some(v=>String(v||'').toLowerCase().includes(q)));element('p',`Mostrando ${Math.min(rows.length,100)} de ${rows.length} módulos. ${p.listos} listos para descargar; el Excel incluye todos los nuevos válidos.`,listaModulos).className='note';table(['PRODUCTO','SIZE RUN','Marca','Código','MODC','COD_ALFA','DETALLE','Pares por módulo','Estado','Observaciones'],rows.slice(0,100).map(r=>[r.PRODUCTO,r.SIZE_RUN,r.DMARCA,r.CODIGO||'—',r.MODC||'—',r.COD_ALFA||'—',r.DETALLE||'—',r.PARES??'—',r.estadoControl,r.observaciones]),listaModulos);};buscarModulo.addEventListener('input',mostrarModulos);soloNoCoincidentes.addEventListener('change',mostrarModulos);mostrarModulos();
    }
    if(payload.productos?.sueltos){
      const s=payload.productos.sueltos,exp=payload.exportacionSueltos;
      element('h3','Productos sueltos',crossResult);
      const count=estado=>s.filas.filter(r=>r.estado===estado).length;
      element('p',`${count('ENCONTRADO')} encontrados · ${count('NUEVO')} nuevos · ${count('REVISAR')} para revisar · ${count('PENDIENTE_MAESTRO')} pendientes de maestro`,crossResult);
      if(exp.mensaje)element('p',exp.mensaje,crossResult);
      const lab=element('label','',crossResult),check=document.createElement('input');check.type='checkbox';check.checked=true;lab.append(check,' Solo no coincidentes');const lista=element('div','',crossResult);
      const pintar=()=>{lista.replaceChildren();const rows=s.filas.filter(r=>!check.checked||r.estado!=='ENCONTRADO');element('p',`Mostrando ${Math.min(rows.length,100)} de ${rows.length} sueltos.`,lista).className='note';table(['PRODUCTO','Talle archivo','Talle suelto','EAN','MODC','Código','COD_ALFA','Temporada','Estado','Observaciones'],rows.slice(0,100).map(r=>[r.PRODUCTO,r.TALLE_ORIGEN,r.TALLC,r.EAN,r.datosMaestro?.MODC||r.MODC,r.datosMaestro?.CODIGO||r.coincidenciasMaestro?.map(m=>m.CODIGO).join(', ')||'',r.datosMaestro?.COD_ALFA||r.COD_ALFA,r.datosMaestro?'Conserva datos del maestro':'1 / IN',r.estado,r.errores.join(' · ')]),lista);};check.addEventListener('change',pintar);pintar();
      const help=element('details','',crossResult);help.className='help';element('summary','Cómo se preparan los sueltos',help);element('p','Coincidencia exacta por EAN contra COD_ALFABA o COD_ALFABA1 del maestro de sueltos actualizado desde FTP. Los existentes conservan su información y no se exportan como altas. Los nuevos usan nivel 900, temporada 1 / IN, clasificación 1 PRIMERA y PARES 1. Un talle compartido 36/37 genera el talle 36. COD_ALFA sigue la fórmula de Access con temporada 1: año + 1 + 1 + MODC + 1 + 00 + talle; se exige longitud 15 y ausencia de duplicados. Se usa el MODC máximo del mismo producto entre maestros y módulos asociados. Para EAN existentes se toma el máximo de cada campo (CODIGO, COD_ALFA, MODC y demás), sin generar altas. La descarga no reserva ni da de alta productos.',help);
    }
    if(payload.exportacionProductosPresea){
      const p=payload.exportacionProductosPresea;
      const descargas=element('section','',crossResult);descargas.className='presea-download';
      element('h3','Productos para importar a Presea',descargas);
      element('p',`${p.modulos} módulos + ${p.sueltos} sueltos · ${p.total} productos · un solo DBI de 35 campos`,descargas);
      if(p.mensaje)element('p',p.mensaje,descargas);
      if(p.excluidas.length){const d=element('details','',descargas);element('summary',`${p.excluidas.length} productos excluidos de la descarga`,d);table(['Tipo','Clave','Motivos'],p.excluidas.map(r=>[r.tipo,r.clave,r.motivos.join(' · ')]),d);}
      const b=element('button','Descargar PRODUCTOS_VERSATO.DBI',descargas);b.type='button';b.disabled=p.bloqueada||!p.total;
      b.addEventListener('click',async()=>{b.disabled=true;try{const response=await fetch(`/api/importaciones/analisis/${encodeURIComponent(payload.analisis.id)}/presea-completo`);if(!response.ok)throw new Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='PRODUCTOS_VERSATO.DBI';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);crossStatus.textContent='PRODUCTOS_VERSATO.DBI descargado.';}catch(e){crossStatus.textContent=e.message||'No se pudo descargar el archivo.';}finally{b.disabled=p.bloqueada||!p.total;}});
      element('p','Cada módulo nuevo aparece seguido de sus sueltos nuevos asociados. Incluye también sueltos nuevos de módulos existentes. CODIGO queda vacío para Presea.',descargas).className='note';
    }
    if(payload.exportacionDBI){
      const p=payload.exportacionDBI,contenedor=element('section','',crossResult);contenedor.className='presea-download';
      element('h3','Fórmulas y relaciones para Presea (DBI)',contenedor);
      element('p',`${p.modulos} módulos con familia completa · ${p.componentes} relaciones módulo / suelto`,contenedor);
      if(p.mensaje)element('p',p.mensaje,contenedor);
      if(p.excluidas.length){const d=element('details','',contenedor);element('summary',`${p.excluidas.length} módulos excluidos de los DBI`,d);table(['Clave','Motivos'],p.excluidas.map(r=>[r.clave,r.motivos.join(' · ')]),d);}
      for(const [tipo,nombre]of [['relformu','PRODUCTOS_RELFORMU.DBI'],['relacion','PRODUCTOS_RELACION.DBI']]){
        const b=element('button',`Descargar ${nombre}`,contenedor);b.type='button';b.disabled=p.bloqueada||!p.modulos;b.style.marginTop='10px';
        b.addEventListener('click',async()=>{b.disabled=true;try{const response=await fetch(`/api/importaciones/analisis/${encodeURIComponent(payload.analisis.id)}/dbi/${tipo}`);if(!response.ok)throw new Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);crossStatus.textContent=`${nombre} descargado.`;}catch(e){crossStatus.textContent=e.message||'No se pudo descargar el DBI.';}finally{b.disabled=p.bloqueada||!p.modulos;}});
      }
      element('p','Primero importá los productos en Presea. Los DBI usan sus códigos alfa para resolver las referencias; los códigos internos nuevos quedan vacíos. Incluyen sueltos nuevos y existentes, con cantidades por módulo.',contenedor).className='note';
    }
    if(payload.exportacionAdicionalesDBI){
      const contenedor=element('section','',crossResult);contenedor.className='presea-download';element('h3','Modelos y datos adicionales para Presea',contenedor);
      for(const [tipo,nombre]of [['modelos','MODELOS_VERSATO.DBI'],['stockadi','PRODUCTOS_VERSATO_STOCKADI.DBI']]){
        const p=payload.exportacionAdicionalesDBI[tipo];element('p',nombre+' · '+p.total+' registros · '+p.excluidas.length+' excluidos',contenedor);
        if(p.mensaje)element('p',p.mensaje,contenedor);
        if(p.excluidas.length){const d=element('details','',contenedor);element('summary','Ver registros excluidos de '+nombre,d);table(['Clave','Motivos'],p.excluidas.map(r=>[r.clave,r.motivos.join(' · ')]),d);}
        const b=element('button','Descargar '+nombre,contenedor);b.type='button';b.disabled=p.bloqueada||!p.total;
        b.addEventListener('click',async()=>{b.disabled=true;try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/dbi/'+tipo);if(!response.ok)throw new Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);crossStatus.textContent=nombre+' descargado.';}catch(e){crossStatus.textContent=e.message||'No se pudo descargar el DBI.';}finally{b.disabled=p.bloqueada||!p.total;}});
      }
    }
    if(payload.preparacionFTP){
      const p=payload.preparacionFTP,contenedor=element('section','',crossResult);contenedor.className='presea-download';element('h3','Enviar los cinco archivos al FTP',contenedor);
      element('p','Destino: '+p.destino,contenedor);element('p','Envía los cinco DBI de este análisis y reemplaza los archivos con el mismo nombre en esa carpeta.',contenedor).className='note';
      if(p.mensaje)element('p',p.mensaje,contenedor);
      const b=element('button','Enviar los 5 DBI al FTP',contenedor);b.type='button';b.disabled=!p.disponible;const estado=element('p','',contenedor);estado.setAttribute('role','status');const detalle=element('div','',contenedor);
      b.addEventListener('click',async()=>{b.disabled=true;b.textContent='Enviando archivos…';estado.textContent='Preparando y enviando los cinco DBI. Esperá a que finalice.';detalle.replaceChildren();try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/enviar-ftp',{method:'POST'});const r=await response.json();estado.textContent=r.mensaje||r.error||'No se pudo enviar el lote.';if(r.archivos)table(['Archivo','Tamaño (bytes)','Estado'],r.archivos.map(a=>[a.nombre,a.bytes,a.estado]),detalle);if(!response.ok&&!r.archivos)throw new Error(r.error||'No se pudo enviar el lote.');crossStatus.textContent=estado.textContent;}catch(e){estado.textContent=e.message||'No se pudo confirmar el envío. Revisá el FTP antes de reintentar.';}finally{b.disabled=!p.disponible;b.textContent='Enviar los 5 DBI al FTP';}});
    }
    const excelDownload = document.createElement('button'); excelDownload.style.marginTop='12px'; excelDownload.type = 'button'; excelDownload.textContent = 'Descargar Excel'; crossResult.append(excelDownload);
    excelDownload.addEventListener('click', async () => {
      excelDownload.disabled = true; excelDownload.textContent = 'Preparando Excel…';
      try {
        const response = await fetch(`/api/importaciones/analisis/${encodeURIComponent(payload.analisis.id)}/excel`);
        if (!response.ok) { const error = await response.json(); throw new Error(error.error); }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a'); link.href = url; link.download = 'cruce-completo.xlsx'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        crossStatus.textContent = 'Excel completo descargado.';
      } catch (error) { crossStatus.textContent = error.message || 'No se pudo descargar el Excel.'; }
      finally { excelDownload.disabled = false; excelDownload.textContent = 'Descargar Excel'; }
    });
    const download = document.createElement('button'); download.style.marginTop = '12px'; download.type = 'button'; download.textContent = 'Descargar JSON'; crossResult.append(download);
    download.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'cruce-factura.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    for(const ayuda of crossResult.querySelectorAll('details.help'))if(ayuda!==validation)ayuda.remove();
    organizarAcciones(crossResult,payload,[excelDownload,download]);
    mostrarControlClientes(payload,crossResult);
    mostrarCOMEX(payload,crossResult);
    mostrarNV(payload,crossResult);
    mostrarPreciosNV(payload,crossResult);
    mostrarCorreo(payload,crossResult);
    if(payload.analisis?.confirmado!==false&&payload.analisis?.persistente){const panelMaestros=element('section','',crossResult);panelMaestros.className='presea-download';crossResult.prepend(panelMaestros);const actualizar=element('button','Actualizar contra maestros',panelMaestros);actualizar.type='button';actualizar.className='secondary';const nota=element('p',payload.actualizacionesMaestros?.length?'Última actualización: '+new Date(payload.actualizacionesMaestros.at(-1).fecha).toLocaleString('es-AR'):'Actualiza estados y archivos con los maestros del FTP, conservando la factura original.',panelMaestros);nota.className='note';nota.setAttribute('role','status');for(const aviso of payload.avisosMaestros||[])element('p',aviso,panelMaestros).className='download-notice';actualizar.addEventListener('click',async()=>{actualizar.disabled=true;nota.textContent='Actualizando maestros del FTP y comprobando productos…';try{const response=await fetch('/api/importaciones/analisis/'+encodeURIComponent(payload.analisis.id)+'/actualizar-maestros',{method:'POST'});const r=await response.json();if(!response.ok)throw new Error(r.error);mostrarAnalisis(r);crossStatus.textContent='Estados y archivos actualizados contra los maestros.';}catch(error){if(error instanceof TypeError){
 const historial='/api/historial/'+encodeURIComponent(payload.analisis.id);
 try{
  const respuesta=await fetch(historial,{cache:'no-store'});
  if(respuesta.ok){
   const guardado=await respuesta.json();
   const ultima=guardado.actualizacionesMaestros?.at(-1)?.fecha;
   if(ultima&&ultima!==payload.actualizacionesMaestros?.at(-1)?.fecha){
    mostrarAnalisis(guardado);
    crossStatus.textContent='Actualización recuperada de la base de datos.';
    return;
   }
  }
 }catch{}
 nota.textContent='Se interrumpió la conexión y no se pudo confirmar la actualización. Podés volver a intentarlo.';
}else{
 nota.textContent=error.message||'No se pudo confirmar la actualización.';
}
actualizar.disabled=false;}});}

    plegarResultados(crossResult,validation);
    if(location.hash==='#correo-factura')requestAnimationFrame(()=>{const correo=document.querySelector('#correo-factura');correo?.scrollIntoView({block:'start'});correo?.focus({preventScroll:true});});
    if(payload.analisis?.confirmado===false){
      for(const boton of crossResult.querySelectorAll('.presea-download button'))boton.disabled=true;
      const panel=document.createElement('section');panel.className='summary-card';crossResult.prepend(panel);
      element('h3','Vista previa · sin guardar',panel);
      element('p','Revisá los resultados. No se registraron datos ni se reservaron MODC. La vista previa vence en 30 minutos. Al guardar se confirman los MODC y se habilitan las descargas y el FTP.',panel);
      const aceptar=element('button','Aceptar y guardar análisis',panel);aceptar.type='button';
      const estado=element('p','',panel);estado.setAttribute('role','status');
      aceptar.addEventListener('click',async()=>{
        aceptar.disabled=true;estado.textContent='Guardando el análisis…';
        try{const response=await fetch('/api/importaciones/vistas-previas/'+encodeURIComponent(payload.analisis.id)+'/aceptar',{method:'POST'});const guardado=await response.json();if(!response.ok)throw Object.assign(new Error(guardado.error),{analisisId:guardado.analisisId});mostrarAnalisis(guardado);crossStatus.textContent='Análisis aceptado y guardado.';}
        catch(error){estado.textContent=error instanceof TypeError?'Se perdió la conexión con la app. Volvé a intentarlo cuando esté disponible.':error.message||'No se pudo guardar. Podés reintentar.';if(error.analisisId){const link=element('a','Abrir el análisis ya registrado',estado);link.href='/importaciones?analisis='+encodeURIComponent(error.analisisId);}aceptar.disabled=false;}
      });
      crossStatus.textContent='Vista previa lista. Pendiente de aceptación para guardar.';
    }else crossStatus.textContent = 'Análisis de factura finalizado y guardado.';
    mostrarControlPedidos(crossResult,payload);
    organizarVistaFactura(crossResult,payload,validation);
}
const analisisGuardado=new URLSearchParams(location.search).get('analisis');
if(analisisGuardado){crossButton.disabled=true;crossStatus.textContent='Recuperando análisis guardado…';fetch('/api/historial/'+encodeURIComponent(analisisGuardado)).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p.error);mostrarAnalisis(p);crossStatus.textContent='Análisis recuperado de la base de datos.';}).catch(e=>{crossStatus.textContent=e.message||'No se pudo recuperar el análisis.';}).finally(()=>{crossButton.disabled=false;});}
