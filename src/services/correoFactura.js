const path=require('node:path');
const archivoClientes = path.join(__dirname, '../../data/Clientes_Versato.TXT');
const {actualizarMaestro}=require('./actualizarMaestro');
const txt=v=>String(v??'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v).toLocaleString('es-AR');
function parsearClientes(texto){
 const grupos=new Map(),entregas=new Map(),direcciones=new Map();let registros=0,sinNombre=0;
 for(const linea of texto.replace(/^\uFEFF/,'').split(/\r?\n/)){
  if(!linea.trim())continue;const campos=linea.split('|').map(txt);while(campos.at(-1)==='')campos.pop();
  // Desde la cuarta posición está la dirección, que también puede contener |.
  // DOMI_ENTRE sigue siendo exclusivamente el código de la tercera posición.
  if(!/^\d+$/.test(campos[0]))throw new Error('El maestro de clientes contiene una fila inválida.');
  if(!campos[1]){sinNombre++;continue;}
  if(!grupos.has(campos[0]))grupos.set(campos[0],new Set());grupos.get(campos[0]).add(campos[1]);registros++;
  if(!entregas.has(campos[0]))entregas.set(campos[0],new Set());entregas.get(campos[0]).add(campos[2]||'');
  if(!direcciones.has(campos[0]))direcciones.set(campos[0],new Map());const mapa=direcciones.get(campos[0]),codigo=campos[2]||'';if(!mapa.has(codigo))mapa.set(codigo,new Set());const direccion=campos.slice(3).filter(Boolean).join(' ');if(direccion)mapa.get(codigo).add(direccion);
 }
 const indice=new Map(),ambiguos=[];for(const [codigo,nombres]of grupos){if(nombres.size===1)indice.set(codigo,[...nombres][0]);else ambiguos.push(codigo);}
 const domicilios=new Map(),domiciliosAmbiguos=[];for(const [codigo,valores]of entregas){if(valores.size===1)domicilios.set(codigo,[...valores][0]);else domiciliosAmbiguos.push(codigo);}
 const detalleDomicilios=new Map([...direcciones].map(([cliente,mapa])=>[cliente,[...mapa].map(([codigo,textos])=>({codigo,direccion:[...textos].join(' / ')}))]));
 return{indice,nombresPorCliente:grupos,ambiguos,registros,sinNombre,domicilios,domiciliosAmbiguos,detalleDomicilios,opcionesDomicilio:new Map([...entregas].map(([c,v])=>[c,[...v]]))};
}
async function actualizarClientes(){const r=await actualizarMaestro({remoto:process.env.MAESTRO_CLIENTES_FTP_PATH||'/PRODUCTOS/MAESTROS_VERSATO/Clientes_Versato.TXT',destino:archivoClientes,parsear:parsearClientes,maxBytes:10*1024*1024});if(r.disponible)await require('./clientesSQL').guardarLocal();return r;}
function incorporarCambiosNV(informe,resultado){
 return {...informe,cambiosNV:(resultado.correccionesClientes||[]).map(c=>({...c}))};
}
function prepararInforme(resultado,previews,maestro){
 const packing=previews.PACKING_LIST?.registros||[],codigos=previews.CODIGOS_BARRA?.registros||[],errores=[];
 if(!maestro?.disponible)errores.push('No se pudo actualizar el maestro de clientes.');
 if(!packing.length||!codigos.length)errores.push('Faltan las filas originales de Packing o Códigos.');
 if(resultado.estado==='PARCIAL'||resultado.resumen?.revisar>0)errores.push('El análisis tiene filas excluidas o diferencias pendientes.');
 if((packing.concat(codigos)).some(r=>r.errores?.length))errores.push('Hay filas inválidas en los archivos de origen.');
 if(resultado.controlFactura&&(resultado.controlFactura.numeroCoincide===false||resultado.controlFactura.resumen?.revisar||resultado.controlFactura.resumen?.filasInvalidas||resultado.controlFactura.totales?.paresCoinciden===false))errores.push('El control de la factura tiene diferencias pendientes.');
 const marcasPorProducto=new Map(),detalle=new Map(),control=new Map();
 const agregar=(mapa,cliente,marca,cajas,pares)=>{const k=JSON.stringify([cliente,marca]);if(!mapa.has(k))mapa.set(k,{cliente,marca,cajas:0,pares:0});const g=mapa.get(k);g.cajas+=cajas;g.pares+=pares;if(!Number.isSafeInteger(g.cajas)||!Number.isSafeInteger(g.pares))errores.push('Las cantidades exceden la precisión admitida.');};
 for(const r of packing){if(r.errores?.length)continue;const d=r.datos,producto=[d.STYLE,d.MATERIAL_CODE,d.COLOR_CODE].join('.'),cliente=txt(d.SHOP),marca=txt(d.MARCA),cajas=Number(d.BOXES),pares=Number(d.PAIRS);
  if(!cliente||!marca||!Number.isSafeInteger(cajas)||cajas<=0||!Number.isSafeInteger(pares)||pares<=0){errores.push('Packing contiene un cliente, marca o cantidad no interpretable.');continue;}
  if(!marcasPorProducto.has(producto))marcasPorProducto.set(producto,new Set());marcasPorProducto.get(producto).add(marca);agregar(detalle,cliente,marca,cajas,pares);
 }
 for(const r of codigos){if(r.errores?.length)continue;const d=r.datos,producto=[d.LINHA,d.REFERENCIA,d.CABEDAL,d.COR].join('.'),marcas=marcasPorProducto.get(producto),cliente=txt(d.LOJAS),pares=Number(d.PARES);
  if(!cliente||marcas?.size!==1||!Number.isSafeInteger(pares)||pares<=0){errores.push('No se pudo controlar el cliente, marca o pares de una caja del archivo de códigos.');continue;}
  agregar(control,cliente,[...marcas][0],1,pares);
 }
 for(const clave of new Set([...detalle.keys(),...control.keys()])){const p=detalle.get(clave),c=control.get(clave);if(!p||!c||p.cajas!==c.cajas||p.pares!==c.pares)errores.push('Diferencia Packing/Códigos para cliente '+(p||c).cliente+' y marca '+(p||c).marca+'.');}
 const porMarca=new Map(),porCliente=new Map(),faltantes=new Set(),filas=[];const total={cajas:0,pares:0};
 for(const d of detalle.values()){
  const nombre=maestro?.indice?.get(d.cliente)||(d.cliente==='131600'?'ADMINISTRACIÓN':null);if(!nombre)faltantes.add(d.cliente);
  filas.push({...d,nombre:nombre||'SIN COINCIDENCIA EN MAESTRO'});
  if(!porMarca.has(d.marca))porMarca.set(d.marca,{marca:d.marca,cajas:0,pares:0});const m=porMarca.get(d.marca);m.cajas+=d.cajas;m.pares+=d.pares;
  if(!porCliente.has(d.cliente))porCliente.set(d.cliente,{cliente:d.cliente,nombre:nombre||'SIN COINCIDENCIA EN MAESTRO',cajas:0,pares:0});const c=porCliente.get(d.cliente);c.cajas+=d.cajas;c.pares+=d.pares;total.cajas+=d.cajas;total.pares+=d.pares;
 }
 if(faltantes.size)errores.push('Faltan nombres únicos en el maestro para los clientes: '+[...faltantes].join(', ')+'.');
 const facturas=[...new Set((resultado.facturas||[]).filter(Boolean))];if(facturas.length!==1)errores.push('Falta una factura única para el informe.');
 if(!Number.isSafeInteger(total.cajas)||!Number.isSafeInteger(total.pares))errores.push('Los totales exceden la precisión admitida.');
 if(!filas.length)errores.push('No hay movimientos para informar.');
 const ordenar=(a,b)=>a.cliente.localeCompare(b.cliente,'es',{numeric:true})||String(a.marca||'').localeCompare(b.marca||'','es');
 return incorporarCambiosNV({version:1,factura:facturas[0]||'',preparado:new Date().toISOString(),maestro:{archivo:maestro?.archivo,actualizado:maestro?.actualizado,huella:maestro?.huella},marcas:[...porMarca.values()].sort((a,b)=>a.marca.localeCompare(b.marca,'es')),clientes:[...porCliente.values()].sort(ordenar),detalle:filas.sort(ordenar),total,clientesSinNombre:[...faltantes],errores:[...new Set(errores)],bloqueada:errores.length>0},resultado);
}
function predeterminadosCorreo(informe){
 const config=require('../config/correoFactura'),codigos=new Set((informe.clientes||[]).map(c=>String(c.cliente)));
 const tipo=codigos.has('131600')?(codigos.size===1?'STOCK':'MIXTO'):'CLIENTES';
 const base={tipo,para:config.para.join('; '),copia:config.copia.join('; '),asunto:'Industrias Versato - Factura: '+informe.factura,deposito:tipo==='STOCK'?config.depositoStock:tipo==='CLIENTES'?config.depositoClientes:config.depositoClientes+' (Clientes) / '+config.depositoStock+' (Stock)',observaciones:tipo==='MIXTO'?config.observacionesMixto:tipo==='STOCK'?config.observacionesStock:config.observacionesClientes,firma:config.firma};return require('./configuracionCorreo').aplicarConfiguracion(base,informe.factura);
}
function opcionesCorreo(entrada,informe){
 const valores=predeterminadosCorreo(informe);const salida={};for(const [campo,max]of [['para',1500],['copia',1500],['asunto',180],['deposito',150],['observaciones',3000],['firma',500]]){salida[campo]=txt(entrada&&Object.hasOwn(entrada,campo)?entrada[campo]:valores[campo]);if(salida[campo].length>max)throw Object.assign(new Error('El campo '+campo+' es demasiado largo.'),{status:422});}
 salida.asunto=salida.asunto||'Industrias Versato - Factura: '+informe.factura;
 for(const c of ['para','copia','asunto'])if(/[\x00-\x1f\x7f]/.test(salida[c]))throw Object.assign(new Error('El campo '+c+' no admite saltos de línea.'),{status:422});
 for(const c of ['para','copia']){const direcciones=salida[c].split(/[;,]/).map(txt).filter(Boolean);if(direcciones.some(d=>d.length>254||!/^([^\s<>@,;]+)@([^\s<>@,;]+)\.[^\s<>@,;]+$/.test(d)))throw Object.assign(new Error('Revisá las direcciones de '+c+'. Usá correos separados por punto y coma.'),{status:422});salida[c]=direcciones.join(', ');}
 return salida;
}
function redactarCorreo(informe,entrada={},adjuntos=[]){
 const o=opcionesCorreo(entrada,informe),total=informe.total;
 const cuadros=[['Totales por marca',['MARCA','CAJAS(Módulos)','PARES'],informe.marcas.map(r=>[r.marca,r.cajas,r.pares])],['Totales por cliente',['CLIENTE','NOMBRE DEL CLIENTE','CAJAS(Módulos)','PARES'],informe.clientes.map(r=>[r.cliente,r.nombre,r.cajas,r.pares])],['Detalle por cliente y marca',['CLIENTE','NOMBRE DEL CLIENTE','MARCA','CAJAS(Módulos)','PARES'],informe.detalle.map(r=>[r.cliente,r.nombre,r.marca,r.cajas,r.pares])]];
 const fuente='font-family:Arial,Helvetica,sans-serif;';
 const filaBase=fuente+'font-size:11pt;line-height:14pt;mso-line-height-rule:exactly;';
 const htmlTabla=(headers,rows)=>{
  const anchos=headers.length===3?[60,20,20]:headers.length===4?[15,45,20,20]:[12,30,18,20,20];
  const tabla='<table role="table" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;mso-table-lspace:0pt;mso-table-rspace:0pt;">';
  const encabezados=headers.map((h,i)=>'<th width="'+anchos[i]+'%" align="center" valign="middle" style="width:'+anchos[i]+'%;'+fuente+'font-size:9pt;line-height:12pt;mso-line-height-rule:exactly;font-weight:bold;text-align:center;vertical-align:middle;color:#466052;background-color:#eaf0e3;padding:6pt 7pt;border-bottom:1px solid #cbd7c2;">'+esc(h)+'</th>').join('');
  const cuerpo=rows.map((r,i)=>'<tr>'+r.map((v,j)=>'<td align="center" valign="middle" style="'+filaBase+'text-align:center;vertical-align:middle;padding:5pt 7pt;border-bottom:1px solid #e1e7dc;color:#213731;background-color:'+(i%2?'#f8faf6':'#ffffff')+';word-wrap:break-word;">'+(j>=r.length-2?num(v):esc(v))+'</td>').join('')+'</tr>').join('');
  const estiloTotal=fuente+'font-size:10pt;line-height:14pt;mso-line-height-rule:exactly;text-align:center;padding:6pt 7pt;background-color:#244b3d;color:#ffffff;font-weight:bold;';
  return tabla+'<thead><tr>'+encabezados+'</tr></thead><tbody>'+cuerpo+'<tr><th colspan="'+(headers.length-2)+'" align="center" style="'+estiloTotal+'">TOTAL GENERAL</th><td align="center" style="'+estiloTotal+'">'+num(total.cajas)+'</td><td align="center" style="'+estiloTotal+'">'+num(total.pares)+'</td></tr></tbody></table>';
 };
 const titulo='Informe de Factura: '+informe.factura+' – Industrias Versato';
 const estiloParrafo=fuente+'font-size:11pt;line-height:16pt;mso-line-height-rule:exactly;color:#213731;';
 let html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><!--[if gte mso 9]><xml><o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office"><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--></head><body style="margin:0;padding:0;background-color:#f4f5ef;'+estiloParrafo+'"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;"><tr><td align="center" style="padding:18px 12px;">';
 html+='<!--[if mso]><table role="presentation" width="760" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]--><table role="presentation" width="760" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:760px;border-collapse:collapse;border:1px solid #dce1d6;background-color:#ffffff;mso-table-lspace:0pt;mso-table-rspace:0pt;"><tr><td style="padding:22px 24px;'+estiloParrafo+'">';
 html+='<p style="'+fuente+'font-size:9pt;line-height:12pt;color:#647567;font-weight:bold;margin:0 0 5pt;">INDUSTRIAS VERSATO</p><h1 style="'+fuente+'font-size:17pt;line-height:22pt;mso-line-height-rule:exactly;font-weight:bold;color:#213731;margin:0 0 7pt;">Factura '+esc(informe.factura)+'</h1><p style="'+estiloParrafo+'margin:0 0 13pt;padding-bottom:12pt;border-bottom:1px solid #dce1d6;"><strong>'+num(total.cajas)+'</strong> cajas &nbsp;·&nbsp; <strong>'+num(total.pares)+'</strong> pares</p>';
 if(informe.bloqueada)html+='<p style="'+estiloParrafo+'background-color:#fff0e0;padding:9pt;margin:0 0 12pt;">VISTA PREVIA CON OBSERVACIONES: '+esc(informe.errores.join(' '))+'</p>';
 let texto=titulo+'\r\n\r\n'+num(total.cajas)+' cajas · '+num(total.pares)+' pares\r\n';
 for(const [titulo,headers,rows]of cuadros){html+='<h2 style="'+fuente+'font-size:11pt;line-height:15pt;mso-line-height-rule:exactly;font-weight:bold;color:#355b40;margin:14pt 0 5pt;">'+titulo+'</h2>'+htmlTabla(headers,rows);texto+='\r\n'+titulo+'\r\n'+headers.join('\t')+'\r\n'+rows.map(r=>r.map((v,j)=>j>=r.length-2?num(v):v).join('\t')).join('\r\n')+'\r\nTOTAL GENERAL\t'+num(total.cajas)+'\t'+num(total.pares)+'\r\n';}
 if(o.deposito||o.observaciones){html+='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:16pt;background-color:#f6f8f3;"><tr><td style="padding:10pt 11pt;'+estiloParrafo+'">';for(const [etiqueta,valor]of [['Depósito',o.deposito],['Observaciones',o.observaciones]])if(valor){html+='<p style="'+estiloParrafo+'margin:0 0 4pt;"><strong>'+etiqueta+':</strong> '+esc(valor).replace(/\r?\n/g,'<br>')+'</p>';texto+='\r\n'+etiqueta+': '+valor+'\r\n';}html+='</td></tr></table>';}
 if(informe.cambiosNV?.length){
  const tituloCambios='NV modificadas · cambios de cliente';
  html+='<h2 style="'+fuente+'font-size:11pt;line-height:15pt;color:#80551e;margin:14pt 0 5pt;">'+tituloCambios+'</h2>';
  texto+='\r\n'+tituloCambios+'\r\n';
  for(const c of informe.cambiosNV){
   const fecha=new Date(c.fecha),fechaTexto=Number.isNaN(fecha.getTime())?'Fecha no registrada':fecha.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false});
   const lineas=['La asignación original de esta NV fue modificada.', 'Cliente original: '+txt(c.anterior)+' · '+txt(c.nombreAnterior),'Cliente nuevo: '+txt(c.nuevo)+' · '+txt(c.nombreNuevo),'Fecha del cambio: '+fechaTexto,'Motivo: '+txt(c.motivo),'Cantidades reasignadas (Packing): '+num(c.cajasPacking??0)+' cajas · '+num(c.paresPacking??0)+' pares','Cantidades reasignadas (Códigos): '+num(c.cajasCodigos??0)+' cajas · '+num(c.paresCodigos??0)+' pares'];
   html+='<div style="'+estiloParrafo+'background-color:#fff8ed;border:1px solid #ead4ae;padding:10pt 11pt;margin:0 0 7pt;">'+lineas.map(l=>'<p style="margin:0 0 4pt;">'+esc(l).replace(/\r?\n/g,'<br>')+'</p>').join('')+'</div>';
   texto+='\r\n'+lineas.join('\r\n')+'\r\n';
  }
 }
 if(o.firma){html+='<p style="'+estiloParrafo+'margin:14pt 0 0;">'+esc(o.firma).replace(/\r?\n/g,'<br>')+'</p>';texto+='\r\n'+o.firma+'\r\n';}
 if(adjuntos.length){const nombres=adjuntos.map(a=>a.nombre).join(', ');html+='<p style="'+fuente+'font-size:9pt;line-height:13pt;mso-line-height-rule:exactly;color:#647567;margin:12pt 0 0;"><strong>Adjunto:</strong> '+esc(nombres)+'</p>';texto+='\r\nAdjunto: '+nombres+'\r\n';}
 html+='</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>';
 return{...o,html,texto};
}

