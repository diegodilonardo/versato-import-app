const {randomUUID}=require('node:crypto');
const {controlarClientes}=require('./controlClientes');
function aplicarCorreccionesClientes(previews,correcciones=[]){
 const copia=structuredClone(previews);
 for(const c of correcciones)for(const [tipo,campo]of [['PACKING_LIST','SHOP'],['CODIGOS_BARRA','LOJAS']])for(const r of copia[tipo]?.registros||[]){
  if(String(r.datos[campo]??'').trim()===c.anterior)r.datos[campo]=c.nuevo;
 }
 return copia;
}
function prepararCorreccion(resultado,previews,maestro,entrada){
 if(!maestro?.disponible)throw Object.assign(new Error('No se pudo actualizar el maestro de clientes. No se guardó la corrección.'),{status:422});
 if(!Number.isInteger(entrada?.version)||entrada.version!==(resultado.correccionesClientes?.length||0))throw Object.assign(new Error('La factura cambió. Actualizá el análisis y revisá la corrección nuevamente.'),{status:409});
 if(entrada.huellaMaestro!==maestro.huella)throw Object.assign(new Error('El maestro de clientes cambió. Volvé a abrir la corrección y revisá el cliente de destino.'),{status:409});
 if(typeof entrada.anterior!=='string'||typeof entrada.nuevo!=='string'||typeof entrada.motivo!=='string')throw Object.assign(new Error('Completá cliente de origen, destino y motivo.'),{status:422});
 const anterior=entrada.anterior.trim(),nuevo=entrada.nuevo.trim(),motivo=entrada.motivo.trim();
 if(anterior===nuevo||!/^\d+$/.test(nuevo)||motivo.length<3||motivo.length>500)throw Object.assign(new Error('Seleccioná un cliente diferente y escribí un motivo de 3 a 500 caracteres.'),{status:422});
 const nombre=maestro.ambiguos?.includes(nuevo)?null:maestro.indice?.get(nuevo)||(nuevo==='131600'?'ADMINISTRACIÓN':null);
 if(!nombre)throw Object.assign(new Error('El cliente de destino no tiene un nombre único en el maestro.'),{status:422});
 const control=controlarClientes(aplicarCorreccionesClientes(previews,resultado.correccionesClientes),maestro);
 const origen=control.filas.find(r=>r.codigo===anterior);
 if(!origen)throw Object.assign(new Error('El cliente de origen ya no está en esta factura.'),{status:409});
 return {id:randomUUID(),fecha:new Date().toISOString(),anterior,nuevo,nombreAnterior:origen.nombre,nombreNuevo:nombre,motivo,alcance:'TODAS_LAS_CAJAS_DEL_CODIGO',cajasPacking:origen.cajasPacking,paresPacking:origen.paresPacking,cajasCodigos:origen.cajasCodigos,paresCodigos:origen.paresCodigos,huellaMaestro:maestro.huella||null};
}
module.exports={aplicarCorreccionesClientes,prepararCorreccion};
