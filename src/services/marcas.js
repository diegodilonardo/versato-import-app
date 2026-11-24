const path=require('node:path');
const {actualizarMaestro}=require('./actualizarMaestro');
const {FIJOS_MODULO}=require('../config/reglasPresea');
const clave=s=>String(s||'').trim().toUpperCase();
const RUBROS={CALZADO:1,ACCESORIOS:3};
function parsearMarcas(texto){
 const indice=new Map();let registros=0;
 for(const l of texto.replace(/^\uFEFF/,'').split(/\r?\n/)){
  if(!l.trim())continue;const a=l.split('|').map(s=>s.trim());
  if(a.length!==3||!/^\d+$/.test(a[0])||!a[1]||!a[2])throw new Error('Maestro de marcas: fila inválida.');
  const registro={codigo:a[0],nombre:a[1],descripcion:a[2]},k=clave(a[1]);
  if(indice.has(k)&&JSON.stringify(indice.get(k))!==JSON.stringify(registro))throw new Error('Marca duplicada con distintos datos.');
  indice.set(k,registro);registros++;
 }
 return{indice,registros};
}
function actualizarMarcas(){return actualizarMaestro({remoto:process.env.MAESTRO_MARCAS_FTP_PATH||'/PRODUCTOS/MAESTROS_VERSATO/Maestro_Marcas_Versato.TXT',destino:path.join(__dirname,'../../data/Maestro_Marcas_Versato.TXT'),parsear:parsearMarcas});}
function completarDatosModulos(productos,previews,marcas){
 if(!productos.modulos)return productos;
 const porGrade=new Map();
 for(const r of previews.PACKING_LIST.registros){
  if(r.errores.length)continue;const d=r.datos,k=JSON.stringify([`${d.STYLE}.${d.MATERIAL_CODE}.${d.COLOR_CODE}`,d.SIZE_RUN]);
  if(!porGrade.has(k))porGrade.set(k,[]);porGrade.get(k).push(r);
 }
 for(const r of productos.modulos.filas){
  Object.assign(r,FIJOS_MODULO);
  const errores=[];const marca=marcas?.disponible?marcas.indice.get(clave(r.DMARCA)):null;
  r.MARCA=marca?Number(marca.codigo):null;if(marca)r.DMARCA=marca.descripcion;
  if(!marca)errores.push('Marca sin coincidencia única en el maestro de marcas actualizado.');
  r.COLORC='00';r.TALLC='00';
  const origen=porGrade.get(JSON.stringify([r.PRODUCTO,r.SIZE_RUN]))||[];
  const colores=[...new Set(origen.map(o=>o.datos.DESCRIPCION_COLOR).filter(Boolean))];
  r.DCOLORC=colores.length===1?colores[0]:null;
  if(!r.DCOLORC)errores.push('Falta descripción de color o hay valores diferentes en el Packing List.');
  r.DETALLE=require('./detalleModulo').detalleModulo(r);
  if(!r.DETALLE)errores.push('No se pudo armar el detalle: falta DMODC, descripción del color o SIZE_RUN.');
  const variantes=new Map();
  for(const o of origen){const talles=o.datos.TALLE.split(/\s+/).filter(Boolean),cantidades=o.datos.CANTIDAD.split(/\s+/).filter(Boolean);
   if(!talles.length||talles.length!==cantidades.length||cantidades.some(n=>!/^\d+$/.test(n))){errores.push('Distribución de talles inválida.');continue;}
   const detalle=talles.map((t,i)=>`${t}:${Number(cantidades[i])}`).join(' ');
   variantes.set(detalle,cantidades.reduce((s,n)=>s+Number(n),0));
  }
  r.DTALLC=variantes.size===1?[...variantes.keys()][0]:null;r.PARES=variantes.size===1?[...variantes.values()][0]:null;
  if(!r.DTALLC)errores.push('Falta distribución de talles o existen distintas distribuciones para la misma grade.');
  r.NOMB_ART=r.DMODC&&r.DCOLORC&&r.DTALLC?`${r.DMODC} | ${r.DCOLORC} | ${r.DTALLC}`:null;
  if(!r.NOMB_ART)errores.push('No se pudo armar NOMB_ART: falta modelo, color o distribución de talles.');
  r.erroresDatos=errores;if(errores.length)r.estado='REVISAR_DATOS_MODULO';
 }
 productos.modulos.maestroMarcas={disponible:!!marcas?.disponible,actualizado:marcas?.actualizado||null,huella:marcas?.huella||null};
 productos.modulos.resumen.pendientes=productos.modulos.filas.filter(r=>!r.MODC||!r.COD_ALFA||r.errorCodAlfa||r.erroresDatos?.length).length;
 productos.modulos.nota+=' Marca desde FTP. COLORC y TALLC = 00; DCOLORC del Packing; DTALLC = talle:cantidad separado por espacios, por módulo, sin multiplicar por cajas. MOLEKINHA y MOLEKINHO: tipo 4 MOD.KID. NAME con palabra BOLSA: RUBROS 3 ACCESORIOS; el resto del lote usa 1 CALZADO.';
 return productos;
}
module.exports={RUBROS,parsearMarcas,actualizarMarcas,completarDatosModulos};
