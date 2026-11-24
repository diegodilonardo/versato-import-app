const fechaVisible=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.split('-').reverse().join('/'):v||'—';
const CLAVE_VISTA_MARCAS='versato-precios-marcas-v1';
function leerVistaMarcas(){try{const v=JSON.parse(localStorage.getItem(CLAVE_VISTA_MARCAS));return Array.isArray(v)&&v.every(m=>typeof m==='string')?v:null;}catch{return null;}}
const $=s=>document.querySelector(s),estado=$('#estado');let datos=null,pagina=0,listasAplicadas=null;
let vistaPresea, paginaPresea = 0, consultaPresea = 0, filtrosPresea;
let demoraBusquedaPresea;
let listaPreseaGuardada;
function mostrarListaPresea(lista) {
 listaPreseaGuardada = lista;
 $('#comparar-presea').disabled = !lista;
 $('#estado-lista-presea').textContent = lista
  ? `Copia guardada el ${new Date(lista.fecha).toLocaleString('es-AR')} · ${lista.registros.toLocaleString('es-AR')} registros.`
  : 'Todavía no hay una copia guardada. Usá Actualizar lista desde Presea para cargarla.';
}
async function consultarListaPresea(method = 'GET') {
 const respuesta = await fetch('/api/precios/presea/lista', { method });
 const datos = await respuesta.json();
 if (!respuesta.ok) throw new Error(datos.error);
 return datos.lista;
}
consultarListaPresea().then(mostrarListaPresea).catch(error => {
 $('#estado-lista-presea').textContent = error.message;
}).finally(() => { $('#actualizar-lista-presea').disabled = false; });
$('#actualizar-lista-presea').addEventListener('click', async () => {
 const boton = $('#actualizar-lista-presea');
 boton.disabled = $('#comparar-presea').disabled = true;
 $('#estado-lista-presea').textContent = 'Descargando y guardando la lista de Presea…';
 try {
  const lista = await consultarListaPresea('POST');
  ++consultaPresea;
  vistaPresea = null;
  productosPresea.clear();
  mostrarSeleccionPresea();
  $('#comparacion-presea').hidden = true;
  $('#estado-comparar-presea').textContent = 'Lista actualizada. Ya podés volver a comparar.';
  mostrarListaPresea(lista);
 } catch (error) {
  mostrarListaPresea(listaPreseaGuardada);
  $('#estado-lista-presea').textContent += ' ' + error.message;
 } finally { boton.disabled = false; }
});
const productosPresea = new Set();
function mostrarSeleccionPresea(limpiada = false) {
 const cantidad = productosPresea.size;
 $('#exportar-maestro').textContent = cantidad
  ? `Descargar DBI unificado · ${cantidad.toLocaleString('es-AR')} ${cantidad === 1 ? 'producto' : 'productos'}`
  : 'Descargar DBI unificado';
 $('#seleccion-productos-presea').textContent = cantidad
  ? 'El DBI unificado incluye los cambios de los productos marcados en las listas 03, 04 y 980, aunque la grilla esté filtrada.'
  : limpiada
   ? 'Selección limpiada. Podés marcar otros productos en la grilla.'
   : 'Marcá los productos que quieras incluir. La selección se conserva al cambiar de página o filtro.';
 $('#limpiar-productos-presea').hidden = !cantidad;
}
function descargarPreciosPresea(lista) {
 const estadoMaestro = $('#estado-exportar-maestro');
 if (!datos?.catalogo) { estadoMaestro.textContent = 'Primero consolidá las listas FOB.'; return; }
 if (!listaPreseaGuardada) { estadoMaestro.textContent = 'Primero usá Actualizar lista desde Presea.'; return; }
 if ($('#fecha-calculo').value !== datos.fecha) { estadoMaestro.textContent = 'Aplicá la vigencia seleccionada antes de descargar.'; return; }
 const formulario = document.createElement('form');
 formulario.method = 'POST';
 const vista = vistaPresea?.vigencia === datos.fecha ? '&vista=' + encodeURIComponent(vistaPresea.id) : '';
 if (productosPresea.size && !vista) {
  estadoMaestro.textContent = 'Volvé a comparar con la vigencia aplicada y elegí los productos nuevamente.';
  return;
 }
 if (productosPresea.size) {
  const campo = document.createElement('input');
  campo.type = 'hidden';
  campo.name = 'productos';
  campo.value = JSON.stringify([...productosPresea]);
  formulario.append(campo);
 }
 const seleccion = lista ? '&lista=' + encodeURIComponent(lista) : '';
 formulario.action = '/api/precios/maestro.dbi?fecha=' + encodeURIComponent(datos.fecha) + vista + seleccion;
 formulario.target = '_blank';
 formulario.rel = 'noopener';
 document.body.append(formulario);
 formulario.submit();
 formulario.remove();
 estadoMaestro.textContent = productosPresea.size
  ? `Preparando el DBI de los ${productosPresea.size} productos seleccionados.`
  : 'Comparando con los precios de Presea. El navegador descargará el DBI si hay cambios exportables.';
}
$('#exportar-maestro').addEventListener('click', () => descargarPreciosPresea());
for (const boton of document.querySelectorAll('[data-dbi-lista]')) {
 boton.addEventListener('click', () => descargarPreciosPresea(boton.dataset.dbiLista));
}
$('#limpiar-productos-presea').addEventListener('click', () => {
 productosPresea.clear();
 for (const casilla of document.querySelectorAll('#tabla-comparar-presea input[type="checkbox"]')) casilla.checked = false;
 $('#estado-exportar-maestro').textContent = '';
 mostrarSeleccionPresea(true);
 $('#filtros-comparar-presea input[type="search"]').focus();
});
const importePresea = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const estadosPresea = { IGUAL: 'Igual', NUEVO: 'Nuevo', CAMBIO: 'Modificado', CONFLICTO: 'En conflicto' };
function pintarTotalesPresea(resumen) {
 const lista = filtrosPresea.get('lista');
 const filtrado = filtrosPresea.get('tipo') || filtrosPresea.get('estado') || filtrosPresea.get('buscar')?.trim();
 const alcance = lista ? `Lista ${lista}` : 'Todas las listas';
 $('#alcance-totales-presea').textContent = `${alcance} · ${filtrado ? 'Totales según los filtros activos' : 'Totales de la comparación'}`;
 const contenedor = $('#resumen-comparar-presea');
 contenedor.replaceChildren();
 const tarjetas = [
  ['Diferencias', resumen.altas + resumen.cambios, 'presea-diferencias', 'Nuevos + modificados'],
  ['Iguales', resumen.iguales, 'is-success'],
  ['Nuevos', resumen.altas],
  ['Modificados', resumen.cambios],
  ['En conflicto', resumen.conflictos, 'is-warning']
 ];
 for (const [titulo, cantidad, estilo = '', descripcion] of tarjetas) {
  const tarjeta = nodo('div','',contenedor);
  tarjeta.className = `summary-card ${estilo}`;
  nodo('h3',titulo,tarjeta).className = 'summary-title';
  nodo('strong',cantidad.toLocaleString('es-AR'),tarjeta).className = 'stat-value';
  if (descripcion) nodo('p',descripcion,tarjeta).className = 'card-caption';
 }
}
function aplicarFiltrosPresea() {
 clearTimeout(demoraBusquedaPresea);
 if (!vistaPresea) return;
 filtrosPresea = new FormData($('#filtros-comparar-presea'));
 $('#alcance-totales-presea').textContent = 'Actualizando totales…';
 $('#resumen-comparar-presea').replaceChildren();
 return mostrarComparacionPresea(0);
}
async function mostrarComparacionPresea(pagina) {
 const consulta = ++consultaPresea;
 const parametros = new URLSearchParams(filtrosPresea);
 parametros.set('pagina', pagina);
 const anterior = $('#presea-anterior'), siguiente = $('#presea-siguiente');
 const resultado = $('#tabla-comparar-presea');
 anterior.disabled = siguiente.disabled = true;
 resultado.textContent = 'Buscando precios…';
 try {
  const respuesta = await fetch('/api/precios/presea/comparar/' + vistaPresea.id + '?' + parametros);
  const datos = await respuesta.json();
  if (consulta !== consultaPresea) return;
  if (!respuesta.ok) throw new Error(datos.error);
  pintarTotalesPresea(datos.resumen);
  resultado.replaceChildren();
  if (datos.filas.length) {
   const moneda = n => n == null ? '—' : importePresea.format(n);
   tabla(['Tipo','Código','COD_ALFA','DMODC','Pares','Mayorista por par','Lista','Precio Presea','Precio calculado','Diferencia','Estado','Elegir producto'], datos.filas.map(f => [f.tipo,f.codigo,f.cod_alfa,f.dmodc,f.pares,moneda(f.precioPar),f.lista,f.contradictorios.length ? f.contradictorios.map(moneda).join(' / ') : moneda(f.presea),moneda(f.calculado),moneda(f.diferencia),estadosPresea[f.estado],'']), resultado);
   const casillas = new Map();
   for (const [i, fila] of [...resultado.querySelectorAll('tbody tr')].entries()) {
    const { estado, codigo } = datos.filas[i];
    const celda = fila.cells[10];
    celda.replaceChildren();
    const etiqueta = nodo('span', estadosPresea[estado], celda);
    etiqueta.className = 'presea-estado';
    etiqueta.dataset.estado = estado;
    const casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.checked = productosPresea.has(codigo);
    casilla.setAttribute('aria-label', 'Elegir producto ' + codigo);
    fila.lastElementChild.append(casilla);
    if (!casillas.has(codigo)) casillas.set(codigo, []);
    casillas.get(codigo).push(casilla);
    casilla.addEventListener('change', () => {
     if (!casilla.checked) productosPresea.delete(codigo);
     else if (productosPresea.size < 5000) productosPresea.add(codigo);
     else $('#estado-exportar-maestro').textContent = 'Podés elegir hasta 5.000 productos por descarga.';
     for (const control of casillas.get(codigo)) control.checked = productosPresea.has(codigo);
     mostrarSeleccionPresea();
    });
   }
  } else resultado.textContent = 'No hay precios con esos filtros.';
  paginaPresea = pagina;
  $('#presea-pagina').textContent = 'Página ' + (pagina + 1);
  anterior.disabled = pagina === 0;
  siguiente.disabled = !datos.siguiente;
 } catch (error) {
  if (consulta === consultaPresea) {
   $('#alcance-totales-presea').textContent = 'Totales no disponibles.';
   $('#resumen-comparar-presea').replaceChildren();
   resultado.textContent = error.message;
  }
 }
}
$('#comparar-presea').addEventListener('click', async () => {
 const boton = $('#comparar-presea'), aviso = $('#estado-comparar-presea');
 if (!datos?.catalogo || $('#fecha-calculo').value !== datos.fecha) {
  aviso.textContent = 'Consolidá las listas y aplicá la vigencia antes de comparar.';
  return;
 }
 const vigencia = datos.fecha;
 ++consultaPresea;
 vistaPresea = null;
 productosPresea.clear();
 mostrarSeleccionPresea();
 boton.disabled = true;
 $('#comparacion-presea').hidden = true;
 $('#actualizar-lista-presea').disabled = true;
 aviso.textContent = 'Comparando con la lista guardada en la base…';
 try {
  const respuesta = await fetch('/api/precios/presea/comparar?fecha=' + encodeURIComponent(vigencia), { method: 'POST' });
  const resumen = await respuesta.json();
  if (!respuesta.ok) throw new Error(resumen.error);
  vistaPresea = { ...resumen, vigencia };
  aviso.textContent = 'Vigencia ' + fechaVisible(vigencia) + ' · Copia de Presea del ' + new Date(resumen.fecha).toLocaleString('es-AR') + ' · Disponible durante 15 minutos.';
  $('#comparacion-presea').hidden = false;
  await aplicarFiltrosPresea();
 } catch (error) { aviso.textContent = error.message; }
 finally { boton.disabled = false; $('#actualizar-lista-presea').disabled = false; }
});
$('#filtros-comparar-presea').addEventListener('submit', e => {
 e.preventDefault();
 aplicarFiltrosPresea();
});
for (const selector of document.querySelectorAll('#filtros-comparar-presea select')) {
 selector.addEventListener('change', aplicarFiltrosPresea);
}
$('#filtros-comparar-presea input[type="search"]').addEventListener('input', () => {
 clearTimeout(demoraBusquedaPresea);
 demoraBusquedaPresea = setTimeout(aplicarFiltrosPresea, 300);
});
$('#presea-anterior').addEventListener('click', () => mostrarComparacionPresea(paginaPresea - 1));
$('#presea-siguiente').addEventListener('click', () => mostrarComparacionPresea(paginaPresea + 1));
function nodo(tag,texto,padre){const n=document.createElement(tag);n.textContent=texto??'';padre.append(n);return n;}
function tabla(columnas,filas,padre){const wrap=nodo('div','',padre);wrap.className='table-scroll';const t=nodo('table','',wrap),h=nodo('tr','',nodo('thead','',t));columnas.forEach(c=>nodo('th',c,h));const b=nodo('tbody','',t);for(const fila of filas){const r=nodo('tr','',b);fila.forEach(v=>nodo('td',v,r));}}
function pintar(){
 if(leerVistaMarcas()!==null)$('#estado-vista-marcas').textContent='Selección guardada recuperada en este navegador.';
 pintarFuentes();const catalogo=datos.catalogo,config=datos.config;$('#resumen').replaceChildren();
 for(const [titulo,valor]of [['Listas leídas',catalogo?.archivos.length||0],['Registros FOB',catalogo?.registros||0],['Modelos',catalogo?.filas.length||0]]){const c=nodo('div','',$('#resumen'));c.className='summary-card';nodo('h3',titulo,c).className='summary-title';nodo('strong',valor.toLocaleString('es-AR'),c).className='stat-value';}
 const seleccion=$('#marca').value;$('#marca').replaceChildren();for(const marca of datos.marcas){const option=nodo('option',marca,$('#marca'));option.value=marca;if(marca===seleccion)option.selected=true;}const inicial=!$('#desde').value;if(inicial)$('#desde').value=datos.fecha;$('#fecha-calculo').value=datos.fecha;pintarSelectorVigencias();cargarAjusteGuardado(inicial);
 $('#vigentes').replaceChildren();tabla(['Marca','Vigente desde (día/mes/año)','Coeficiente 1','Coeficiente 2','Descuento comercial (%)','Importe','Estado al '+fechaVisible(datos.fecha)],datos.vigentes.map(v=>[v.marca,fechaVisible(v.configuracion?.desde),v.configuracion?.coeficiente1??'—',v.configuracion?.coeficiente2??'—',v.configuracion?(v.configuracion.descuentoComercial??0):'—',v.configuracion?.importe??'—',v.configuracion?'Configurada':'Pendiente de configuración']),$('#vigentes'));
 pintarHistorialVigencias();$('#historial-anterior').replaceChildren();tabla(['Marca','Vigencia','Ajuste anterior','Porcentaje','Multiplicador'],(datos.historialAnterior||[]).map(v=>[v.marca,fechaVisible(v.desde),v.tipoAjuste==='AGREGADO'?'Agregado':'Quita',v.quita,v.multiplicador]),$('#historial-anterior'));
 const vistaGuardada=leerVistaMarcas(),seleccionExportada=new Set([...document.querySelectorAll('#marcas-exportacion input:checked')].map(e=>e.value)),habiaOpciones=$('#marcas-exportacion').children.length>0;$('#marcas-exportacion').replaceChildren();for(const marca of datos.marcas){const label=nodo('label','',$('#marcas-exportacion')),c=document.createElement('input');c.type='checkbox';c.value=marca;c.checked=habiaOpciones?seleccionExportada.has(marca):vistaGuardada===null||vistaGuardada.includes(marca);label.append(c,document.createTextNode(marca));c.addEventListener('change',()=>{actualizarExportacion();$('#estado-vista-marcas').textContent='Selección modificada. Guardá para recuperarla la próxima vez.';});}actualizarExportacion();
 $('#controles').replaceChildren();if(catalogo){nodo('p','Consolidado guardado: '+new Date(catalogo.preparado).toLocaleString('es-AR'),$('#controles'));tabla(['Archivo','Registros FOB'],catalogo.archivos.map(a=>[a.nombre,a.registros]),$('#controles'));if(catalogo.omitidas.length)tabla(['Archivo','Hoja','Motivo de exclusión'],catalogo.omitidas.map(a=>[a.archivo,a.hoja,a.motivo]),$('#controles'));if(catalogo.errores.length)tabla(['Archivo','Hoja','Fila','Problema'],catalogo.errores.map(a=>[a.archivo,a.hoja,a.fila,a.motivo]),$('#controles'));}
 if(datos.erroresCalculo.length)tabla(['Modelo','Problema de cálculo'],datos.erroresCalculo.slice(0,100).map(e=>[e.modelo,e.motivo]),$('#controles'));mostrarFilas();
}
function mostrarFilas(){const q=$('#buscar').value.trim().toUpperCase(),filas=(datos?.catalogo?.filas||[]).filter(r=>[r.modelo,r.modelo.replaceAll('.','-'),...r.marcas].some(v=>v.toUpperCase().includes(q))),paginas=Math.max(1,Math.ceil(filas.length/100));pagina=Math.min(pagina,paginas-1);$('#tabla').replaceChildren();const precio=v=>v==null?'Sin vigencia o con error':v.toLocaleString('es-AR',{minimumFractionDigits:datos.config.decimales,maximumFractionDigits:datos.config.decimales});
 tabla(['Marca','Modelo','FOB máximo (U$D)','Descuento comercial (%)','FOB neto (U$D)','Precio público','Precio mayorista','FOB analizados'],filas.slice(pagina*100,pagina*100+100).map(r=>[r.marcas.join(' / '),r.modelo,'U$D '+r.fobMaximo.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),r.vigencia?(r.vigencia.descuentoComercial??0):'—',r.fobNeto==null?'—':'U$D '+r.fobNeto.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:6}),precio(r.precioPublico),precio(r.precioMayorista),'']),$('#tabla'));agregarConsultaFuentes(filas.slice(pagina*100,pagina*100+100));$('#conteo').textContent=filas.length+' modelos · '+(datos?.catalogo?.errores.length||0)+' filas de origen para revisar · '+(datos?.erroresCalculo.length||0)+' errores de cálculo';$('#pagina').textContent='Página '+(pagina+1)+' de '+paginas;$('#anterior').disabled=pagina===0;$('#siguiente').disabled=pagina>=paginas-1;}
