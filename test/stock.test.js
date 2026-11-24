const test=require('node:test');
const assert=require('node:assert/strict');
const {parsearStock,agrupar,excel}=require('../src/services/stock');
function fila(tipo='900',deposito='8',cantidad='3'){
 return ['VIZZANO','CALZADO','123','ALFA','1184-101-7286','CALZADO','NEGRO',tipo==='900'?'1':'12',tipo==='900'?'35':'35 AL 40 x 12 ps','FEM',tipo,'15745','NEGRO','','','','','',deposito,'STOCK',cantidad].join('|');
}
test('stock distingue módulos y sueltos, valida la descarga antes de reemplazar',()=>{
 const r=parsearStock(fila()+'\n'+fila('950','7','2'));
 assert.equal(r.registros,2);assert.equal(r.filas[1].paresUnidad,12);
 assert.equal(r.filas[0].curva,'35');
 assert.throws(()=>parsearStock(fila()+'|sobrante'),/fila 1/);
 assert.throws(()=>parsearStock(fila().replace(/3$/,'incorrecto')),/formato/);
});
test('sumar depósitos conserva pares, talles, curvas y diferencias de precio',()=>{
 const filas=parsearStock([fila(),fila('900','203','4'),fila('950','7','2')].join('\n')).filas;
 filas.forEach((r,i)=>r.precios={'03':i===0?100:110});
 const g=agrupar(filas,['03'],false),suelto=g.find(r=>r.tipo==='Suelto'),modulo=g.find(r=>r.tipo==='Módulo');
 assert.equal(suelto.talles['35'],7);assert.equal(suelto.totalPares,7);
 assert.equal(suelto.precios['03'],'Varía / revisar detalle');
 assert.equal(modulo.totalPares,24);assert.deepEqual(modulo.talles,{});
 assert.equal(agrupar(filas,['03'],true).length,3);
 const b=excel({filas,grupos:g,talles:['35'],listas:['03'],fecha:'2026-11-20',fechaPrecios:'2026-11-20',resumen:{pares:31}});
 const XLSX=require('xlsx'),libro=XLSX.read(b,{type:'buffer'});
 assert.equal(libro.SheetNames.length,3);
 assert.equal(XLSX.utils.sheet_to_json(libro.Sheets['Detalle por producto']).length,3);
});
test('distribuye módulos solo con curva explícita consistente',()=>{
 const r=parsearStock(fila('950','203','3')).filas[0];r.precios={'03':1200};
 r.curva='35:1 36:2 37:3 38:3 39:2 40:1';
 const [g]=agrupar([r],['03'],true);assert.equal(g.talles['37'],9);assert.equal(Object.values(g.talles).reduce((s,n)=>s+n,0),36);
 r.curva='35:1 36:2';assert.deepEqual(agrupar([r],['03'],true)[0].talles,{});
});
