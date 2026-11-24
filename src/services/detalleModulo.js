function detalleModulo(r){
 return r.DMODC&&r.DCOLORC&&r.SIZE_RUN?`${r.DMODC} ${r.DCOLORC} - SZ: ${r.SIZE_RUN}`:null;
}
function actualizarDetallesPropuestos(resultado){
 const detalles=new Map();
 for(const r of resultado.productos?.modulos?.filas||[]){r.DETALLE=detalleModulo(r);if(r.COD_ALFA)detalles.set(r.COD_ALFA,r.DETALLE);}
 for(const tipo of ['pedidos','masterData'])for(const r of resultado.comex?.[tipo]?.filas||[])if(detalles.has(r.cod_alfa))r.descripcion=detalles.get(r.cod_alfa);
 return resultado;
}
module.exports={detalleModulo,actualizarDetallesPropuestos};