async function consultar(url,opciones){if((!opciones||!opciones.method||opciones.method==='GET')&&/^\/api\/precios(?:\?|$)/.test(url)&&listasAplicadas!==null)url+=(url.includes('?')?'&':'?')+'listas='+encodeURIComponent(JSON.stringify(listasAplicadas));const r=await fetch(url,opciones),p=await r.json();if(!r.ok)throw new Error(p.error);datos=p;if(opciones?.method==='POST'&&listasAplicadas!==null){await consultar('/api/precios?fecha='+encodeURIComponent(p.fecha));return p;}pintar();return p;}
$('#consolidar').addEventListener('click',async()=>{const b=$('#consolidar');b.disabled=true;estado.textContent='Leyendo las listas y guardando el máximo por modelo…';try{await consultar('/api/precios/consolidar?fecha='+encodeURIComponent($('#fecha-calculo').value||datos.fecha),{method:'POST'});estado.textContent='Consolidado guardado. '+(datos.config.historial.length?'Precios calculados con las vigencias guardadas.':'Cargá las vigencias de cada marca para calcular los precios finales.');}catch(e){estado.textContent=e.message;}finally{b.disabled=false;actualizarExportacion();}});
$('#formulas').addEventListener('submit',async e=>{e.preventDefault();const b=$('#guardar');b.disabled=true;try{await consultar('/api/precios/vigencias?fecha='+encodeURIComponent(datos.fecha),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:datos.config.revision,marca:$('#marca').value,desde:$('#desde').value,coeficiente1:Number($('#coeficiente1').value),coeficiente2:Number($('#coeficiente2').value),importe:Number($('#importe').value),descuentoComercial:Number($('#descuento-comercial').value)})});estado.textContent='Vigencia guardada en el historial.'+(datos.erroresCalculo.length?' Completá las marcas pendientes para exportar.':'');}catch(e){estado.textContent=e.message;}finally{b.disabled=false;}});
$('#consultar-fecha').addEventListener('click',()=>aplicarVigencia());
$('#buscar').addEventListener('input',()=>{pagina=0;mostrarFilas();});$('#anterior').addEventListener('click',()=>{pagina--;mostrarFilas();});$('#siguiente').addEventListener('click',()=>{pagina++;mostrarFilas();});
consultar('/api/precios').then(()=>{estado.textContent=datos.catalogo?'Consolidado recuperado.':'Consolidá las listas para comenzar.';}).catch(e=>estado.textContent=e.message);

