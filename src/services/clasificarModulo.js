const normalizar=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const {TIPOS_MODULO}=require('../config/reglasPresea');
function clasificarModulo(marca,descripciones=[]){
 const infantil=['MOLEKINHA','MOLEKINHO'].includes(normalizar(marca));
 const esBolsa=descripciones.some(d=>/\bBOLSA\b/.test(normalizar(d)));
 const tipo=infantil?TIPOS_MODULO.KID:TIPOS_MODULO.MUJER;
 return {RUBROS:esBolsa?3:1,RUBRO:esBolsa?'ACCESORIOS':'CALZADO',CLASIFIC:tipo.codigo,DCLASIFIC:tipo.detalle};
}
module.exports={clasificarModulo};
