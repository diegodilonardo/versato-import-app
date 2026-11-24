const {test}=require('node:test');const assert=require('node:assert/strict');
const {clasificarModulo}=require('../src/services/clasificarModulo');const {construirCodAlfa}=require('../src/services/modelos');
test('MOLEKINHA y MOLEKINHO son tipo 4 infantil, incluyendo nombre con espacios',()=>{
 for(const marca of ['MOLEKINHA',' molekinho ']){const c=clasificarModulo(marca,['SANDALIA']);assert.equal(c.CLASIFIC,'4');assert.equal(c.DCLASIFIC,'MOD.KID');assert.equal(c.RUBROS,1);assert.equal(construirCodAlfa('O00786','1','26',{rubro:c.RUBROS,tipo:c.CLASIFIC}),'2611O0078641000');}
});
test('BOLSA como palabra en NAME determina accesorios 3 y cambia el rubro de COD_ALFA',()=>{
 const c=clasificarModulo('VIZZANO',['BOLSA FEMININA']);assert.equal(c.RUBROS,3);assert.equal(c.RUBRO,'ACCESORIOS');assert.equal(construirCodAlfa('V08182','1','26',{rubro:c.RUBROS,tipo:c.CLASIFIC}),'2613V0818281000');
 assert.equal(clasificarModulo('VIZZANO',['SAPATO FEMININO']).RUBROS,1);
});