$('#exportar').addEventListener('click',async()=>{const b=$('#exportar');b.disabled=true;try{const r=await fetch(b.dataset.url);if(!r.ok)throw new Error((await r.json()).error);const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='Lista Precios Versato '+datos.fecha.split('-').reverse().join('-')+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);estado.textContent='Lista exportada en el formato por marca.';}catch(e){estado.textContent=e.message;}finally{actualizarExportacion();}});
$('#incorporar-listas').addEventListener('submit', async e => {
 e.preventDefault();
 const archivo = $('#listas-nuevas'), aviso = $('#estado-carga-fob');
 const archivos = [...archivo.files];
 if (!archivos.length || archivos.length > 10) { aviso.textContent = 'Seleccioná entre 1 y 10 listas FOB.'; return; }
 if (archivos.some(f => f.size > 60 * 1024 * 1024) || archivos.reduce((s,f) => s + f.size, 0) > 150 * 1024 * 1024) {
  aviso.textContent = 'Los archivos superan los límites de tamaño indicados.';
  return;
 }
 const controles = [archivo, ...['subir-listas','consolidar','guardar','exportar','fuentes-ver','fuentes-activar'].map(id => $('#'+id))];
 const estados = controles.map(control => [control,control.disabled]);
 for (const control of controles) control.disabled = true;
 aviso.textContent = 'Validando y guardando los Excel…';
 try {
  const form = new FormData();
  for (const f of archivos) form.append('listas',f);
  const params = new URLSearchParams();
  if (datos?.fecha) params.set('fecha', datos.fecha);
  const respuesta = await consultar('/api/precios/incorporar?' + params, { method:'POST', body:form });
  const { incorporados, omitidos } = respuesta.incorporacion;
  const pendientes = incorporados.filter(nombre => !datos.listasActivas.includes(nombre));
  if (listasAplicadas === null) {
   for (const casilla of document.querySelectorAll('#fuentes-listado input')) {
    if (incorporados.includes(casilla.value) && datos.listasActivas.includes(casilla.value)) casilla.checked = true;
   }
  }
  aviso.textContent = incorporados.length + ' archivos incorporados · ' + omitidos.length + ' copias idénticas omitidas.' +
   (pendientes.length ? ' Para activar las nuevas listas, marcalas y presioná Guardar listas seleccionadas.' : '');
  archivo.value = '';
 } catch (error) {
  aviso.textContent = error.message;
 } finally {
  for (const [control,deshabilitado] of estados) if (control.id !== 'exportar') control.disabled = deshabilitado;
  actualizarExportacion();
 }
});
$('#fecha-calculo').addEventListener('change',()=>{$('#vigencia-elegida').value=[...$('#vigencia-elegida').options].some(o=>o.value===$('#fecha-calculo').value)?$('#fecha-calculo').value:'';$('#exportar').disabled=true;$('#requisitos-exportacion').textContent='Presioná Aplicar vigencia para usar la fecha seleccionada antes de descargar.';});

