const {createHash}=require('node:crypto');
const {exportarPreciosNV}=require('./preciosNV');
const DESTINO_PRECIOS='/PRECIOS/VERSATO';
const fallo=m=>Object.assign(new Error(m),{status:422});
function lotePrecios(resultado){const p=resultado.preciosNV;if(!p?.revision)throw fallo('Generá y guardá los precios antes de enviarlos.');const buffer=exportarPreciosNV(p);return {revision:p.revision,huella:createHash('sha256').update(buffer).digest('hex'),archivos:[{nombre:'PRECIOS_NV.DBI',buffer}]};}
function loteCambiosPrecios(resultado) {
 const p = resultado.preciosNV, control = p?.comprobacionMaestro;
 if (!p?.revision || p.bloqueada || control?.criterio !== 'PRECIOS_FACTURA' || control.revision !== p.revision) throw fallo('Controlá los precios de la factura contra Presea antes de enviarlos.');
 if (control.resumen.conflictos) throw fallo('Revisá los precios contradictorios antes de enviar la factura.');
 const filas = control.filas.filter(f => ['FALTANTE', 'DISTINTO'].includes(f.estado));
 if (!filas.length) return { revision: p.revision, archivos: [] };
 return lotePrecios({ preciosNV: { ...p, filas } });
}
function verificarPreciosParaNV(resultado,cliente){
 const lote=lotePrecios(resultado),p=resultado.preciosNV,c=p.comprobacionMaestro;
 if(c?.criterio!=='EXISTENCIA_NV'||!c?.disponible||!c.valida||c.revision!==lote.revision||c.huellaPrecios!==lote.huella)throw fallo('Antes de enviar las NV, verificá que sus precios existan en MAESTRO_PRECIOS_VERSATO.TXT.');
 const productos=new Set(p.productos.map(r=>JSON.stringify([String(r.codigo),r.cod_alfa])));
 for(const g of resultado.notasVenta?.clientes||[])if(g.cliente!=='131600'&&(!cliente||g.cliente===cliente)&&!g.bloqueada)for(const r of g.filas)if(!productos.has(JSON.stringify([String(r.CODIGO),r.COD_ALFA])))throw fallo('Hay productos de las NV sin precios confirmados. Regenerá los precios, envialos e importalos en Presea.');
 return {revision:lote.revision,huella:lote.huella,confirmado:c.fecha,maestro:c.huella};
}
module.exports={DESTINO_PRECIOS,lotePrecios,loteCambiosPrecios,verificarPreciosParaNV};
