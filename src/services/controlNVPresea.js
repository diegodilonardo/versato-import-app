const path=require('node:path');
function parsearDetalleNV(texto){
 const filas=[];for(const [i,linea]of texto.split(/\r?\n/).entries()){if(!linea.trim())continue;const c=linea.split('|').map(v=>v.trim());
  if(c.length<24||!/^\d+\/\d{4}$/.test(c[2])||!/^\d+$/.test(c[3])||!/^\d+$/.test(c[4])||!/^\d+$/.test(c[6])||!c[7]||!/^\d+(?:\.\d+)?$/.test(c[9])||!/^\d+(?:\.\d+)?$/.test(c[10]))throw Object.assign(new Error('Detalle_NV.TXT tiene un formato inválido en fila '+(i+1)+'.'),{status:422});
  filas.push({fila:i+1,fecha:c[1],factura:c[2],numero:c[3],cliente:c[4],nombre:c[5],codigo:c[6],codAlfa:c[7],detalle:c[8],precio:Number(c[9]),cantidad:Number(c[10]),paresModulo:Number(c[23])});
 }return {registros:filas.length,filas};
}
function compararNV(resultado,maestro){
 const nv=resultado.notasVenta;if(!nv)throw Object.assign(new Error('Primero prepará y guardá las NV de clientes.'),{status:422});
 const factura=resultado.facturas?.length===1?resultado.facturas[0]:null;if(!factura)throw Object.assign(new Error('No se identificó una factura única.'),{status:422});
 const fecha=new Date().toISOString(),base={fecha,factura,revisionNV:nv.revision,maestro:{archivo:maestro.archivo,actualizado:maestro.actualizado,huella:maestro.huella},disponible:!!maestro.disponible};
 if(!maestro.disponible)return {...base,valida:false,filas:[],mensaje:'No se pudo actualizar Detalle_NV.TXT desde el FTP. No se confirmó la importación.'};
 const mapa=new Map(),clave=(cliente,alfa)=>JSON.stringify([cliente,alfa]);
 const grupo=(cliente,alfa)=>{const k=clave(cliente,alfa);if(!mapa.has(k))mapa.set(k,{cliente,codAlfa:alfa,esperadas:0,importadas:0,codigosEsperados:new Set(),codigosPresea:new Set(),numeros:new Set(),precios:new Set(),documentos:new Map(),nombre:'',lineas:0});return mapa.get(k);};
 for(const c of nv.clientes)if(c.cliente!=='131600')for(const f of c.filas){const g=grupo(c.cliente,f.COD_ALFA);g.esperadas+=Number(f.CANTIDAD);g.codigosEsperados.add(String(f.CODIGO));g.nombre=c.nombre||'';}
 const importadas=maestro.filas.filter(r=>r.factura===factura);for(const r of importadas){const g=grupo(r.cliente,r.codAlfa);g.importadas+=r.cantidad;g.codigosPresea.add(r.codigo);g.numeros.add(r.numero);g.precios.add(r.precio);g.nombre=g.nombre||r.nombre;g.lineas++;const claveDocumento=JSON.stringify([r.numero,r.fecha]);if(!g.documentos.has(claveDocumento))g.documentos.set(claveDocumento,{numero:r.numero,fecha:r.fecha,cantidad:0});g.documentos.get(claveDocumento).cantidad+=r.cantidad;}
 const filas=[...mapa.values()].map(g=>{const diferencias=[];if(!g.esperadas)diferencias.push('Producto no incluido en las NV guardadas');if(!g.importadas)diferencias.push('No encontrado en Presea');if(g.esperadas!==g.importadas)diferencias.push('Cantidad diferente');if(g.esperadas&&[...g.codigosPresea].some(c=>!g.codigosEsperados.has(c)))diferencias.push('Código interno diferente');if(g.importadas&&![...g.precios].every(n=>n>0))diferencias.push('Sin precio en Presea');return {...g,codigosEsperados:[...g.codigosEsperados],codigosPresea:[...g.codigosPresea],numeros:[...g.numeros],precios:[...g.precios],documentos:[...g.documentos.values()],estado:diferencias.length?'REVISAR':'IMPORTADO',diferencias};});
 const resumen={clientes:new Set(filas.map(r=>r.cliente)).size,notasVenta:new Set(importadas.map(r=>r.numero)).size,productos:filas.length,importados:filas.filter(r=>r.estado==='IMPORTADO').length,revisar:filas.filter(r=>r.estado==='REVISAR').length,cajasEsperadas:filas.reduce((s,r)=>s+r.esperadas,0),cajasPresea:filas.reduce((s,r)=>s+r.importadas,0)};
 return {...base,valida:!!filas.length&&!resumen.revisar,filas,resumen,correccionesOrigen:JSON.stringify(resultado.correccionesClientes||[])};
}
async function actualizarDetalleNV(){return require('./actualizarMaestro').actualizarMaestro({remoto:'/NOTAS_VENTA/VERSATO/Detalle_NV.TXT',destino:path.join(__dirname,'../../data/Detalle_NV.TXT'),maxBytes:10*1024*1024,parsear:parsearDetalleNV});}
module.exports={parsearDetalleNV,compararNV,actualizarDetalleNV};