function actualizarExportacion(){if(!datos)return;const marcas=[...document.querySelectorAll('#marcas-exportacion input:checked')].map(c=>c.value),modelos=new Set((datos.catalogo?.filas||[]).filter(r=>r.marcas.some(m=>marcas.includes(m))).map(r=>r.modelo)),faltantes=datos.vigentes.filter(v=>marcas.includes(v.marca)&&!v.configuracion).map(v=>v.marca),errores=datos.erroresCalculo.some(e=>modelos.has(e.modelo)),fechaPendiente=$('#fecha-calculo').value!==datos.fecha,fuentesPendientes=JSON.stringify(fuentesElegidas().sort())!==JSON.stringify([...(listasAplicadas||datos.catalogo?.archivos.map(a=>a.nombre)||[])].sort());$('#exportar').disabled=fuentesPendientes||!datos.catalogo||!marcas.length||faltantes.length>0||errores||datos.catalogo.errores.length>0||fechaPendiente;$('#exportar').dataset.url='/api/precios/consolidado.xlsx?fecha='+encodeURIComponent(datos.fecha)+'&marcas='+encodeURIComponent(marcas.join(','))+(listasAplicadas===null?'':'&listas='+encodeURIComponent(JSON.stringify(listasAplicadas)));$('#requisitos-exportacion').textContent=fuentesPendientes?'Aplicá la selección de listas antes de exportar.':fechaPendiente?'Consultá la fecha seleccionada antes de exportar.':!marcas.length?'Seleccioná al menos una marca.':faltantes.length?'Sin vigencia: '+faltantes.join(', ')+'. Completá sus parámetros o desmarcá las marcas que no necesitás exportar.':errores||datos.catalogo?.errores.length?'Revisá los errores antes de descargar.':'Se exportan '+marcas.length+' marcas con las columnas MARCA, MODELO, PRECIO_PUBLICO y PRECIO_MAYORISTA.';}



