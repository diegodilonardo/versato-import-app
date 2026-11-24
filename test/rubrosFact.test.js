const{test}=require('node:test');const assert=require('node:assert/strict');const{parsearRubrosFact,completarRubrosFact}=require('../src/services/rubrosFact');
function productos(){return{modulos:{filas:[{PRODUCTO:'x',SIZE_RUN:'1',DMARCA:'BEIRA RIO',RUBROS:1,MODC:'B00001',COD_ALFA:'2641B0000181000',erroresDatos:[]}],resumen:{},nota:''}};}
test('RUBRO_FACT usa marca, rubro y MODULOS, sin confundir SUELTOS',()=>{
 const p=productos(),m={...parsearRubrosFact('9000|BEIRA RIO|CALZADO|1|MODULOS|MOD_CALZ_BR\n9000|BEIRA RIO|CALZADO|1|SUELTOS|CALZ_BR\n9000|BEIRA RIO|ACCESORIOS|3|MODULOS|MOD_ACCE_BR'),disponible:true};
 completarRubrosFact(p,m);assert.equal(p.modulos.filas[0].RUBRO_FACT,'MOD_CALZ_BR');assert.equal(p.modulos.resumen.pendientes,0);
 const ac=productos();ac.modulos.filas[0].RUBROS=3;completarRubrosFact(ac,m);assert.equal(ac.modulos.filas[0].RUBRO_FACT,'MOD_ACCE_BR');
});
test('Faltantes y ambigüedades quedan pendientes sin inventar rubro',()=>{
 const p=productos();completarRubrosFact(p,{...parsearRubrosFact('9000|BEIRA RIO|CALZADO|1|SUELTOS|CALZ_BR'),disponible:true});assert.equal(p.modulos.filas[0].RUBRO_FACT,null);assert.equal(p.modulos.resumen.pendientes,1);
 const q=productos();completarRubrosFact(q,{...parsearRubrosFact('9000|BEIRA RIO|CALZADO|1|MODULOS|A\n9000|BEIRA RIO|CALZADO|1|MODULOS|B'),disponible:true});assert.equal(q.modulos.filas[0].RUBRO_FACT,null);assert.match(q.modulos.filas[0].erroresDatos[0],/ambiguo/);
});
