const {test}=require('node:test'),assert=require('node:assert/strict');
const {controlarClientes}=require('../src/services/controlClientes');
const origen={PACKING_LIST:{registros:[{datos:{SHOP:'001',BOXES:2,PAIRS:24},errores:[]},{datos:{SHOP:'131600',BOXES:1,PAIRS:12},errores:[]}]},CODIGOS_BARRA:{registros:[{datos:{LOJAS:'001',PARES:12},errores:[]},{datos:{LOJAS:'999',PARES:12},errores:[]}]}};
test('Clientes busca códigos exactos, reúne las dos fuentes y mantiene Administración configurada',()=>{
 const r=controlarClientes(origen,{disponible:true,indice:new Map([['001','CLIENTE UNO']]),ambiguos:[]});
 assert.equal(r.filas.find(r=>r.codigo==='001').nombre,'CLIENTE UNO');assert.equal(r.filas.find(r=>r.codigo==='001').cajasPacking,2);
 assert.equal(r.filas.find(r=>r.codigo==='131600').nombre,'ADMINISTRACIÓN');assert.equal(r.filas.find(r=>r.codigo==='999').estado,'NO_ENCONTRADO');assert.equal(r.resumen.encontrados,2);
});
test('Clientes informa ambigüedad y maestro ausente sin inventar coincidencias',()=>{
 assert.equal(controlarClientes(origen,{disponible:true,indice:new Map(),ambiguos:['001']}).filas.find(r=>r.codigo==='001').estado,'AMBIGUO');
 const r=controlarClientes(origen,{disponible:false});assert.equal(r.resumen.encontrados,0);assert.equal(r.resumen.pendientes,3);
});