function cargarAjusteGuardado(ajustarFecha=false){if(!datos)return;const marca=$('#marca').value,desde=ajustarFecha?datos.fecha:$('#desde').value,v=[...datos.config.historial].reverse().filter(v=>v.marca===marca&&v.desde<=desde).sort((a,b)=>b.desde.localeCompare(a.desde))[0];if(ajustarFecha)$('#desde').value=datos.fecha;$('#coeficiente1').value=v?.coeficiente1??'';$('#coeficiente2').value=v?.coeficiente2??'';$('#importe').value=v?.importe??'';$('#descuento-comercial').value=v?.descuentoComercial??0;$('#guardar').textContent=datos.config.historial.some(v=>v.marca===marca&&v.desde===$('#desde').value)?'Guardar cambios de esta vigencia':'Guardar vigencia de la marca';}
$('#marca').addEventListener('change',()=>cargarAjusteGuardado(true));$('#desde').addEventListener('change',()=>cargarAjusteGuardado(false));

$('#guardar-vista-marcas').addEventListener('click',()=>{try{const seleccion=[...document.querySelectorAll('#marcas-exportacion input:checked')].map(c=>c.value);localStorage.setItem(CLAVE_VISTA_MARCAS,JSON.stringify(seleccion));$('#estado-vista-marcas').textContent='Selección de '+seleccion.length+' marcas guardada. Se recuperará al volver a abrir Precios.';}catch{$('#estado-vista-marcas').textContent='No se pudo guardar la selección en este navegador.';}});

