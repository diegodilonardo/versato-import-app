const {escribirDBI}=require('./escribirDBI'),esquema=require('../config/dbi/preciosNV.json');
const txt=v=>String(v??'').trim(),unico=valores=>{const v=[...new Set(valores.map(txt))];return v.length===1?v[0]:null;},redondear=n=>Math.round((n+Number.EPSILON)*100)/100;
function prepararPreciosNV(resultado,precios,maestro,sueltos,previews){
 const errores=[],productos=[],porAlfa=new Map(),porCodigo=new Map(),indice=new Map((precios.catalogo?.filas||[]).map(r=>[r.modelo,r]));
 if(!precios.catalogo)errores.push({tipo:'General',clave:'Catálogo',motivo:'Primero consolidá las listas FOB.'});
 if(precios.catalogo?.errores?.length)errores.push({tipo:'General',clave:'Catálogo',motivo:'Hay errores de origen en las listas FOB.'});
 if(!maestro?.disponible||!sueltos?.disponible)errores.push({tipo:'General',clave:'Maestros',motivo:'No se pudieron actualizar los maestros de módulos y sueltos.'});
 const agregar=(tipo,producto,datos,pares,clave)=>{
  const modelo=txt(producto).split('.').slice(0,3).join('.'),precio=indice.get(modelo),codigo=txt(datos?.CODIGO),alfa=txt(datos?.COD_ALFA);let motivo;
  if(!/^\d+$/.test(codigo)||!Number.isSafeInteger(Number(codigo))||!alfa)motivo='Falta un código interno y COD_ALFA únicos del maestro.';
  else if(!precio||precio.precioMayorista==null)motivo='No hay precio mayorista calculable con los coeficientes vigentes para '+modelo+'.';
  else if(!Number.isSafeInteger(pares)||pares<=0)motivo='No se pudo verificar la cantidad de pares por módulo.';
  const calculado=precio?.precioMayorista!=null?redondear(precio.precioMayorista*pares):null;
  if(!motivo&&(!Number.isFinite(calculado)||calculado<=0||calculado*100>Number.MAX_SAFE_INTEGER))motivo='Precio calculado no válido.';
  if(motivo){errores.push({tipo,clave,motivo});return;}
  const r={tipo,PRODUCTO:producto,modelo,codigo,cod_alfa:alfa,pares,precioPar:precio.precioMayorista,precioBase:calculado,vigencia:precio.vigencia};
  const anterior=porAlfa.get(alfa)||porCodigo.get(codigo);if(anterior){if(anterior.codigo!==codigo||anterior.cod_alfa!==alfa||anterior.modelo!==modelo||anterior.pares!==pares||anterior.tipo!==tipo||anterior.precioBase!==calculado)errores.push({tipo,clave,motivo:'El mismo código o COD_ALFA corresponde a definiciones o precios incompatibles.'});return;}
  porAlfa.set(alfa,r);porCodigo.set(codigo,r);productos.push(r);
 };
 const asignaciones=resultado.productos?.asignaciones||[];
 for(const a of asignaciones){const clave=a.claveBuscada||a.CODIGO_DE_BARRA,registros=maestro?.indice?.get(clave)||[],datos=registros.length?{CODIGO:unico(registros.map(r=>r.CODIGO)),COD_ALFA:unico(registros.map(r=>r.COD_ALFA))}:null;
  const origen=(previews?.PACKING_LIST?.registros||[]).filter(r=>!r.errores?.length&&[r.datos.STYLE,r.datos.MATERIAL_CODE,r.datos.COLOR_CODE].join('.')===a.PRODUCTO&&txt(r.datos.SIZE_RUN)===txt(a.SIZE_RUN));
  const cantidades=[...new Set(origen.map(r=>Number(r.datos.PAIRS)/Number(r.datos.BOXES)))],pares=cantidades.length===1?cantidades[0]:null,paresMaestro=unico(registros.map(r=>r.PARES));
  if(registros.length&&Number(paresMaestro)!==pares){errores.push({tipo:'Módulo',clave,motivo:'Los pares del módulo no coinciden entre Packing y el maestro.'});continue;}
  agregar('Módulo',a.PRODUCTO,datos,pares,clave);
 }
 const filasSueltos=resultado.productos?.sueltos?.filas||[];
 for (const r of filasSueltos) {
  const coincidencias = r.EAN ? sueltos?.indice?.get(r.EAN) || [] : [];
  const codigo = require('./sueltos').maximosPorEAN(coincidencias).CODIGO;
  const alfa = unico(coincidencias.filter(fila => txt(fila.CODIGO) === codigo).map(fila => fila.COD_ALFA));
  agregar('Suelto', r.PRODUCTO, { CODIGO: codigo, COD_ALFA: alfa }, 1, r.EAN || r.PRODUCTO+' '+r.TALLE_ORIGEN);
 }
 if(!asignaciones.length||!filasSueltos.length)errores.push({tipo:'General',clave:'Productos',motivo:'Faltan módulos o sueltos de la factura.'});
 productos.sort((a,b)=>a.tipo.localeCompare(b.tipo)||a.cod_alfa.localeCompare(b.cod_alfa));
 const filas=filasPorListas(productos);
 const salida={nombre:'PRECIOS_NV.DBI',preparado:new Date().toISOString(),fecha:precios.fecha,productos,filas,errores,bloqueada:!!errores.length||!filas.length,resumen:{modulos:productos.filter(r=>r.tipo==='Módulo').length,sueltos:productos.filter(r=>r.tipo==='Suelto').length,productos:productos.length,registros:filas.length},fuentes:{catalogo:precios.catalogo?.revision,coeficientes:precios.config?.revision,modulos:maestro?.huella,sueltos:sueltos?.huella}};
 if(!salida.bloqueada)try{escribirDBI(esquema,filasDBI(filas),new Date(salida.preparado));}catch(e){salida.errores.push({tipo:'General',clave:'DBI',motivo:e.message});salida.bloqueada=true;}
 return salida;
}
function filasDBI(filas){return filas.map(r=>({CODIGO:r.CODIGO??r.codigo,LISTAPRE:r.LISTAPRE,PRECIO:r.PRECIO,VERSION:r.VERSION,OBSERVACIO:'',COD_ALFA:r.COD_ALFA??r.cod_alfa}));}
function filasPorListas(productos){return productos.flatMap(r=>['03','04','980'].map(lista=>({LISTAPRE:lista,VERSION:'1',codigo:r.codigo,cod_alfa:r.cod_alfa,PRECIO:lista==='04'?redondear(r.precioBase*1.05):r.precioBase})));}
function exportarPreciosNV(p){if(!p||p.bloqueada||!p.filas.length)throw Object.assign(new Error('Generá los precios y resolvé los productos pendientes antes de descargar.'),{status:422});return escribirDBI(esquema,filasDBI(p.filas),new Date(p.preparado));}
function* generarBloquesPreciosNV(filas, cantidad) {
 const fecha = new Date();
 const cabecera = escribirDBI(esquema, [], fecha);
 const bytesCabecera = cabecera.readUInt16LE(8);
 cabecera.writeUInt32LE(cantidad, 4);
 yield cabecera.subarray(0, bytesCabecera);
 let lote = [];
 for (const fila of filas) {
  lote.push(fila);
  if (lote.length === 6000) {
   yield escribirDBI(esquema, filasDBI(lote), fecha).subarray(bytesCabecera, -1);
   lote = [];
  }
 }
 if (lote.length) yield escribirDBI(esquema, filasDBI(lote), fecha).subarray(bytesCabecera, -1);
 yield Buffer.from([26]);
}
module.exports={prepararPreciosNV,exportarPreciosNV,filasPorListas,generarBloquesPreciosNV};
