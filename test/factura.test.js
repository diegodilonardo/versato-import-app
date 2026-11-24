const {test}=require('node:test');const assert=require('node:assert/strict');const XLSX=require('xlsx');
const {detectarArchivo}=require('../src/services/detectarArchivo');const {leerFactura,controlarFactura}=require('../src/services/factura');
function fixture(importe=21.6,total=21.6){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([
  ['FACTURA PROFORMA: 3833/2026'],[],['STYLE','MATERIAL CODE','COLOR CODE','SIZE RUN','BOXES','PAIRS','UNIT','AMOUNT'],
  ['001.02','03','04','1',2,12,1.8,importe],['','','','','',12,'TOTAL',total]
]),'Cualquiera');return XLSX.write(w,{type:'buffer',bookType:'xls'});}
test('Factura se distingue de Packing y comprueba cantidades, importes y número',()=>{
 const b=fixture(),d=detectarArchivo(b);assert.equal(d.tipo,'FACTURA');const p=leerFactura(b,d,true);
 assert.equal(p.resumen.validos,1);assert.equal(p.totales.importe,21.6);assert.equal(p.totales.importeCoincide,true);
 const productos={listado:[{PRODUCTO:'001.02.03.04',STYLE:'001.02',MATERIAL:'03',COLOR:'04',paresPacking:12,paresCodigos:12,paresEan:12,cajasPacking:2,cajasCodigos:2}]};
 const c=controlarFactura(p,productos,['3833/2026']);assert.equal(c.resumen.coinciden,1);assert.equal(c.numeroCoincide,true);
 assert.equal(controlarFactura(p,productos,['999/2026']).numeroCoincide,false);
 productos.listado[0].paresPacking=11;assert.equal(controlarFactura(p,productos,['3833/2026']).resumen.revisar,1);
});
test('Factura no oculta precio por pares incorrecto ni total declarado distinto',()=>{
 let b=fixture(99),p=leerFactura(b,detectarArchivo(b),true);assert.equal(p.resumen.conErrores,1);assert.match(p.problemas[0].errores.join(),/UNIT/);
 b=fixture(21.6,25);p=leerFactura(b,detectarArchivo(b),true);assert.equal(p.resumen.conErrores,0);assert.equal(p.totales.importeCoincide,false);
});
test('Factura sin SIZE RUN se identifica pero se rechaza con un error claro',()=>{
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([
 ['FACTURA PROFORMA: 7623/2025'],['STYLE','MATERIAL CODE','COLOR CODE','BOXES','PAIRS','UNIT','AMOUNT'],
 ['001.02','03','04',2,12,1.8,21.6],['','','','',12,'TOTAL',21.6]
 ]),'Cualquiera');
 const b=XLSX.write(w,{type:'buffer',bookType:'xls'});const d=detectarArchivo(b);assert.equal(d.tipo,'FACTURA');
 assert.throws(()=>leerFactura(b,d,true),/falta la columna SIZE RUN/);
});