function fuentesElegidas(){return [...document.querySelectorAll('#fuentes-listado input:checked')].map(e=>e.value);}
function editarFichaFOB(fuente, destino) {
 const detalle = nodo('details','',destino);
 detalle.className = 'fob-editor';
 nodo('summary','Editar nombre y vigencia',detalle);
 const formulario = nodo('form','',detalle);
 formulario.className = 'fob-editor-fields';
 const nombre = nodo('input','',nodo('label','Nombre de la lista',formulario));
 nombre.type = 'text';
 nombre.maxLength = 120;
 nombre.placeholder = fuente.nombre;
 nombre.value = fuente.etiqueta || '';
 const fecha = nodo('input','',nodo('label','Vigencia de la lista',formulario));
 fecha.type = 'date';
 fecha.value = fuente.fechaManual || '';
 const guardar = nodo('button','Guardar nombre y vigencia',formulario);
 guardar.type = 'submit';
 formulario.addEventListener('submit',async evento => {
  evento.preventDefault();
  guardar.disabled = true;
  const estado = $('#estado-ficha-fob');
  estado.textContent = 'Guardando datos de la lista…';
  try {
   const respuesta = await fetch('/api/precios/fuentes/ficha', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ nombre:fuente.nombre, etiqueta:nombre.value, fecha:fecha.value })
   });
   const resultado = await respuesta.json();
   if (!respuesta.ok) throw new Error(resultado.error);
   datos.fuentes = resultado.fuentes;
   pintarFuentes();
   estado.textContent = 'Nombre y vigencia guardados.';
  } catch (error) { estado.textContent = error.message; }
  finally { guardar.disabled = false; }
 });
}
function pintarFuentes(){const area=$('#fuentes-listado'),existia=area.children.length>0,seleccion=new Set(existia?fuentesElegidas():datos.catalogo?.archivos.map(a=>a.nombre)||[]);area.replaceChildren();const t=nodo('table','',area),h=nodo('tr','',nodo('thead','',t));for(const n of ['Incluir','Lista / archivo','Vigencia','Uso para NV'])nodo('th',n,h);const cuerpo=nodo('tbody','',t);for(const f of datos.fuentes||[]){const tr=nodo('tr','',cuerpo),td=nodo('td','',tr),c=nodo('input','',td);c.type='checkbox';c.value=f.nombre;c.checked=seleccion.has(f.nombre);c.setAttribute('aria-label','Incluir '+f.nombre);const celda=nodo('td',f.etiqueta||f.nombre,tr);if(f.etiqueta)nodo('div',f.nombre,celda).className='note';editarFichaFOB(f,celda);nodo('td',f.fecha?fechaVisible(f.fecha)+(f.fechaManual?' · Manual':' · Del archivo'):'Sin fecha',tr);nodo('td',datos.listasActivas?.includes(f.nombre)?'Activa':'Fuera del cálculo',tr);c.addEventListener('change',()=>{$('#estado-fuentes').textContent='Selección modificada. Presioná Vista previa sin guardar para probar o Guardar listas seleccionadas para conservar el cambio.';$('#exportar').disabled=true;});}$('#estado-fuentes').textContent=(datos.vistaFiltrada?'Vista y Excel con '+listasAplicadas.length+' listas seleccionadas.':'Vista con el consolidado activo.')+' NV: '+(datos.listasActivas?.length||0)+' listas activas.';}
for(const [id,valor]of [['fuentes-todas',true],['fuentes-ninguna',false]])$('#'+id).addEventListener('click',()=>{for(const c of document.querySelectorAll('#fuentes-listado input'))c.checked=valor;$('#exportar').disabled=true;$('#estado-fuentes').textContent='Selección modificada. Presioná Vista previa sin guardar o Guardar listas seleccionadas.';});
$('#fuentes-ver').addEventListener('click',async()=>{const listas=fuentesElegidas();if(!listas.length){$('#estado-fuentes').textContent='Seleccioná al menos una lista.';return;}const anterior=listasAplicadas;listasAplicadas=listas;$('#fuentes-ver').disabled=true;estado.textContent='Calculando FOB máximo entre las listas seleccionadas…';try{await consultar('/api/precios?fecha='+encodeURIComponent(datos.fecha));estado.textContent='Vista y Excel actualizados. El cálculo activo de las NV no cambió.';}catch(e){listasAplicadas=anterior;estado.textContent=e.message;}finally{$('#fuentes-ver').disabled=false;}});
$('#fuentes-activar').addEventListener('click',async()=>{const listas=fuentesElegidas();if(!listas.length){$('#estado-fuentes').textContent='Seleccioná al menos una lista.';return;}const anterior=listasAplicadas;listasAplicadas=listas;$('#fuentes-activar').disabled=true;estado.textContent='Guardando las listas seleccionadas…';try{await consultar('/api/precios/fuentes/activar?fecha='+encodeURIComponent(datos.fecha),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listas})});estado.textContent='Listas seleccionadas guardadas. Se recuperarán al abrir Precios y se usarán en los próximos cálculos de NV.';}catch(e){listasAplicadas=anterior;estado.textContent=e.message;}finally{$('#fuentes-activar').disabled=false;}});

