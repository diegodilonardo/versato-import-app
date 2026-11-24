const {exportarNV}=require('./nvClientes');
const DESTINO_NV='/NOTAS_VENTA/VERSATO';
function numerosImportados(resultado,cliente){const c=resultado.controlNVPresea;if(!c?.disponible||c.revisionNV!==resultado.notasVenta?.revision||c.correccionesOrigen!==JSON.stringify(resultado.correccionesClientes||[]))return [];return [...new Set(c.filas.filter(r=>r.cliente===cliente&&r.importadas>0).flatMap(r=>r.numeros||[]))];}
function loteNV(resultado,cliente){
 const nv=resultado.notasVenta;if(!nv)throw Object.assign(new Error('Primero prepará y guardá las NV.'),{status:422});
 if(nv.correccionesOrigen!==JSON.stringify(resultado.correccionesClientes||[]))throw Object.assign(new Error('Cambió la asignación de clientes. Actualizá las NV antes de enviarlas.'),{status:409});
 const seleccion=cliente?nv.clientes.filter(c=>c.cliente===cliente):nv.clientes;
 if(cliente&&(!/^\d+$/.test(cliente)||cliente==='131600'||!seleccion.length))throw Object.assign(new Error('Cliente de NV no válido.'),{status:404});
 const excluidos=[],archivos=[];
 for(const c of seleccion){if(c.cliente==='131600')continue;const numeros=numerosImportados(resultado,c.cliente);if(numeros.length){if(cliente)throw Object.assign(new Error('La NV ya existe en Presea ('+numeros.join(', ')+'). No se permite reenviarla por FTP. Podés descargar el archivo localmente.'),{status:409});excluidos.push({cliente:c.cliente,motivos:['Ya existe en Presea'],numerosPresea:numeros});continue;}if(!/^\d+$/.test(c.cliente))throw Object.assign(new Error('Código de cliente no válido.'),{status:422});if(c.bloqueada||!c.filas.length){excluidos.push({cliente:c.cliente,motivos:c.errores||['Sin productos']});continue;}archivos.push({nombre:'nv_cliente_'+c.cliente+'.dbi',buffer:exportarNV(nv,c.cliente)});}
 if(!archivos.length)throw Object.assign(new Error('No hay NV listas para enviar. Las existentes en Presea se excluyen; revisá los productos y domicilios pendientes.'),{status:422});
 return {archivos,excluidos,revision:nv.revision};
}
function loteNVConPrecios(resultado,cliente){const nv=loteNV(resultado,cliente),{lotePrecios,loteCambiosPrecios,DESTINO_PRECIOS}=require('./preciosNVFTP'),precios=resultado.preciosNV?.comprobacionMaestro?.criterio==='PRECIOS_FACTURA'?loteCambiosPrecios(resultado):lotePrecios(resultado);const alfas=new Set(resultado.preciosNV.productos.map(p=>JSON.stringify([String(p.codigo),p.cod_alfa])));for(const c of resultado.notasVenta.clientes)if(nv.archivos.some(a=>a.nombre==='nv_cliente_'+c.cliente+'.dbi'))for(const f of c.filas)if(!alfas.has(JSON.stringify([String(f.CODIGO),f.COD_ALFA])))throw Object.assign(new Error('Faltan precios calculados para productos de las NV. Actualizá PRECIOS_NV antes de enviar.'),{status:422});return {...nv,revisionPrecios:precios.revision,huellaPrecios:precios.huella,archivos:[...precios.archivos.map(a=>({...a,destino:DESTINO_PRECIOS})),...nv.archivos.map(a=>({...a,destino:DESTINO_NV}))]};}
module.exports={DESTINO_NV,loteNV,loteNVConPrecios};
