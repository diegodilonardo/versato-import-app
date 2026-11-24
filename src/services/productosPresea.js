const XLSX=require('xlsx');
const {escribirDBI}=require('./escribirDBI');
const esquemaProductos=require('../config/dbi/productos.json');
const {COLUMNAS,prepararPresea}=require('./exportarPresea');
const {prepararSueltos}=require('./sueltos');
function prepararProductosPresea(resultado){
 const modulos=prepararPresea(resultado),sueltos=prepararSueltos(resultado);
 const mensaje=modulos.mensaje||sueltos.mensaje;
 const excluidas=modulos.excluidas.map(r=>({tipo:'MODULO',clave:r.clave,motivos:r.motivos}));
 for(const r of resultado.productos.sueltos?.filas||[])if(['REVISAR','PENDIENTE_MAESTRO'].includes(r.estado))excluidas.push({tipo:'SUELTO',clave:r.EAN||r.PRODUCTO,motivos:r.errores});
 const modulosValidos=new Set(modulos.filas.map(r=>r.COD_ALFAB1));
 const propuestas=resultado.productos.modulos?.filas||[];
 const hijos=sueltos.filas.filter(r=>{const padres=propuestas.filter(m=>m.PRODUCTO===r.PRODUCTO&&m.MODC===r.MODC);if(padres.length&&!padres.some(m=>modulosValidos.has(m.COD_ALFAB1))){excluidas.push({tipo:'SUELTO',clave:r.EAN,motivos:['El módulo asociado no está listo para importar.']});return false;}return true;});
 const filas=[],pendientes=new Set(hijos);
 // Cada suelto se emite una vez, tras el primer módulo válido de su mismo producto y MODC.
 for(const modulo of modulos.filas){filas.push(modulo);for(const hijo of hijos)if(pendientes.has(hijo)&&hijo.PRODUCTO===modulo.PRODUCTO&&hijo.MODC===modulo.MODC){filas.push(hijo);pendientes.delete(hijo);}}
 // Los sueltos cuyo módulo ya existe también deben poder darse de alta.
 filas.push(...pendientes);
 const alfas=new Set();for(const r of filas){if(!r.COD_ALFA||alfas.has(r.COD_ALFA))return{filas:[],modulos:0,sueltos:0,total:0,bloqueada:true,mensaje:'Hay COD_ALFA duplicados entre módulos y sueltos. Revisá el análisis antes de importar.',excluidas};alfas.add(r.COD_ALFA);}
 return{filas,modulos:mensaje?0:modulos.filas.length,sueltos:mensaje?0:hijos.length,total:mensaje?0:filas.length,bloqueada:!!mensaje,mensaje,excluidas};
}
function exportarProductosPresea(resultado){const p=prepararProductosPresea(resultado);if(p.bloqueada||!p.total)throw Object.assign(new Error(p.mensaje||'No hay productos nuevos válidos para importar a Presea.'),{status:422});
 const ws=XLSX.utils.aoa_to_sheet([COLUMNAS,...p.filas.map(r=>COLUMNAS.map(c=>c==='FECHA_ALTA'?{t:'n',v:Date.parse(r.FECHA_ALTA+'T00:00:00Z')/86400000+25569,z:'dd/mm/yyyy'}:c==='CODIGO'?null:r[c]))]);
 ws['!cols']=COLUMNAS.map(c=>({wch:['DETALLE','NOMB_ART','DTALLC'].includes(c)?65:22}));ws['!autofilter']={ref:ws['!ref']};const libro=XLSX.utils.book_new();XLSX.utils.book_append_sheet(libro,ws,'Hoja1');return XLSX.write(libro,{type:'buffer',bookType:'xlsx',compression:true});}
function exportarProductosDBI(resultado){const p=prepararProductosPresea(resultado);if(p.bloqueada||!p.total)throw Object.assign(new Error(p.mensaje||'No hay productos nuevos válidos para importar a Presea.'),{status:422});
 const filas=p.filas.map(r=>({...r,CODIGO:null,FECHA_ALTA:r.FECHA_ALTA.split('-').reverse().join('/')}));return escribirDBI(esquemaProductos,filas);
}
module.exports={prepararProductosPresea,exportarProductosPresea,exportarProductosDBI};