function pintarSelectorVigencias(){const select=$('#vigencia-elegida');select.replaceChildren();const libre=nodo('option','Fecha personalizada',select);libre.value='';for(const fecha of [...new Set(datos.config.historial.filter(v=>v.activo!==false).map(v=>v.desde))].sort().reverse()){const marcas=[...new Set(datos.config.historial.filter(v=>v.activo!==false&&v.desde===fecha).map(v=>v.marca))];const option=nodo('option',fecha.split('-').reverse().join('/')+' · '+marcas.length+' marcas',select);option.value=fecha;}select.value=[...select.options].some(o=>o.value===datos.fecha)?datos.fecha:'';}
$('#vigencia-elegida').addEventListener('change',()=>{const fecha=$('#vigencia-elegida').value;if(!fecha)return;$('#fecha-calculo').value=fecha;aplicarVigencia();});

async function aplicarVigencia(){const fecha=$('#fecha-calculo').value,feedback=$('#estado-aplicar-vigencia'),boton=$('#consultar-fecha');if(!fecha){feedback.textContent='Elegí una fecha de cálculo.';return;}const controles=[boton,$('#vigencia-elegida'),$('#fecha-calculo')];for(const c of controles)c.disabled=true;boton.textContent='Aplicando…';$('#exportar').disabled=true;feedback.textContent='Actualizando la grilla y los precios…';try{await consultar('/api/precios?fecha='+encodeURIComponent(fecha));feedback.textContent='Vigencia '+datos.fecha.split('-').reverse().join('/')+' aplicada. Grilla y Excel actualizados.';estado.textContent=feedback.textContent;}catch(e){feedback.textContent=e.message||'No se pudo aplicar la vigencia. Volvé a intentar.';$('#exportar').disabled=true;}finally{for(const c of controles)c.disabled=false;boton.textContent='Aplicar vigencia';}}

