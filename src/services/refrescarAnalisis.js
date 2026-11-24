const {cruzarArchivos}=require('./cruzarArchivos');
function recalcularAnalisis(anterior,files,{maestro,modelos,marcas,rubrosFact}){
 const nuevo=cruzarArchivos(files,maestro,modelos,marcas,rubrosFact);
 const previas=new Map((anterior.productos?.modulos?.filas||[]).map(r=>[r.COD_ALFAB1,r]));
 for(const r of nuevo.productos.modulos.filas){
  const previa=previas.get(r.COD_ALFAB1);
  if(previa?.reservaId)for(const campo of ['FECHA_ALTA','ANIO_COD_ALFA'])r[campo]=previa[campo];
 }
 const salida={...anterior,...nuevo};
 Object.defineProperty(salida,'datosPersistencia',{value:nuevo.datosPersistencia});
 return salida;
}
module.exports={recalcularAnalisis};
