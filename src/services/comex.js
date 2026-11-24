const XLSX=require('xlsx');
const DEFINICIONES={
 pedidos:{nombre:'SALIDA PEDIDOS APP COMEX.XLSX',hoja:'SALIDA_PEDIDOS_APP_COMEX',columnas:['cod_alfa','descripcion','price','quantity','po']},
 masterData:{nombre:'SALIDA MASTER DATA APP COMEX.XLSX',hoja:'SALIDA_MASTER_DATA_APP_COMEX',columnas:['cod_alfa','descripcion','proveedor','nombre','grupo','subgrupo','linea','deporte','modelo','cod_mod','codigo_interno','yy','temporada','pais','codigo_color','color','grupo_genero','genero','clasificacion','codigo_curva','curva','composicion_curva','modulo']}
};
const texto=v=>String(v??'').trim();
const unico=valores=>{const unicos=[...new Set(valores.map(texto).filter(Boolean))];return unicos.length===1?unicos[0]:null;};
const numero=v=>v==null||texto(v)===''?null:Number(texto(v).replace(',','.'));
const key=(producto,grade)=>JSON.stringify([producto,grade]);
const producto=d=>[d.STYLE,d.MATERIAL_CODE,d.COLOR_CODE].join('.');
const normalizar=v=>texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function datosMaestro(registros){
 const campos=['CODIGO','COD_ALFA','DETALLE','DMARCA','MODC','DMODC','COD_AÑO','DCLASIFIC','DCOD_TEM','COLORC','DCOLORC','SEXO','DTALLC','PARES','DSUBG','DGRUPO','DET_LINEA'];
 return Object.fromEntries(campos.map(c=>[c,unico(registros.map(r=>r[c]))]));
}
function prepararCOMEX(resultado,previews,maestro){
 const packing=previews?.PACKING_LIST?.registros||[],codigos=previews?.CODIGOS_BARRA?.registros||[],factura=previews?.FACTURA?.registros||[];
 const grados=new Map(),cajasPorCodigo=new Map(),precios=new Map();
 for(const r of packing){if(r.errores?.length)continue;const d=r.datos,k=key(producto(d),d.SIZE_RUN);if(!grados.has(k))grados.set(k,[]);grados.get(k).push(d);}
 for(const r of codigos){if(r.errores?.length)continue;const codigo=texto(r.datos.CODIGO_BARRA);if(codigo)cajasPorCodigo.set(codigo,(cajasPorCodigo.get(codigo)||0)+1);}
 for(const r of factura){if(r.errores?.length)continue;const d=r.datos,p=producto(d),unit=numero(r.valores?.UNIT??d.UNIT);if(!precios.has(p))precios.set(p,[]);precios.get(p).push({grade:d.SIZE_RUN,unit});}
 const propuestas=new Map((resultado.productos?.modulos?.filas||[]).map(r=>[r.COD_ALFAB1,r]));
 const asignaciones=resultado.productos?.asignaciones||[];
 const generales=[];
 if(!maestro?.disponible)generales.push('Debe estar disponible el maestro de productos.');
 if(!packing.length||!codigos.length)generales.push('Faltan filas completas de Packing List o Códigos de Barra.');
 if(resultado.estado==='PARCIAL'||resultado.resumen?.revisar>0)generales.push('Resolvé las diferencias y filas excluidas del cruce.');
 if(!asignaciones.length)generales.push('No hay módulos para preparar.');
 const po=unico(resultado.facturas||[]);
 const pedidos=[],master=[],erroresPedidos=[],erroresMaster=[],advertencias=[];
 const firmas=new Map();let pendientesCodigos=0;
 for(const a of asignaciones){
  const clave=a.claveBuscada||a.CODIGO_DE_BARRA||key(a.PRODUCTO,a.SIZE_RUN),k=key(a.PRODUCTO,a.SIZE_RUN),origen=grados.get(k)||[];
  const errores=[];
  const coincidencias=maestro?.disponible&&a.claveBuscada?(maestro.indice.get(a.claveBuscada)||[]):[];
  const propuesta=propuestas.get(a.claveBuscada);
  const existente=coincidencias.length>0,datos=existente?datosMaestro(coincidencias):propuesta;
  if(existente&&(!datos.CODIGO||!datos.MODC))errores.push('El maestro tiene un código interno o MODC incompleto o ambiguo.');
  if(!datos)errores.push('No hay datos únicos del maestro ni propuesta de módulo.');
  if(!existente&&a.coincidencia!=='NO_ENCONTRADO')errores.push('La clave del módulo está pendiente de control.');
  if(!existente&&propuesta&&(propuesta.errorCodAlfa||propuesta.erroresDatos?.length))errores.push(...(propuesta.erroresDatos||[]),...(propuesta.errorCodAlfa?[propuesta.errorCodAlfa]:[]));
  const alfa=texto(datos?.COD_ALFA);if(!/^[A-Z0-9]{15}$/.test(alfa))errores.push('Falta un COD_ALFA válido de 15 caracteres.');
  const descripcion=texto(datos?.DETALLE);if(!descripcion)errores.push('Falta la descripción del módulo.');
  const relacionadas=asignaciones.filter(v=>v.PRODUCTO===a.PRODUCTO&&v.SIZE_RUN===a.SIZE_RUN);
  const cantidadPacking=origen.reduce((sum,d)=>sum+(numero(d.BOXES)||0),0);
  const cantidadCodigos=relacionadas.reduce((sum,v)=>sum+(cajasPorCodigo.get(v.claveBuscada)||0),0);
  if(!origen.length||cantidadPacking!==cantidadCodigos)errores.push('Las cajas por producto y SIZE_RUN no coinciden entre Packing y Códigos.');
  const quantity=relacionadas.length===1?cantidadPacking:cajasPorCodigo.get(a.claveBuscada);
  if(!Number.isSafeInteger(quantity)||quantity<=0)errores.push('Falta una cantidad válida de cajas para este módulo.');
  const pares=numero(datos?.PARES),paresPacking=unico(origen.map(d=>numero(d.PAIRS)/numero(d.BOXES)));
  if(!Number.isSafeInteger(pares)||pares<=0||numero(paresPacking)!==pares)errores.push('Los pares por módulo no coinciden con Packing.');
  const preciosProducto=precios.get(a.PRODUCTO)||[],todos=[...new Set(preciosProducto.map(r=>r.unit).filter(n=>n!=null&&Number.isFinite(n)))];
  const preciosGrade=[...new Set(preciosProducto.filter(r=>r.grade===a.SIZE_RUN).map(r=>r.unit).filter(n=>n!=null&&Number.isFinite(n)))];
  const unit=todos.length===1?todos[0]:preciosGrade.length===1?preciosGrade[0]:null;
  const calculado=unit!=null&&unit>=0&&Number.isInteger(pares)?Math.round((unit*pares+Number.EPSILON)*100)/100:null;
  const price=Number.isFinite(calculado)?calculado:null;
  const p={cod_alfa:alfa,descripcion,price,quantity,po};
  const marca=normalizar(datos?.DMARCA||unico((resultado.productos?.listado||[]).find(v=>v.PRODUCTO===a.PRODUCTO)?.marcas||[]));
  const kids=['MOLEKINHA','MOLEKINHO'].includes(marca),sexo=marca==='MOLEKINHO'?'MAS':marca==='MOLEKINHA'?'FEM':texto(datos?.SEXO)||'FEM';
  const interno=texto(datos?.CODIGO)||null;if(!interno)pendientesCodigos++;
  const m={cod_alfa:alfa,descripcion,proveedor:'PB0061',nombre:'BEIRA RIO',grupo:datos?.DGRUPO,subgrupo:datos?.DSUBG,linea:datos?.DET_LINEA,deporte:'NO APLICA',modelo:datos?.MODC,cod_mod:datos?.DMODC,codigo_interno:interno,yy:datos?.['COD_AÑO']||datos?.COD_ANO||datos?.AA,temporada:datos?.DCOD_TEM,pais:'BRASIL',codigo_color:datos?.COLORC,color:datos?.DCOLORC,grupo_genero:kids?'KIDS':'ADULTO',genero:sexo,clasificacion:kids?'MOD.KID':datos?.DCLASIFIC,codigo_curva:a.SIZE_RUN,curva:datos?.DTALLC,composicion_curva:datos?.DTALLC,modulo:pares==null?null:String(pares)};
  const em=[...errores];if(!marca)em.push('Falta una marca única para determinar ADULTO o KIDS.');for(const c of DEFINICIONES.masterData.columnas)if(c!=='codigo_interno'&&(m[c]==null||texto(m[c])===''))em.push('Falta '+c+'.');
  const ep=[...errores];if(!po)ep.push('Falta un número único de factura.');if(price==null)ep.push('Falta un precio unitario único en Factura.');
  const firma=JSON.stringify([a.PRODUCTO,a.SIZE_RUN,m,price,po]);
  if(alfa&&firmas.has(alfa)){
   const anterior=firmas.get(alfa);if(anterior.firma===firma){anterior.p.quantity+=quantity;continue;}
   const motivo='COD_ALFA asociado a más de un producto o definición de módulo.';ep.push(motivo);em.push(motivo);
  }
  firmas.set(alfa,{firma,p});pedidos.push(p);master.push(m);
  if(ep.length)erroresPedidos.push({clave,motivos:[...new Set(ep)]});if(em.length)erroresMaster.push({clave,motivos:[...new Set(em)]});
 }
 const gp=[...generales];if(!factura.length)gp.push('Cargá la Factura para obtener los precios de Pedidos.');if(factura.some(r=>r.errores?.length))gp.push('La Factura contiene filas con errores.');
 if(resultado.controlFactura&&(resultado.controlFactura.numeroCoincide===false||resultado.controlFactura.totales?.importeCoincide===false||resultado.controlFactura.totales?.paresCoinciden===false||resultado.controlFactura.resumen?.revisar||resultado.controlFactura.resumen?.filasInvalidas))gp.push('Resolvé las diferencias del control de Factura.');
 if(pendientesCodigos)advertencias.push(pendientesCodigos+' módulos todavía no tienen código interno. Se exporta vacío hasta recuperarlo del maestro después del alta en Presea.');
 const salida=(tipo,filas,errores,globales)=>({...DEFINICIONES[tipo],filas,total:filas.length,bloqueada:!!(errores.length||globales.length),errores,mensaje:[...new Set(globales)].join(' ')});
 return {version:1,preparado:new Date().toISOString(),alcance:'Todos los módulos de la factura, existentes y nuevos. Sin sueltos.',maestro:{huella:maestro?.huella||null,actualizado:maestro?.actualizado||null},pendientesCodigos,advertencias,pedidos:salida('pedidos',pedidos,erroresPedidos,gp),masterData:salida('masterData',master,erroresMaster,generales)};
}
function exportarCOMEX(resultado,tipo){
 const p=resultado.comex?.[tipo];if(!Object.hasOwn(DEFINICIONES,tipo))throw Object.assign(new Error('Tipo COMEX no válido.'),{status:400});
 if(!p||p.bloqueada||!p.total)throw Object.assign(new Error(p?.mensaje||'Hay módulos pendientes de revisión. Prepará los archivos COMEX y revisá sus observaciones.'),{status:422});
 const columnas=DEFINICIONES[tipo].columnas;
 const ws=XLSX.utils.aoa_to_sheet([columnas,...p.filas.map(r=>columnas.map(c=>r[c]??null))]);
 ws['!cols']=columnas.map(c=>({wch:['descripcion','curva','composicion_curva'].includes(c)?65:c==='cod_alfa'?22:18}));ws['!autofilter']={ref:ws['!ref']};
 if(tipo==='pedidos')for(let fila=2;fila<=p.filas.length+1;fila++){ws['C'+fila].z='0.00';ws['D'+fila].z='0';}
 const libro=XLSX.utils.book_new();XLSX.utils.book_append_sheet(libro,ws,p.hoja);return XLSX.write(libro,{type:'buffer',bookType:'xlsx',compression:true});
}
function archivosCOMEX(resultado){return Object.entries(DEFINICIONES).flatMap(([tipo,d])=>{const p=resultado.comex?.[tipo];return p&&!p.bloqueada&&p.total?[{nombre:nombreCOMEX(resultado,tipo),buffer:exportarCOMEX(resultado,tipo),registros:p.total}]:[];});}
function nombreCOMEX(resultado,tipo){const factura=unico(resultado.facturas||[])||unico((resultado.comex?.pedidos?.filas||[]).map(r=>r.po));const sufijo=factura?' - '+factura.replace(/[^0-9A-Za-z.-]/g,'-'):'';return DEFINICIONES[tipo].nombre.replace(/\.XLSX$/i,sufijo+'.XLSX');}
module.exports={nombreCOMEX,DEFINICIONES,prepararCOMEX,exportarCOMEX,archivosCOMEX};
