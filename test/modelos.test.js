const {test}=require('node:test');const assert=require('node:assert/strict');
const {parsearModelos,proponerModulos}=require('../src/services/modelos');
function productos(){return{listado:[{PRODUCTO:'1.2.3.4',marcas:['BEIRA RIO']},{PRODUCTO:'5.6.7.8',marcas:['MODARE']}],asignaciones:[{PRODUCTO:'1.2.3.4',SIZE_RUN:'1',AA:'26',claveBuscada:'1.2.3.4.1.26',coincidencia:'NO_ENCONTRADO'},{PRODUCTO:'1.2.3.4',SIZE_RUN:'8',AA:'26',claveBuscada:'1.2.3.4.8.26',coincidencia:'NO_ENCONTRADO'},{PRODUCTO:'5.6.7.8',SIZE_RUN:'1',AA:'26',claveBuscada:'5.6.7.8.1.26',coincidencia:'ENCONTRADO'}]};}
test('Un MODC por módulo anual faltante, con ceros y sin asignar CODIGO ni COD_ALFA',()=>{
const p=productos();proponerModulos(p,{disponible:true,indice:new Map()},{...parsearModelos('B04020|BEIRA RIO\nM04370|MODARE'),disponible:true});
assert.deepEqual(p.modulos.filas.map(r=>r.MODC),['B04021','B04022']);assert.equal(p.modulos.resumen.total,2);assert.equal(p.modulos.filas[0].CODIGO,null);assert.equal(p.modulos.filas[0].COD_ALFA.length,15);
});
test('COD_ALFA reproduce las cuatro ramas de longitud de Access y no trunca',()=>{
const {construirCodAlfa}=require('../src/services/modelos');
assert.equal(construirCodAlfa('B04021','1','26'),'2611B0402181000');
assert.equal(construirCodAlfa('B04021','99','26'),'2611B0402189900');
assert.equal(construirCodAlfa('B04021','383','26'),'2611B0402183830');
assert.equal(construirCodAlfa('B04021','2035','26'),'2611B0402182035');
assert.equal(construirCodAlfa('B04021','12345','26'),null);
assert.equal(construirCodAlfa(null,'1','26'),null);
});
test('COD_ALFA usa año de generación en Buenos Aires y no año de factura',()=>{
const p=productos();p.listado[0].STYLE='1.2';p.listado[0].MATERIAL='3';p.asignaciones.forEach(a=>a.AA='25');
proponerModulos(p,{disponible:true,indice:new Map()},{...parsearModelos('B04020|BEIRA RIO'),disponible:true},new Date('2027-01-01T01:00:00Z'));
assert.equal(p.modulos.filas[0].AA,'25');assert.equal(p.modulos.filas[0].ANIO_COD_ALFA,'26');assert.equal(p.modulos.filas[0].COD_ALFA,'2611B0402181000');
assert.equal(p.modulos.filas[0].DMODC,'1-2-3');assert.equal(p.modulos.filas[0].FECHA_ALTA,'2026-12-31');assert.equal(p.modulos.filas[0].SEXO,'FEM');
});
test('COD_ALFA existente en el maestro queda bloqueado y no cuenta como completo',()=>{
const p=productos();
proponerModulos(p,{disponible:true,indice:new Map([['existente',[{MODC:'OTRO',COD_ALFA:'2611B0402181000'}]]])},{...parsearModelos('B04020|BEIRA RIO'),disponible:true},new Date('2026-10-23T12:00:00Z'));
assert.equal(p.modulos.filas[0].estado,'REVISAR_COD_ALFA');assert.match(p.modulos.filas[0].errorCodAlfa,/ya existe/);assert.equal(p.modulos.resumen.conCodAlfa,1);assert.equal(p.modulos.resumen.pendientes,1);
});
test('Evita MODC ocupado y no asigna si falta maestro o marca',()=>{
const p=productos();proponerModulos(p,{disponible:true,indice:new Map([['x',[{MODC:'B04021'}]]])},{...parsearModelos('B04020|BEIRA RIO'),disponible:true});assert.equal(p.modulos.filas[0].MODC,'B04022');
const q=productos();proponerModulos(q,{}, {disponible:false});assert.equal(q.modulos.resumen.pendientes,2);
q.asignaciones.forEach(a=>a.coincidencia='PENDIENTE');proponerModulos(q,{}, {disponible:false});assert.equal(q.modulos.resumen.total,0);
assert.throws(()=>parsearModelos('B04020|BEIRA RIO\nB04021|BEIRA RIO'),/duplicada/);
});
