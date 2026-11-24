const {generarSueltos,completarSueltos,prepararSueltos}=require('./sueltos');
const {prepararPresea}=require('./exportarPresea');
const {prepararProductosPresea}=require('./productosPresea');
const {prepararRelacionesDBI}=require('./relacionesDBI');
const {prepararAdicionalesDBI}=require('./adicionalesDBI');
const {estadoEnvioFTP}=require('./enviarFTP');
const {prepararCOMEX}=require('./comex');
function prepararResultado(resultado,{maestro,maestroSueltos,marcas,rubrosFact,clientes}){
    if(resultado.datosPersistencia&&resultado.correccionesClientes?.length){const efectivos=require('./correccionesClientes').aplicarCorreccionesClientes(resultado.datosPersistencia,resultado.correccionesClientes);Object.assign(resultado.datosPersistencia,efectivos);if(resultado.informeCorreo&&clientes?.disponible)resultado.informeCorreo=require('./correoFactura').prepararInforme(resultado,efectivos,clientes);}
    if(resultado.datosPersistencia)resultado.controlClientes=require('./controlClientes').controlarClientes(resultado.datosPersistencia,clientes);
    completarSueltos(generarSueltos(resultado.productos,maestroSueltos,rubrosFact,maestro),marcas);
    const sueltos=prepararSueltos(resultado);
    resultado.exportacionSueltos={listos:sueltos.listos,bloqueada:sueltos.bloqueada,mensaje:sueltos.mensaje};
    const presea=prepararPresea(resultado);
    resultado.exportacionPresea={listos:presea.listos,excluidas:presea.excluidas,bloqueada:presea.bloqueada,mensaje:presea.mensaje,totalPropuestos:presea.totalPropuestos};
    const completo=prepararProductosPresea(resultado);
    const {filas:filasPresea,...resumenCompleto}=completo;resultado.exportacionProductosPresea=resumenCompleto;
    const dbi=prepararRelacionesDBI(resultado);resultado.exportacionDBI={modulos:dbi.modulos,componentes:dbi.componentes,excluidas:dbi.excluidas,bloqueada:dbi.bloqueada,mensaje:dbi.mensaje};
    const adicionales=prepararAdicionalesDBI(resultado);resultado.exportacionAdicionalesDBI=Object.fromEntries(Object.entries(adicionales).map(([tipo,{filas,...resumen}])=>[tipo,resumen]));
    resultado.preparacionFTP=estadoEnvioFTP(resultado);
    if(resultado.datosPersistencia?.PACKING_LIST)resultado.comex=prepararCOMEX(resultado,resultado.datosPersistencia,maestro);
}
module.exports={prepararResultado};
