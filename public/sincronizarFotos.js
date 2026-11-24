(()=>{
 const el=id=>document.getElementById(id),form=el('foto-ubicacion-form');
 let ubicaciones=[],editando=null,ocupado=false,disponible=false,sondeo,reloj,inicio=0,ultimo=null,fallos=0;
 const numero=n=>Number(n||0).toLocaleString('es-AR');
 async function pedir(url,opciones){const r=await fetch(url,{cache:'no-store',...opciones}),d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'No se pudo completar la operación.'),{status:r.status});return d;}
 function botones(){el('foto-sincronizar').disabled=ocupado||!disponible||!ubicaciones.some(u=>u.activa);el('foto-ubicacion-guardar').disabled=ocupado||!disponible;for(const b of el('foto-ubicaciones-filas').querySelectorAll('button'))b.disabled=ocupado;}
 function cancelar(){editando=null;form.reset();el('foto-ubicacion-activa').checked=true;el('foto-ubicacion-prioridad').value=100;el('foto-ubicacion-guardar').textContent='Agregar ubicación';el('foto-ubicacion-cancelar').hidden=true;}
 function editar(u){editando=u;el('foto-ubicacion-nombre').value=u.nombre;el('foto-ubicacion-ruta').value=u.ruta;el('foto-ubicacion-prioridad').value=u.prioridad;el('foto-ubicacion-sub').checked=u.subcarpetas;el('foto-ubicacion-activa').checked=u.activa;el('foto-ubicacion-guardar').textContent='Guardar cambios';el('foto-ubicacion-cancelar').hidden=false;el('foto-ubicacion-nombre').focus();}
 function tabla(){
  const body=el('foto-ubicaciones-filas');body.replaceChildren();
  for(const u of ubicaciones){const tr=document.createElement('tr');
   for(const texto of [u.nombre,u.ruta+(u.subcarpetas?' · Incluye subcarpetas':''),u.prioridad,u.ultimaSincronizacion?new Date(u.ultimaSincronizacion).toLocaleString('es-AR'):'Sin sincronizar',u.activa?'Activa':'Inactiva']){const td=document.createElement('td');td.textContent=texto;tr.append(td);}
   const td=document.createElement('td'),acciones=document.createElement('div'),b=document.createElement('button'),quitar=document.createElement('button');acciones.className='photo-source-actions';b.type='button';b.textContent='Editar';b.className='secondary';b.onclick=()=>editar(u);quitar.type='button';quitar.textContent='Eliminar';quitar.className='secondary photo-source-delete';quitar.onclick=()=>confirmarEliminar(u,td);acciones.append(b,quitar);td.append(acciones);tr.append(td);body.append(tr);
  }botones();
 }
 function confirmarEliminar(u,td){
  if(ocupado)return;
  const aviso=document.createElement('p'),confirmar=document.createElement('button'),cancelar=document.createElement('button'),acciones=document.createElement('div');
  aviso.textContent=`¿Eliminar «${u.nombre}»? Las fotos copiadas y los archivos originales se conservan.`;aviso.className='photo-source-confirm';
  confirmar.type=cancelar.type='button';confirmar.textContent='Confirmar eliminación';confirmar.className='secondary photo-source-delete';cancelar.textContent='Cancelar';cancelar.className='secondary';cancelar.onclick=tabla;confirmar.onclick=()=>eliminar(u);acciones.className='photo-source-actions';acciones.append(confirmar,cancelar);td.replaceChildren(aviso,acciones);confirmar.focus();
 }
 async function eliminar(u){
  if(ocupado)return;
  ocupado=true;botones();
  el('foto-ubicaciones-estado').textContent='Eliminando ubicación…';
  try{await pedir('/api/fotos/ubicaciones/'+encodeURIComponent(u.id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:u.revision})});if(editando?.id===u.id)cancelar();ubicaciones=ubicaciones.filter(a=>a.id!==u.id);tabla();el('foto-ubicaciones-estado').textContent=`Ubicación eliminada. ${ubicaciones.length} ubicaciones configuradas. Las fotos ya copiadas se conservan.`;}
  catch(e){if(e.status===409)await cargar(false);el('foto-ubicaciones-estado').textContent=e.message;}finally{ocupado=false;botones();}
 }
 function pintarTrabajo(j){
  ultimo=j;inicio=new Date(j.inicio).getTime();ocupado=j.estado==='EN_CURSO';
  const p=el('foto-sync-progreso');p.hidden=false;
  if(ocupado&&j.etapa==='Revisando ubicaciones')p.removeAttribute('value');
  else{p.max=Math.max(1,j.totalCandidatos||j.total);p.value=ocupado?j.procesadas:p.max;}
  const segundos=Math.max(0,Math.floor(((ocupado?Date.now():new Date(j.fin||Date.now()).getTime())-inicio)/1000));
  el('foto-sync-estado').textContent=`${j.etapa}${ocupado&&j.ubicacion?' · '+j.ubicacion:''} · ${segundos} s`;
  el('foto-sync-resumen').textContent=`${numero(j.total)} archivos encontrados · ${numero(j.nuevas)} nuevas · ${numero(j.actualizadas)} actualizadas · ${numero(j.iguales)} sin cambios · ${numero(j.sinAsociar)} sin asociar · ${numero(j.conflictos)} conflictos · ${numero(j.errores)} errores`;
  const ul=el('foto-sync-errores');ul.replaceChildren();for(const texto of j.detalle||[]){const li=document.createElement('li');li.textContent=texto;ul.append(li);}el('foto-sync-detalles').hidden=!ul.childElementCount;
  botones();
 }
 function detener(){clearTimeout(sondeo);clearInterval(reloj);}
 async function consultarTrabajo(id){
  try{const j=await pedir('/api/fotos/sincronizacion/'+encodeURIComponent(id));fallos=0;pintarTrabajo(j);
   if(j.estado==='EN_CURSO')sondeo=setTimeout(()=>consultarTrabajo(id),1500);
   else{detener();window.dispatchEvent(new Event('fotos-sincronizadas'));await cargar(false);}
  }catch(e){fallos++;if(fallos<3)sondeo=setTimeout(()=>consultarTrabajo(id),2000);else{detener();ocupado=false;botones();el('foto-sync-estado').textContent=e.message+' Usá Actualizar listado para consultar el estado.';}}
 }
 function seguir(j){detener();pintarTrabajo(j);fallos=0;if(j.estado==='EN_CURSO'){reloj=setInterval(()=>{if(ultimo)pintarTrabajo(ultimo);},1000);sondeo=setTimeout(()=>consultarTrabajo(j.id),1000);}}
 async function cargar(retomar=true){
  try{const d=await pedir('/api/fotos/ubicaciones');disponible=d.disponible;ubicaciones=d.ubicaciones||[];tabla();
   el('foto-ubicaciones-estado').textContent=d.disponible?`${ubicaciones.length} ubicaciones configuradas.`:d.mensaje;
   if(d.repositorio)el('foto-repositorio').textContent='Repositorio local: '+d.repositorio+'. Desactivar o eliminar una ubicación conserva las fotos ya copiadas.';
   if(retomar){
    const previo=d.trabajo||[...ubicaciones].filter(u=>u.resumen).sort((a,b)=>new Date(b.ultimaSincronizacion)-new Date(a.ultimaSincronizacion))[0]?.resumen;
    if(previo)seguir(previo);
   }
  }catch(e){el('foto-ubicaciones-estado').textContent=e.message;}
 }
 form.onsubmit=async e=>{e.preventDefault();if(ocupado)return;
  el('foto-ubicacion-guardar').disabled=true;
  const b={nombre:el('foto-ubicacion-nombre').value,ruta:el('foto-ubicacion-ruta').value,prioridad:Number(el('foto-ubicacion-prioridad').value),subcarpetas:el('foto-ubicacion-sub').checked,activa:el('foto-ubicacion-activa').checked,...(editando?{id:editando.id,revision:editando.revision}:{})};
  try{await pedir('/api/fotos/ubicaciones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});cancelar();await cargar();el('foto-ubicaciones-estado').textContent='Ubicación guardada. Podés sincronizar las imágenes.';}
  catch(e){el('foto-ubicaciones-estado').textContent=e.message;}finally{botones();}
 };
 el('foto-ubicacion-cancelar').onclick=cancelar;el('foto-ubicaciones-recargar').onclick=()=>cargar();
 el('foto-sincronizar').onclick=async()=>{if(ocupado)return;ocupado=true;botones();el('foto-sync-estado').textContent='Preparando sincronización…';try{seguir(await pedir('/api/fotos/sincronizar',{method:'POST'}));}catch(e){ocupado=false;botones();el('foto-sync-estado').textContent=e.message;}};
 window.addEventListener('pagehide',detener);cargar();
})();