function crearBorrador(informe,entrada,adjuntos=[]){
 if(informe.bloqueada)throw Object.assign(new Error('Resolvé las observaciones del informe antes de descargar el borrador.'),{status:422});
 for(const a of adjuntos)if(!Buffer.isBuffer(a.buffer)||!a.buffer.length||!a.nombre||/[\r\n\x00]/.test(a.nombre)||a.nombre.length>180||!/^[-\w.+]+\/[-\w.+]+$/.test(a.tipo||''))throw Object.assign(new Error('No se pudo preparar un adjunto válido.'),{status:422});
 const r=redactarCorreo(informe,entrada,adjuntos),boundary='versato_'+require('crypto').randomUUID();
 const base64=v=>Buffer.from(v,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
 let fragmento='',asunto=[];for(const caracter of r.asunto){if(Buffer.byteLength(fragmento+caracter)>42){asunto.push(fragmento);fragmento='';}fragmento+=caracter;}if(fragmento)asunto.push(fragmento);const asuntoCodificado=asunto.map(t=>'=?UTF-8?B?'+Buffer.from(t).toString('base64')+'?=').join('\r\n ');
 const exterior=adjuntos.length?'versato_mixed_'+require('crypto').randomUUID():boundary;
 const cabeceras=['X-Unsent: 1','Date: '+new Date().toUTCString(),'MIME-Version: 1.0','Subject: '+asuntoCodificado,...(r.para?['To: '+r.para.split(', ').join(',\r\n ')]:[]),...(r.copia?['Cc: '+r.copia.split(', ').join(',\r\n ')]:[]),'Content-Type: multipart/'+(adjuntos.length?'mixed':'alternative')+'; boundary="'+exterior+'"'];
 const partes=[['text/plain',r.texto],['text/html',r.html]].map(([tipo,cuerpo])=>'--'+boundary+'\r\nContent-Type: '+tipo+'; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+base64(cuerpo));
 let cuerpo=partes.join('\r\n')+'\r\n--'+boundary+'--\r\n';
 if(adjuntos.length){
  cuerpo='--'+exterior+'\r\nContent-Type: multipart/alternative; boundary="'+boundary+'"\r\n\r\n'+cuerpo;
  for(const a of adjuntos){const ascii=a.nombre.normalize('NFKD').replace(/[^\x20-\x7e]/g,'').replace(/["\\]/g,'_'),utf8=encodeURIComponent(a.nombre).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   cuerpo+='\r\n--'+exterior+'\r\nContent-Type: '+a.tipo+'\r\nContent-Disposition: attachment; filename="'+ascii+'";\r\n filename*=UTF-8\'\''+utf8+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+base64(a.buffer)+'\r\n';
  }
  cuerpo+='--'+exterior+'--\r\n';
 }
 return Buffer.from(cabeceras.join('\r\n')+'\r\n\r\n'+cuerpo,'utf8');
}
module.exports={archivoClientes,opcionesCorreo,parsearClientes,actualizarClientes,prepararInforme,incorporarCambiosNV,predeterminadosCorreo,redactarCorreo,crearBorrador};