function pintarHistorialVigencias(){const area=$('#historial-vigencias');area.replaceChildren();const registros=[...datos.config.historial].reverse().sort((a,b)=>a.marca.localeCompare(b.marca)||b.desde.localeCompare(a.desde));tabla(['Marca','Vigencia','Versión','Coef. 1','Coef. 2','Descuento (%)','Importe','Estado','Acción'],registros.map(v=>[v.marca,fechaVisible(v.desde),v.version||1,v.coeficiente1,v.coeficiente2,v.descuentoComercial??0,v.importe,v.activo===false?'Inactiva':'Activa','']),area);const rows=area.querySelectorAll('tbody tr');registros.forEach((v,i)=>{const boton=nodo('button',v.activo===false?'Reactivar':'Desactivar',rows[i].lastElementChild);boton.type='button';boton.className='vigencia-state-action';boton.setAttribute('aria-label',(v.activo===false?'Reactivar ':'Desactivar ')+v.marca+' '+v.desde);boton.addEventListener('click',async()=>{boton.disabled=true;estado.textContent='Actualizando estado de la vigencia…';try{await consultar('/api/precios/vigencias/estado?fecha='+encodeURIComponent(datos.fecha),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:datos.config.revision,marca:v.marca,desde:v.desde,activo:v.activo===false})});$('#estado-aplicar-vigencia').textContent='Estado actualizado. Se recalculó la última vigencia activa por marca.';estado.textContent='Vigencia '+(v.activo===false?'reactivada':'desactivada')+'. El historial se conserva.';}catch(e){estado.textContent=e.message;boton.disabled=false;}});});}

let consultaFuentesModelo=0;
function agregarConsultaFuentes(filas){const rows=$('#tabla').querySelectorAll('tbody tr');for(const [i,r]of filas.entries()){const celda=rows[i]?.lastElementChild;if(!celda)continue;celda.classList.add('fob-groups-cell');const grupos=r.fobsAnalizados||[{fob:r.fobMaximo,listas:new Set(r.origenes.map(o=>o.archivo)).size}];for(const g of grupos){const boton=nodo('button','U$D '+g.fob.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})+' · '+g.listas+(g.listas===1?' lista':' listas'),celda);boton.type='button';boton.className='fob-group-button'+(g.fob===r.fobMaximo?' is-maximum':'');boton.title=(g.fob===r.fobMaximo?'Máximo utilizado. ':'')+'Desplegar archivos de este FOB';boton.setAttribute('aria-expanded','false');boton.addEventListener('click',async()=>{const solicitud=++consultaFuentesModelo;let panel=$('#detalle-fuentes-modelo');if(panel?.dataset.modelo===r.modelo&&panel.dataset.fob===String(g.fob)&&!panel.hidden){panel.hidden=true;boton.setAttribute('aria-expanded','false');return;}boton.disabled=true;boton.setAttribute('aria-expanded','true');if(!panel){panel=nodo('section','',$('#tabla'));panel.id='detalle-fuentes-modelo';panel.className='source-model-detail';}panel.hidden=false;panel.dataset.modelo=r.modelo;panel.dataset.fob=String(g.fob);panel.replaceChildren();nodo('h3','Modelo '+r.modelo+' · FOB U$D '+g.fob.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),panel);const cerrar=nodo('button','Cerrar detalle',panel);cerrar.type='button';cerrar.className='source-model-button';cerrar.addEventListener('click',()=>{panel.hidden=true;boton.setAttribute('aria-expanded','false');});const mensaje=nodo('p','Consultando las listas de este FOB…',panel);mensaje.setAttribute('role','status');try{const response=await fetch('/api/precios/modelo/'+encodeURIComponent(r.modelo)+'/fuentes'+(listasAplicadas===null?'':'?listas='+encodeURIComponent(JSON.stringify(listasAplicadas)))),p=await response.json();if(solicitud!==consultaFuentesModelo)return;if(!response.ok)throw new Error(p.error);const detalle=p.filas.filter(f=>f.fob===g.fob);mensaje.textContent=detalle.length+' apariciones. Se indica cuáles están incluidas en el cálculo.';tabla(['Archivo','Fecha','Hoja','Fila','FOB (U$D)','Incluida en vista','Activa para NV'],detalle.map(f=>[f.archivo,fechaVisible(f.fecha),f.hoja,f.fila,'U$D '+f.fob.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),f.incluida?'Sí':'No',f.activaNV?'Sí':'No']),panel);}catch(e){if(solicitud===consultaFuentesModelo)mensaje.textContent=e.message;}finally{boton.disabled=false;}});}}}
