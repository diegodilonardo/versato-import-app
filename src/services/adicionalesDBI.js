const {prepararProductosPresea}=require('./productosPresea');
const {escribirDBI}=require('./escribirDBI');
const esquemas={modelos:require('../config/dbi/modelos.json'),stockadi:require('../config/dbi/stockadi.json')};
function prepararAdicionalesDBI(resultado){
 const productos=prepararProductosPresea(resultado),modelos=[],stockadi=[],erroresModelos=[],erroresStock=[],nros=new Set(),alfas=new Set();
 const porProducto=new Map((resultado.productos.listado||[]).map(p=>[p.PRODUCTO,p]));
 for(const r of productos.filas){
  const p=porProducto.get(r.PRODUCTO),nombres=[...new Set(p?.descripciones||[])],materiales=[...new Set(p?.materiales||[])];const nombre=nombres.length===1?nombres[0]:null,material=materiales.length===1?materiales[0]:null;
  if(r.NIVEL===950){
   const modelo={NRO:r.MODC,DESCR:r.DMODC,LINEA:nombre,ABREVIADO:String(r.MODC||'').slice(0,1),SIZE_RUN:String(r.SIZE_RUN??'').trim()};const errores=[];
   if(!modelo.SIZE_RUN)errores.push('Falta SIZE_RUN del modelo.');
   if(!modelo.NRO||!modelo.DESCR||!nombre)errores.push('Falta MODC, DMODC o un NAME único del archivo.');
   if(nros.has(modelo.NRO))errores.push('MODC repetido entre los modelos propuestos.');
   if(!errores.length)try{escribirDBI(esquemas.modelos,[modelo]);}catch(e){errores.push(e.message);}
   if(errores.length)erroresModelos.push({clave:r.COD_ALFAB1,motivos:errores});else{nros.add(modelo.NRO);modelos.push(modelo);}
  }
  const stock={CODIGO:null,BR_CODCOLO:p?.COLOR,BR_CODMATE:p?.MATERIAL,BR_COLOR:r.DCOLORC,BR_MATERIA:material,BR_STYLE:p?.STYLE,BR_NAME:nombre,BR_SIZERUN:r.NIVEL===950?r.SIZE_RUN:'',DET_CURVA:r.NIVEL===950?r.DTALLC:r.TALLC,COD_ALFA:r.COD_ALFA};const errores=[];
  for(const c of ['BR_CODCOLO','BR_CODMATE','BR_COLOR','BR_MATERIA','BR_STYLE','BR_NAME','DET_CURVA','COD_ALFA'])if(stock[c]==null||stock[c]==='')errores.push(`Falta ${c} o hay descripciones diferentes para el producto.`);
  if(r.NIVEL===950&&!stock.BR_SIZERUN)errores.push('Falta BR_SIZERUN del módulo.');
  if(alfas.has(stock.COD_ALFA))errores.push('COD_ALFA duplicado en STOCKADI.');
  if(!errores.length)try{escribirDBI(esquemas.stockadi,[stock]);}catch(e){errores.push(e.message);}
  if(errores.length)erroresStock.push({clave:r.COD_ALFA,motivos:errores});else{alfas.add(stock.COD_ALFA);stockadi.push(stock);}
 }
 const salida=(filas,excluidas)=>({filas,excluidas,bloqueada:productos.bloqueada,mensaje:productos.mensaje,total:productos.bloqueada?0:filas.length});
 return{modelos:salida(modelos,erroresModelos),stockadi:salida(stockadi,erroresStock)};
}
function exportarAdicionalDBI(resultado,tipo){if(!esquemas[tipo])throw Object.assign(new Error('Tipo DBI no válido.'),{status:400});const p=prepararAdicionalesDBI(resultado)[tipo];if(p.bloqueada||!p.total)throw Object.assign(new Error(p.mensaje||'No hay registros válidos para este archivo DBI.'),{status:422});return escribirDBI(esquemas[tipo],p.filas);}
module.exports={prepararAdicionalesDBI,exportarAdicionalDBI};
