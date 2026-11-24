const {createHash}=require('node:crypto');
function normalizarFactura(valor){
 const texto=String(valor||'').normalize('NFKC').trim().toUpperCase();
 const m=/^(\d+)\s*[\/\.\-]\s*(\d{2}|\d{4})$/.exec(texto);
 if(m)return m[1].replace(/^0+(?=\d)/,'')+'/'+(m[2].length===2?'20'+m[2]:m[2]);
 return texto.replace(/\s+/g,'');
}
const huellasArchivos=files=>[...new Set(files.map(f=>createHash('sha256').update(f.buffer).digest('hex')))];
function detectarDuplicado(resultado,files,guardados,archivos){
 const facturas=new Set((resultado?.facturas||[]).map(normalizarFactura).filter(Boolean));
 const factura=guardados.find(r=>String(r.Factura||'').split(',').some(v=>facturas.has(normalizarFactura(v))));
 const hashes=new Set(huellasArchivos(files));const archivo=archivos.find(r=>hashes.has(r.Huella));
 const previo=factura||archivo;if(!previo)return null;
 return Object.assign(new Error(factura?'La factura '+factura.Factura+' ya está registrada. Consultá el análisis existente en Historial.':'El archivo '+archivo.Nombre+' ya está registrado, aunque tenga otro nombre. Consultá el análisis existente en Historial.'),{status:409,analisisId:previo.Id||previo.AnalisisId});
}
module.exports={normalizarFactura,huellasArchivos,detectarDuplicado};
