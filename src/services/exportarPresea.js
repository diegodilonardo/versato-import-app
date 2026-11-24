const XLSX=require('xlsx');
const COLUMNAS=['CODIGO','DETALLE','RUBRO','NIVEL','FECHA_ALTA','COD_ALFA','COD_ALFABA','COD_ALFAB1','RUBRO_FACT','MARCA','COD_SUBG','COD_TEM','COD_GRUPOC','SEXO','CLASIFIC','COLORC','DCLASIFIC','DCOLORC','DET_LINEA','DET_ORIGEN','DGRUPO','DMARCA','DMODC','DSUBG','DTALLC','LINEA','MODC','ORIG_PRO','RUBROS','TALLC','DCOD_TEM','PARES','COD_ANO','PAIS','NOMB_ART'];
function prepararPresea(resultado){
 const p=resultado.productos,m=p?.modulos;let mensaje=null;
 if(!p?.maestro?.disponible)mensaje='Debe completarse el control del maestro.';
 else if(!m?.maestro?.disponible||!m?.maestroMarcas?.disponible||!m?.maestroRubrosFact?.disponible)mensaje='Falta actualizar alguno de los maestros requeridos.';
 else if(resultado.estado==='PARCIAL'||resultado.resumen?.revisar>0)mensaje='Resolvé las diferencias o filas excluidas del cruce antes de generar módulos para Presea.';
 else if(resultado.controlFactura&&(resultado.controlFactura.resumen.revisar||resultado.controlFactura.resumen.filasInvalidas||resultado.controlFactura.numeroCoincide===false||resultado.controlFactura.totales.importeCoincide===false||resultado.controlFactura.totales.paresCoinciden===false))mensaje='Resolvé los errores del control de Factura antes de exportar.';
 const pendientes=new Set((p?.asignaciones||[]).filter(a=>a.coincidencia==='NO_ENCONTRADO').map(a=>a.claveBuscada));
 const conteos=new Map(),claves=new Map();for(const r of m?.filas||[]){if(r.COD_ALFA)conteos.set(r.COD_ALFA,(conteos.get(r.COD_ALFA)||0)+1);claves.set(r.COD_ALFAB1,(claves.get(r.COD_ALFAB1)||0)+1);}
 const filas=[],excluidas=[];
 for(const r of m?.filas||[]){
  const motivos=[...(r.erroresDatos||[])];
  if(!pendientes.has(r.COD_ALFAB1))motivos.push('La clave no está confirmada como no encontrada.');
  if(claves.get(r.COD_ALFAB1)!==1)motivos.push('Código Versato duplicada.');
  if(r.errorCodAlfa)motivos.push(r.errorCodAlfa);
  if(!/^[A-Z0-9]{15}$/.test(r.COD_ALFA||'')||conteos.get(r.COD_ALFA)!==1)motivos.push('COD_ALFA debe ser único y tener 15 caracteres alfanuméricos.');
  if(r.CLASIFIC==='7')motivos.push('MOD.HOM está reservado para otra etapa.');
  const registro={...r,DETALLE:require('./detalleModulo').detalleModulo(r),CODIGO:null,COD_ALFABA:'7792800015157',PARES:r.PARES==null?null:String(r.PARES),COD_ANO:r.AA};
  for(const c of COLUMNAS)if(c!=='CODIGO'&&(registro[c]==null||registro[c]===''))motivos.push(`Falta ${c}.`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.FECHA_ALTA||'')||!Number.isFinite(Date.parse(r.FECHA_ALTA)))motivos.push('Fecha de alta inválida.');
  if(r.NIVEL!==950)motivos.push('Solo módulos de nivel 950.');
  // La identidad ya se valida contra las asignaciones NO_ENCONTRADO del código real del archivo.
  if(motivos.length)excluidas.push({clave:r.COD_ALFAB1,motivos:[...new Set(motivos)]});else filas.push(registro);
 }
 return{filas,excluidas,bloqueada:!!mensaje,mensaje,listos:mensaje?0:filas.length,totalPropuestos:m?.filas.length||0};
}
function exportarPresea(resultado){
 const p=prepararPresea(resultado);if(p.bloqueada||!p.filas.length)throw Object.assign(new Error(p.mensaje||'No hay módulos válidos pendientes para exportar a Presea.'),{status:422});
 const ws=XLSX.utils.aoa_to_sheet([COLUMNAS,...p.filas.map(r=>COLUMNAS.map(c=>c==='FECHA_ALTA'?{t:'n',v:Date.parse(r.FECHA_ALTA+'T00:00:00Z')/86400000+25569,z:'dd/mm/yyyy'}:r[c]))]);
 ws['!cols']=COLUMNAS.map(c=>({wch:['DETALLE','DTALLC','NOMB_ART'].includes(c)?65:c==='COD_ALFAB1'?40:20}));ws['!autofilter']={ref:ws['!ref']};
 const libro=XLSX.utils.book_new();XLSX.utils.book_append_sheet(libro,ws,'Hoja1');return XLSX.write(libro,{type:'buffer',bookType:'xlsx',compression:true});
}
module.exports={COLUMNAS,prepararPresea,exportarPresea};
