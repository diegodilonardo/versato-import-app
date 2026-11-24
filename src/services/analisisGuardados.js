const {randomUUID}=require('node:crypto');
function crearAlmacen({ttl=60*60*1000,max=5,reloj=Date.now}={}){
  const resultados=new Map();
  const limpiar=()=>{for(const [id,r]of resultados)if(r.vence<=reloj())resultados.delete(id);};
  setInterval(limpiar,Math.min(ttl,60000)).unref();
  return {
    guardar(resultado){limpiar();while(resultados.size>=max)resultados.delete(resultados.keys().next().value);const id=randomUUID();const vence=reloj()+ttl;resultados.set(id,{resultado,vence});return {id,vence:new Date(vence).toISOString()};},
    obtener(id){limpiar();return resultados.get(id)?.resultado || null;}
  };
}
module.exports={crearAlmacen};
