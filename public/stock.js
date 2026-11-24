const $ = id => document.getElementById('stock-'+id);
const numero = n => typeof n==='number' ? n.toLocaleString('es-AR',{maximumFractionDigits:2}) : n;
let pagina=0, parametrosExportar, solicitud=0, demora, exportando=false;
let guardada;
let vistas=[];
try { guardada=JSON.parse(localStorage.getItem('versato-stock')||'null'); } catch {}
function estado(t){ $('estado')?.remove(); let p=document.getElementById('estado-stock');if(!p){p=document.createElement('p');p.id='estado-stock';p.role='status';$('actualizar').parentNode.append(p);}p.textContent=t; }
function seleccion(id){return [...$(id).querySelectorAll('input:checked')].map(i=>i.value);}
function parametros(){return new URLSearchParams({depositos:seleccion('depositos').join(','),marcas:seleccion('marcas').join(','),listas:seleccion('listas').join(','),buscar:$('buscar').value,tipo:$('tipo').value,separar:$('separar').value});}
function invalidar(){solicitud++;parametrosExportar=null;$('resultados').hidden=true;$('exportar').disabled=true;}
async function pedir(url,opciones){const r=await fetch(url,opciones);const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo completar la operación.');return d;}
async function cargar(actualizar=false){
 $('actualizar').disabled=true;estado(actualizar?'Descargando y validando stock desde FTP…':'Consultando stock guardado…');
 try{
  const d=await pedir('/api/stock'+(actualizar?'/actualizar':''),actualizar?{method:'POST'}:undefined);
  for(const [id,opciones] of [['depositos',d.depositos.map(r=>[r.codigo,`${r.codigo} · ${r.nombre}`])],['marcas',d.marcas.map(v=>[v,v])],['listas',d.listas.map(v=>[v,v])]]){
   const prev=seleccion(id), mantener=$(id).childElementCount>0;
   $(id).replaceChildren();
   for(const [v,t]of opciones){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=v;input.checked=mantener?prev.includes(v):guardada?.[id]?.includes(v)||(!guardada&&id==='listas'&&v==='03');label.append(input,document.createTextNode(t));$(id).append(label);}
  }
  if(guardada&&!actualizar){$('separar').value=guardada.separar||'si';$('tipo').value=guardada.tipo||'';$('buscar').value=guardada.buscar||'';}
  estado(`${numero(d.registros)} registros · Stock actualizado: ${new Date(d.fecha).toLocaleString('es-AR')}. Elegí depósitos, marcas y listas para armar la grilla.`);
  invalidar();
 }catch(e){estado(e.message);}finally{$('actualizar').disabled=false;}
}
async function generar(p=0){
 const n=++solicitud, q=parametros();q.set('pagina',p);$('generar').disabled=true;estado('Armando grilla y consultando los precios de Presea…');
 try{
  const d=await pedir('/api/stock/grilla?'+q);if(n!==solicitud)return;
  pagina=p;parametrosExportar=parametros().toString();$('resultados').hidden=false;
  $('exportar').disabled=exportando||!d.total;
  $('totales').replaceChildren();
  for(const [texto,v]of [['Grupos',d.resumen.grupos],['Módulos',d.resumen.modulos],['Total pares',d.resumen.pares],['Productos sin precio',d.resumen.sinPrecio]]){const c=document.createElement('div'),l=document.createElement('span'),b=document.createElement('strong');l.textContent=texto;b.textContent=numero(v);c.append(l,b);$('totales').append(c);}
  $('fechas').textContent=`Stock: ${new Date(d.fecha).toLocaleString('es-AR')} · Precios de Presea: ${new Date(d.fechaPrecios).toLocaleString('es-AR')}. Versión 1.`;
  const cab=['Depósito','Marca','Modelo','Código color','Color','Tipo','Curva',...d.talles,'Cantidad','Total pares',...d.listas.map(l=>'Precio '+l)];
  const tr=document.createElement('tr');for(const c of cab){const th=document.createElement('th');th.textContent=c;tr.append(th);}$('tabla').tHead.replaceChildren(tr);
  const cuerpo=$('tabla').tBodies[0];cuerpo.replaceChildren();
  for(const g of d.grupos){const tr=document.createElement('tr');for(const v of [g.deposito,g.marca,g.modelo,g.codigoColor,g.color,g.tipo,g.curva,...d.talles.map(t=>g.talles[t]??'—'),g.cantidad,g.totalPares,...d.listas.map(l=>g.precios[l])]){const td=document.createElement('td');td.textContent=numero(v);tr.append(td);}cuerpo.append(tr);}
  $('pagina').textContent=`Página ${p+1} de ${Math.max(1,Math.ceil(d.total/50))}`;$('anterior').disabled=p===0;$('siguiente').disabled=(p+1)*50>=d.total;
  estado(d.total?`${numero(d.total)} grupos. La descarga incluye todos los resultados, separados por marca y lista, con cada código de producto.`:'No hay existencias para esta selección.');
 }catch(e){if(n===solicitud){invalidar();estado(e.message);}}finally{$('generar').disabled=false;}
}
$('actualizar').onclick=()=>cargar(true);
$('generar').onclick=()=>generar();
$('anterior').onclick=()=>generar(pagina-1);$('siguiente').onclick=()=>generar(pagina+1);
function configuracion(){return {depositos:seleccion('depositos'),marcas:seleccion('marcas'),listas:seleccion('listas'),tipo:$('tipo').value,separar:$('separar').value,buscar:$('buscar').value};}
function vistaElegida(){return vistas.find(v=>v.id===$('vista').value);}
function botonesVista(){const existe=!!vistaElegida();$('vista-actualizar').disabled=!existe;$('vista-eliminar').disabled=!existe;cargarProgramacion();}
function pintarVistas(id=''){
 $('vista').replaceChildren();
 const inicial=document.createElement('option');inicial.value='';inicial.textContent='Seleccioná una vista';$('vista').append(inicial);
 for(const v of [...vistas].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))){const o=document.createElement('option');o.value=v.id;o.textContent=v.nombre;$('vista').append(o);}
 $('vista').value=id;botonesVista();
}
async function cargarVistas(){
 try{const d=await pedir('/api/stock/vistas');vistas=d.vistas;pintarVistas();}
 catch(e){$('vista-estado').textContent=e.message;}
}
$('vista').onchange=async()=>{
 clearTimeout(demora);invalidar();botonesVista();
 const v=vistaElegida();$('vista-nombre').value=v?.nombre||'';
 if(!v){$('vista-estado').textContent='Podés guardar la selección actual con un nuevo nombre.';return;}
 const c=v.configuracion,faltantes=[];
 for(const id of ['depositos','marcas','listas']){
  const inputs=[...$(id).querySelectorAll('input')];
  for(const i of inputs)i.checked=c[id].includes(i.value);
  for(const valor of c[id])if(!inputs.some(i=>i.value===valor))faltantes.push(`${id}: ${valor}`);
 }
 $('tipo').value=c.tipo;$('separar').value=c.separar;$('buscar').value=c.buscar||'';
 if(faltantes.length){$('vista-estado').textContent='Esta vista tiene opciones que ya no están disponibles: '+faltantes.join(', ')+'. Revisá la selección antes de armar o actualizar la vista.';return;}
 $('vista-estado').textContent=`Vista «${v.nombre}» cargada. Usa el stock y los precios disponibles en la app.`;
 await generar();
};
async function guardarVista(actualizar){
 const anterior=vistaElegida();if(actualizar&&!anterior)return;
 const c=configuracion();
 $('guardar').disabled=$('vista-actualizar').disabled=$('vista-eliminar').disabled=true;
 try{
  const cuerpo={nombre:$('vista-nombre').value,configuracion:c,...(actualizar?{id:anterior.id,revision:anterior.revision}:{})};
  const v=await pedir('/api/stock/vistas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo)});
  vistas=[...vistas.filter(a=>a.id!==v.id),v];pintarVistas(v.id);$('vista-nombre').value=v.nombre;
  guardada=c;try{localStorage.setItem('versato-stock',JSON.stringify(c));}catch{}
  $('vista-estado').textContent=`Vista «${v.nombre}» ${actualizar?'actualizada':'guardada'} en la app.`;
 }catch(e){$('vista-estado').textContent=e.message;}finally{$('guardar').disabled=false;botonesVista();}
}
$('guardar').onclick=()=>guardarVista(false);
$('vista-actualizar').onclick=()=>guardarVista(true);
$('vista-eliminar').onclick=async()=>{
 const v=vistaElegida();if(!v||!window.confirm(`¿Eliminar la vista «${v.nombre}»? Se elimina solo la configuración guardada.`))return;
 $('vista-eliminar').disabled=true;
 try{await pedir('/api/stock/vistas/'+encodeURIComponent(v.id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:v.revision})});vistas=vistas.filter(a=>a.id!==v.id);pintarVistas();$('vista-nombre').value='';$('vista-estado').textContent='Vista eliminada. La selección actual se conserva.';}
 catch(e){$('vista-estado').textContent=e.message;}finally{botonesVista();}
};
const exportar=$('exportar');
exportar.textContent='Descargar grilla para vendedores';
exportar.onclick=async()=>{
 if(!parametrosExportar||exportar.disabled)return;
 const q=new URLSearchParams(parametrosExportar),inicio=Date.now();
 q.set('nombreVista',vistaElegida()?.nombre||$('vista-nombre').value.trim()||'Sin vista');
 exportando=true;exportar.disabled=true;
 const progreso=document.createElement('progress');progreso.setAttribute('aria-label','Preparando Excel con fotos');exportar.after(progreso);
 const avisar=()=>estado(`Preparando Excel con fotos y fórmulas… ${Math.floor((Date.now()-inicio)/1000)} s`);
 avisar();const timer=setInterval(avisar,1000);
 try{
  const r=await fetch('/api/stock/excel?'+q);
  if(!r.ok){const d=await r.json();throw Error(d.error||'No se pudo generar la grilla.');}
  const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  const disposicion=r.headers.get('Content-Disposition')||'',codificado=/filename\*=UTF-8''([^;]+)/i.exec(disposicion),simple=/filename="([^"]+)"/i.exec(disposicion);
  let nombre=simple?.[1]||'Grilla Stock - Sin vista - Vendedores.'+(r.headers.get('Content-Type')?.includes('application/zip')?'zip':'xlsx');
  if(codificado){try{nombre=decodeURIComponent(codificado[1]);}catch{}}
  a.href=url;a.download=nombre;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  estado('Descarga preparada con la plantilla original. Si elegiste varias listas o depósitos separados, el ZIP contiene un Excel por combinación.');
 }catch(e){estado(e.message);}finally{clearInterval(timer);progreso.remove();exportando=false;exportar.disabled=!parametrosExportar||$('resultados').hidden;}
};
for(const id of ['depositos','marcas','listas','tipo','separar'])$(id).addEventListener('change',()=>{invalidar();clearTimeout(demora);demora=setTimeout(()=>generar(),300);});
$('buscar').addEventListener('input',()=>{invalidar();clearTimeout(demora);demora=setTimeout(()=>generar(),350);});
cargar().then(cargarVistas);
function cargarProgramacion(){
 const p=vistaElegida()?.programacion||{activa:false,destino:'',cron:'*/5 * * * *',soloCambios:true};
 $('programa-modo').value=p.modo||(p.destino?'recurrente':'semanal');$('programa-hora').value=p.hora||'08:00';for(const i of $('programa-dias').querySelectorAll('input'))i.checked=(p.dias||[1,2,3,4,5]).includes(Number(i.value));$('programa-fecha').value=p.ejecutarEn?new Date(Date.parse(p.ejecutarEn)-10800000).toISOString().slice(0,16):'';modoProgramacion();
 $('programa-activa').checked=p.activa;$('programa-destino').value=p.destino;$('programa-cron').value=p.cron;$('programa-cambios').checked=p.soloCambios;
 $('programa-guardar').disabled=$('programa-ejecutar').disabled=!vistaElegida();
}
$('vista').addEventListener('change',cargarProgramacion);
$('programa-guardar').onclick=async()=>{
 const v=vistaElegida();if(!v)return;$('programa-guardar').disabled=true;
 try{const r=await pedir('/api/stock/vistas/'+encodeURIComponent(v.id)+'/programacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:v.revision,programacion:{dias:seleccion('programa-dias').map(Number),hora:$('programa-hora').value,modo:$('programa-modo').value,ejecutarEn:$('programa-fecha').value,activa:$('programa-activa').checked,destino:$('programa-destino').value,cron:$('programa-cron').value,soloCambios:$('programa-cambios').checked}})});vistas=vistas.map(a=>a.id===r.id?r:a);cargarProgramacion();$('programa-mensaje').textContent='Programación guardada para «'+r.nombre+'».';await estadoProgramador();}
 catch(e){$('programa-mensaje').textContent=e.message;}finally{$('programa-guardar').disabled=!vistaElegida();}
};
$('programa-ejecutar').onclick=async()=>{const v=vistaElegida();if(!v)return;
 try{await pedir('/api/stock/vistas/'+encodeURIComponent(v.id)+'/ejecutar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:v.revision})});$('programa-mensaje').textContent='Ejecución en cola. Se usa la configuración guardada; el estado se actualiza automáticamente.';await estadoProgramador();}catch(e){$('programa-mensaje').textContent=e.message;}
};
async function estadoProgramador(){
 try{const d=await pedir('/api/stock/programador'),fecha=f=>f?new Date(f).toLocaleString('es-AR',{timeZone:d.zona}):'—';
 $('programa-ftp').textContent='Stock FTP: '+(d.ftp.estado||'Pendiente')+' · '+fecha(d.ftp.fecha)+(d.ftp.error?' · '+d.ftp.error:'');
 $('programa-tabla').replaceChildren();for(const v of d.vistas){const tr=document.createElement('tr');for(const t of [v.nombre,v.estado||(v.programacion?.activa?'Programada':'Desactivada'),fecha(v.publicada),fecha(v.proxima),v.error||v.archivo||'Sin publicaciones']){const td=document.createElement('td');td.textContent=t;tr.append(td);}$('programa-tabla').append(tr);}
 }catch(e){$('programa-ftp').textContent=e.message;}
}
cargarProgramacion();estadoProgramador();setInterval(()=>{if(!document.hidden)estadoProgramador();},10000);

function modoProgramacion(){const modo=$('programa-modo').value;$('programa-cron-campo').hidden=modo!=='recurrente';$('programa-fecha-campo').hidden=modo!=='unica';$('programa-hora-campo').hidden=$('programa-dias').hidden=modo!=='semanal';}
$('programa-modo').addEventListener('change',modoProgramacion);
