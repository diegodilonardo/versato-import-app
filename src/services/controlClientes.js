const texto=v=>String(v??'').trim();
function controlarClientes(previews,maestro){
 const grupos=new Map();let filasInvalidas=0;
 for(const [tipo,campo]of [['PACKING_LIST','SHOP'],['CODIGOS_BARRA','LOJAS']]){
  for(const r of previews?.[tipo]?.registros||[]){
   if(r.errores?.length){filasInvalidas++;continue;}
   const codigo=texto(r.datos[campo]);
   if(!grupos.has(codigo))grupos.set(codigo,{codigo,cajasPacking:0,paresPacking:0,cajasCodigos:0,paresCodigos:0,fuentes:[]});
   const g=grupos.get(codigo),packing=tipo==='PACKING_LIST';
   if(!g.fuentes.includes(tipo))g.fuentes.push(tipo);
   const cajas=packing?Number(r.datos.BOXES):1,pares=Number(r.datos[packing?'PAIRS':'PARES']);
   if(Number.isFinite(cajas))g[packing?'cajasPacking':'cajasCodigos']+=cajas;
   if(Number.isFinite(pares))g[packing?'paresPacking':'paresCodigos']+=pares;
  }
 }
 const filas=[...grupos.values()].map(g=>{
  const ambiguo=maestro?.ambiguos?.includes(g.codigo);
  const nombre=maestro?.disponible&&!ambiguo?(maestro.indice?.get(g.codigo)||(g.codigo==='131600'?'ADMINISTRACIÓN':null)):null;
  const estado=!g.codigo?'SIN_CODIGO':!maestro?.disponible?'PENDIENTE_MAESTRO':ambiguo?'AMBIGUO':nombre?'ENCONTRADO':'NO_ENCONTRADO';
  return {...g,nombre,estado,origenNombre:nombre?(maestro.indice?.has(g.codigo)?'MAESTRO':'ADMINISTRACIÓN CONFIGURADA'):null};
 }).sort((a,b)=>a.codigo.localeCompare(b.codigo,'es',{numeric:true}));
 return {filas,resumen:{total:filas.length,encontrados:filas.filter(r=>r.estado==='ENCONTRADO').length,revisar:filas.filter(r=>r.estado!=='ENCONTRADO'&&r.estado!=='PENDIENTE_MAESTRO').length,pendientes:filas.filter(r=>r.estado==='PENDIENTE_MAESTRO').length,filasInvalidas},maestro:{disponible:!!maestro?.disponible,archivo:maestro?.archivo,actualizado:maestro?.actualizado,huella:maestro?.huella},preparado:new Date().toISOString()};
}
module.exports={controlarClientes};
