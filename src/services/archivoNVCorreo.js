const XLSX=require('xlsx');
const TIPO='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLUMNAS=['NUMERO_NV','FECHA_NV','COD_ALFA','DETALLE','CODIGO_CLIENTE','DETALLE_CLIENTE','DETALLE_MARCA','DETALLE_MODELO','CODIGO_COLOR','DETALLE_COLOR','SIZE_RUN','DETALLE_CURVA','CANTIDAD_MODULOS','TOTAL_PARES'];
function prepararExcelNV(resultado,cliente){
 const nv=resultado.notasVenta,filas=[],errores=[];if(!nv?.clientes?.length)return null;
 if(nv.correccionesOrigen!==JSON.stringify(resultado.correccionesClientes||[]))errores.push('Actualizá las NV después de las correcciones de clientes.');
 const catalogo=resultado.comex?.masterData?.filas||[],control=resultado.controlNVPresea;const controlVigente=control?.disponible&&control.revisionNV===nv.revision&&control.correccionesOrigen===JSON.stringify(resultado.correccionesClientes||[]);
 if(cliente!==undefined&&!nv.clientes.some(c=>c.cliente===cliente&&cliente!=='131600'))throw Object.assign(new Error('El cliente no tiene una NV guardada.'),{status:404});
 for(const c of nv.clientes){if(c.cliente==='131600'||(cliente!==undefined&&c.cliente!==cliente))continue;if(c.bloqueada)errores.push('La NV del cliente '+c.cliente+' está pendiente de revisión.');
  for(const f of c.filas){const candidatos=catalogo.filter(r=>r.cod_alfa===f.COD_ALFA&&String(r.codigo_interno)===String(f.CODIGO));const unicos=[...new Map(candidatos.map(r=>[JSON.stringify(r),r])).values()];const m=unicos.length===1?unicos[0]:null;
   if(!m){errores.push('Falta el detalle único del módulo '+f.COD_ALFA+' del cliente '+c.cliente+'. Actualizá COMEX desde maestros.');continue;}
   const colores=[...new Set((resultado.productos?.asignaciones||[]).filter(a=>a.COD_ALFA===f.COD_ALFA&&String(a.CODIGO)===String(f.CODIGO)).map(a=>String(a.PRODUCTO||'').split('.').at(-1)).filter(Boolean))];
   const codigoColor=f.CODIGO_COLOR||(colores.length===1?colores[0]:'');
   const fila={COD_ALFA:String(f.COD_ALFA),DETALLE:m.descripcion,CODIGO_CLIENTE:String(c.cliente),DETALLE_CLIENTE:c.nombre,DETALLE_MARCA:f.MARCA,DETALLE_MODELO:m.cod_mod,CODIGO_COLOR:String(codigoColor),DETALLE_COLOR:m.color,SIZE_RUN:String(m.codigo_curva??''),DETALLE_CURVA:m.composicion_curva||m.curva,CANTIDAD_MODULOS:Number(f.CANTIDAD)};
   if(COLUMNAS.slice(2,-2).some(k=>!String(fila[k]??'').trim())||!Number.isSafeInteger(fila.CANTIDAD_MODULOS)||fila.CANTIDAD_MODULOS<=0)errores.push('Faltan datos o hay una cantidad inválida para '+f.COD_ALFA+' del cliente '+c.cliente+'.');const pares=Number(m.modulo);if(!Number.isSafeInteger(pares)||pares<=0)errores.push('Faltan pares por módulo válidos en el maestro para '+f.COD_ALFA+'.');
   const importacion=controlVigente?control.filas.find(r=>r.cliente===c.cliente&&r.codAlfa===f.COD_ALFA):null;
   if(importacion?.numeros?.length&&!importacion.documentos?.length)errores.push('Actualizá Verificar NV importadas en Presea para recuperar sus fechas y números.');
   const documentos=importacion?.documentos?.length?importacion.documentos:[{numero:'',fecha:'',cantidad:fila.CANTIDAD_MODULOS}];
   if(documentos.reduce((s,d)=>s+Number(d.cantidad),0)!==fila.CANTIDAD_MODULOS)errores.push('La cantidad importada difiere de la NV guardada para '+f.COD_ALFA+' del cliente '+c.cliente+'.');
   for(const d of documentos)filas.push({...fila,NUMERO_NV:String(d.numero),FECHA_NV:d.fecha,CANTIDAD_MODULOS:Number(d.cantidad),TOTAL_PARES:Number(d.cantidad)*pares});
  }
 }
 filas.sort((a,b)=>a.CODIGO_CLIENTE.localeCompare(b.CODIGO_CLIENTE,'es',{numeric:true})||a.COD_ALFA.localeCompare(b.COD_ALFA));
 return {nombre:'Detalle NV - '+String(resultado.facturas?.[0]||'factura').replace(/[^A-Za-z0-9-]/g,'-')+(cliente!==undefined?' - Cliente '+cliente:'')+'.xlsx',columnas:COLUMNAS,filas,errores:[...new Set(errores)],bloqueada:!!errores.length||!filas.length,totalModulos:filas.reduce((s,r)=>s+r.CANTIDAD_MODULOS,0),totalPares:filas.reduce((s,r)=>s+r.TOTAL_PARES,0)};
}
function exportarExcelNV(archivo){
 if(!archivo||archivo.bloqueada)throw Object.assign(new Error(archivo?.errores.join(' ')||'Prepará las NV para generar su Excel.'),{status:422});
 const columnas=archivo.columnas||COLUMNAS,filas=[columnas,...archivo.filas.map(r=>columnas.map(c=>r[c]))],total=filas.length+2;filas.push([],['TOTAL GENERAL',...Array(11).fill(null),archivo.totalModulos,archivo.totalPares]);const ws=XLSX.utils.aoa_to_sheet(filas);
 for(const [col,v]of [['M',archivo.totalModulos],['N',archivo.totalPares]])ws[col+total]={t:'n',v,f:'SUM('+col+'2:'+col+(archivo.filas.length+1)+')',z:'#,##0'};
 ws['!cols']=[22,18,24,65,20,40,22,26,18,30,16,55,22,20,...(columnas.length>COLUMNAS.length?[90]:[])].map(wch=>({wch}));ws['!autofilter']={ref:'A1:'+(columnas.length>COLUMNAS.length?'O':'N')+(archivo.filas.length+1)};
 const libro=XLSX.utils.book_new();XLSX.utils.book_append_sheet(libro,ws,'NOTAS DE VENTA');return XLSX.write(libro,{type:'buffer',bookType:'xlsx',compression:true});
}
module.exports={TIPO,COLUMNAS,prepararExcelNV,exportarExcelNV};
