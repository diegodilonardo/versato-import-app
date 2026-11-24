const esquema=require('../config/dbi/nvClientes.json');
const {escribirDBI}=require('./escribirDBI');
const texto=v=>String(v??'').trim();
const clave=(cliente,producto,grade)=>JSON.stringify([cliente,producto,grade]);
const unico=valores=>{const lista=[...new Set(valores.map(texto))];return lista.length===1?lista[0]:null;};
function fechaLocal(fecha){const p=new Intl.DateTimeFormat('en',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(fecha);return ['year','month','day'].map(t=>p.find(v=>v.type===t).value).join('');}
function prepararNV(resultado,previews,productos,clientes,fecha=new Date(),domiciliosElegidos={}){
 const errores=[],grupos=new Map(),packing=new Map(),codigos=new Map(),controlProductos=new Map();let cajasExcluidas=0;
 const factura=unico(resultado.facturas||[]),hoy=fechaLocal(fecha);
 if(!factura||!/^\d+\/\d{4}$/.test(factura))errores.push('Se requiere un número único de factura con año.');
 if(!productos?.disponible||!clientes?.disponible)errores.push('No se pudieron actualizar los maestros de productos y clientes del FTP.');
 if(resultado.estado==='PARCIAL'||resultado.resumen?.revisar>0)errores.push('Resolvé las diferencias del cruce antes de generar las NV.');
 const cf=resultado.controlFactura;if(cf&&(cf.numeroCoincide===false||cf.resumen?.revisar||cf.resumen?.filasInvalidas||cf.totales?.paresCoinciden===false||cf.totales?.importeCoincide===false))errores.push('El control de factura tiene diferencias pendientes.');
 for(const tipo of ['PACKING_LIST','CODIGOS_BARRA'])if(!previews?.[tipo]?.registros?.length)errores.push('Faltan filas guardadas de '+tipo+'.');
 const asignaciones=new Map();for(const a of resultado.productos?.asignaciones||[]){const c=texto(a.claveBuscada||a.CODIGO_DE_BARRA);if(!asignaciones.has(c))asignaciones.set(c,[]);asignaciones.get(c).push(a);}
 for(const r of previews?.PACKING_LIST?.registros||[]){const d=r.datos,cliente=texto(d.SHOP);if(cliente==='131600')continue;if(r.errores?.length){errores.push('Packing contiene filas inválidas.');continue;}const k=clave(cliente,[d.STYLE,d.MATERIAL_CODE,d.COLOR_CODE].join('.'),texto(d.SIZE_RUN));const n=Number(d.BOXES);if(!Number.isSafeInteger(n)||n<=0)errores.push('Packing contiene una cantidad de cajas inválida.');else packing.set(k,(packing.get(k)||0)+n);}
 for(const r of previews?.CODIGOS_BARRA?.registros||[]){
  const d=r.datos,cliente=texto(d.LOJAS);if(cliente==='131600'){cajasExcluidas++;continue;}
  if(r.errores?.length){errores.push('Códigos de Barra contiene filas inválidas.');continue;}
  if(!/^\d+$/.test(cliente)){errores.push('Hay cajas sin un cliente válido.');continue;}
  if(!grupos.has(cliente))grupos.set(cliente,{cliente,nombre:clientes?.indice?.get(cliente)||'',filas:[],errores:[],cajas:0});const g=grupos.get(cliente);g.cajas++;
  const a=asignaciones.get(texto(d.CODIGO_BARRA))||[];
  if(a.length!==1){g.errores.push('No se identificó un único módulo para '+texto(d.CODIGO_BARRA)+'.');continue;}
  const k=clave(cliente,a[0].PRODUCTO,texto(a[0].SIZE_RUN));codigos.set(k,(codigos.get(k)||0)+1);
  const registros=productos?.indice?.get(texto(d.CODIGO_BARRA))||[];
  const claveVersato=texto(d.CODIGO_BARRA),controlKey=JSON.stringify([cliente,claveVersato]);
  const interno=unico(registros.map(v=>v.CODIGO)),alfa=unico(registros.map(v=>v.COD_ALFA)),marca=unico(registros.map(v=>v.DMARCA));
  const valido=/^\d+$/.test(interno||'')&&Number.isSafeInteger(Number(interno))&&/^\w{15}$/.test(alfa||'')&&!!marca;
  if(!controlProductos.has(controlKey))controlProductos.set(controlKey,{cliente,PRODUCTO:a[0].PRODUCTO,SIZE_RUN:texto(a[0].SIZE_RUN),claveVersato,cajas:0,estado:!registros.length?'PENDIENTE_IMPACTO_PRESEA':valido?'ENCONTRADO':'REVISAR_MAESTRO',codigo:interno||'',codAlfa:alfa||''});controlProductos.get(controlKey).cajas++;
  if(!registros.length){g.errores.push('Pendiente de impacto en Presea: '+claveVersato+'. Importá los productos, exportá el maestro y volvé a actualizar las NV.');continue;}
  if(!/^\d+$/.test(interno||'')||!Number.isSafeInteger(Number(interno))||!/^\w{15}$/.test(alfa||'')||!marca){g.errores.push('Falta un módulo único con código interno, COD_ALFA y marca en el maestro: '+texto(d.CODIGO_BARRA)+'.');continue;}
  let fila=g.filas.find(v=>v.CODIGO===interno&&v.COD_ALFA===alfa);if(fila){fila.CANTIDAD++;continue;}
  fila={NUMERO:(factura||'').replace('/','')+cliente,CLIENTE:cliente,CANTIDAD:1,CODIGO:interno,COD_ALFA:alfa,DOMI_ENTRE:clientes?.domicilios?.get(cliente)??'',FECHA:hoy,FECHA_ENT2:0,MONEDA:0,COTIZACION:0,EMPRESA:0,REFERENCIA:factura,OBS:factura,LISTAPRE:0,VER_LISTA:0,PRECIO:0,FECHA_ENT:hoy,DTO2:0,FP:factura,MARCA:marca};g.filas.push(fila);
 }
 for(const k of new Set([...packing.keys(),...codigos.keys()]))if(packing.get(k)!==codigos.get(k))errores.push('Las cajas de Packing y Códigos no coinciden para cliente/producto/curva '+k+'.');
 const salida=[...grupos.values()].sort((a,b)=>a.cliente.localeCompare(b.cliente,'es',{numeric:true}));
 for(const g of salida){
  const nombreAmbiguo = clientes?.ambiguos?.includes(g.cliente);
  const faltaCliente = !g.nombre && !nombreAmbiguo;
  if(nombreAmbiguo)g.errores.push('El cliente tiene más de un nombre en el maestro.');
  if(faltaCliente)g.errores.push(`El cliente ${g.cliente} no figura en el maestro. Actualizá el maestro o corregí el código en Control de clientes.`);
  g.domicilios=clientes?.opcionesDomicilio?.get(g.cliente)||[];
  g.detalleDomicilios=clientes?.detalleDomicilios?.get(g.cliente)||[];
  const elegido=Object.hasOwn(domiciliosElegidos,g.cliente)?domiciliosElegidos[g.cliente]:null;
  const valido=elegido!==null&&g.domicilios.includes(elegido);
  if(elegido!==null&&!valido)g.errores.push('El domicilio elegido no pertenece al cliente en el maestro actual.');
  if(valido)for(const fila of g.filas)fila.DOMI_ENTRE=elegido;
  g.requiereDomicilio=!valido&&(!clientes?.domicilios?.has(g.cliente)||clientes?.domiciliosAmbiguos?.includes(g.cliente));
  g.errores=[...new Set([...errores,...g.errores])];g.puedeElegirDomicilio=g.requiereDomicilio&&g.domicilios.length>1&&!g.errores.length;
  if(g.requiereDomicilio&&!faltaCliente)g.errores.push(g.domicilios.length?'Elegí un domicilio de entrega del maestro para este cliente.':'El maestro no trae domicilios de entrega para este cliente.');
  g.pendientesImpacto=[...controlProductos.values()].filter(r=>r.cliente===g.cliente&&r.estado==='PENDIENTE_IMPACTO_PRESEA').length;g.bloqueada=!!g.errores.length;g.estadoProductos=g.pendientesImpacto?'PENDIENTE_IMPACTO_PRESEA':g.bloqueada?'REVISAR':'LISTO';g.nombreArchivo='nv_cliente_'+g.cliente+'.dbi';g.filas.sort((a,b)=>a.COD_ALFA.localeCompare(b.COD_ALFA));if(!g.bloqueada)try{escribirDBI(esquema,g.filas,fecha);}catch(e){g.errores.push(e.message);g.bloqueada=true;}
 }
 return {controlProductos:{consultado:productos?.actualizado||fecha.toISOString(),archivo:productos?.archivo||'Maestro_Versato.TXT',huella:productos?.huella,filas:[...controlProductos.values()],pendientes:[...controlProductos.values()].filter(r=>r.estado==='PENDIENTE_IMPACTO_PRESEA').length},factura,fecha:hoy,preparado:fecha.toISOString(),clientes:salida,cajasExcluidas,errores:[...new Set(errores)],maestros:{productos:productos?.huella,clientes:clientes?.huella}};
}
function exportarNV(preparacion,cliente){const g=preparacion.clientes.find(v=>v.cliente===cliente);if(cliente==='131600'||!g)throw Object.assign(new Error('El cliente no tiene una NV disponible.'),{status:404});if(g.bloqueada||!g.filas.length)throw Object.assign(new Error(g.errores.join(' ')||'No hay líneas para exportar.'),{status:422});return escribirDBI(esquema,g.filas,new Date(preparacion.preparado||preparacion.fecha.slice(0,4)+'-'+preparacion.fecha.slice(4,6)+'-'+preparacion.fecha.slice(6,8)+'T12:00:00Z'));}
function guardarDomicilio(preparacion,cliente,codigo){
 const copia=structuredClone(preparacion),g=copia.clientes.find(c=>c.cliente===cliente);
 if(!g||cliente==='131600')throw Object.assign(new Error('Cliente no disponible en las NV guardadas.'),{status:404});
 if(!g.requiereDomicilio)throw Object.assign(new Error('La NV ya está generada y su domicilio de entrega quedó fijado. No se permite modificarlo.'),{status:409});
 if(typeof codigo!=='string'||!g.domicilios.includes(codigo))throw Object.assign(new Error('Elegí un domicilio disponible para este cliente.'),{status:422});
 for(const fila of g.filas)fila.DOMI_ENTRE=codigo;
 g.domicilioElegido=codigo;g.requiereDomicilio=false;g.errores=g.errores.filter(e=>e!=='Elegí un domicilio de entrega del maestro para este cliente.');g.bloqueada=!!g.errores.length;
 if(!g.bloqueada)escribirDBI(esquema,g.filas,new Date(copia.preparado));
 g.domicilioGuardado=new Date().toISOString();return copia;
}
function requiereRevisionNV(resultado){const n=resultado.notasVenta;return !n||n.correccionesOrigen!==JSON.stringify(resultado.correccionesClientes||[])||!n.clientes?.length||n.clientes.some(c=>c.bloqueada);}
module.exports={prepararNV,exportarNV,fechaLocal,guardarDomicilio,requiereRevisionNV};
