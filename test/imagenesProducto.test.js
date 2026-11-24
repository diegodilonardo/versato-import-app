const test=require('node:test'),assert=require('node:assert/strict');const {productoDelNombre,tipoImagen,validarFotos,asociarFotos}=require('../src/services/imagenesProducto');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64');const foto=(nombre='1122-828-7286-15745.png',buffer=png)=>({originalname:nombre,buffer});
test('Foto: clave exacta de cuatro partes, sin perder ceros ni asociar SIZE_RUN o año',()=>{assert.equal(productoDelNombre('1122-828-7286-15745.jpg'),'1122.828.7286.15745');assert.equal(productoDelNombre('001-002-003-004.PNG'),'001.002.003.004');for(const n of ['1122-828-7286-15745-1-26.jpg','../1122-828-7286-15745.jpg','otro.jpg'])assert.equal(productoDelNombre(n),null);});
test('Foto: comprueba contenido, extensión, cantidad y tamaño',()=>{assert.equal(tipoImagen(png),'image/png');assert.throws(()=>validarFotos([foto('1122-828-7286-15745.jpg')]),/válida/);assert.throws(()=>validarFotos([foto('foto.jpg',Buffer.from('<svg>'))]),/válida/);assert.throws(()=>validarFotos([foto('foto.png',Buffer.alloc(5*1024*1024+1))]),/5 MB/);assert.throws(()=>validarFotos(Array(301).fill(foto())),/300/);});
test('Foto: comparte por producto entre talles y módulos, informa faltantes y no incluye binarios en JSON',()=>{const r={productos:{listado:[{PRODUCTO:'1122.828.7286.15745',sizeRuns:['1','26']},{PRODUCTO:'1122.828.7286.29452'}]}};const originales=validarFotos([foto(),foto(),foto('otro.png'),foto('999-1-1-1.png')]);const guardadas=asociarFotos(r,originales);assert.equal(guardadas.length,1);assert(guardadas[0].buffer.equals(png));assert.deepEqual(r.imagenes.resumen,{cargadas:4,conFoto:1,sinFoto:1,noCoincidentes:2,repetidas:1});assert.equal(r.imagenes.fotos[0].buffer,undefined);});
test('Foto: impide elegir silenciosamente entre imágenes diferentes de un producto',()=>{const otra=Buffer.concat([png,Buffer.from([0])]);assert.throws(()=>validarFotos([foto(),foto('1122-828-7286-15745.PNG',otra)]),/fotos diferentes/);});

const {reutilizarFotos}=require('../src/services/imagenesProducto');
test('Reutiliza fotos de otras facturas sin seleccionar archivos ni guardar nuevos binarios',()=>{
 const r={productos:{listado:[{PRODUCTO:'1122.828.7286.15745'},{PRODUCTO:'1122.828.7286.29452'}]}};
 const existentes=[{PRODUCTO:'1122.828.7286.15745',nombre:'previa.jpg',huella:'hash',analisisOrigen:'otra-factura'}];
 assert.deepEqual(reutilizarFotos(r,existentes),[]);assert.equal(r.imagenes.resumen.cargadas,0);assert.equal(r.imagenes.resumen.conFoto,1);assert.equal(r.imagenes.resumen.sinFoto,1);assert.equal(r.imagenes.resumen.reutilizadas,1);assert.equal(r.imagenes.fotos[0].analisisOrigen,'otra-factura');
});
test('No duplica ni reemplaza fotos existentes al seleccionarlas nuevamente; guarda solo faltantes',()=>{
 const r={productos:{listado:[{PRODUCTO:'1122.828.7286.15745'},{PRODUCTO:'1122.828.7286.29452'}]}};
 const fotos=asociarFotos(r,validarFotos([foto(),foto('1122-828-7286-29452.png')]));
 const disponibles=[{PRODUCTO:'1122.828.7286.15745',nombre:'original.jpg',huella:'original',analisisOrigen:'anterior'},{PRODUCTO:'otro',nombre:'ajena.jpg'}];
 const nuevas=reutilizarFotos(r,disponibles,fotos);assert.equal(nuevas.length,1);assert.equal(nuevas[0].PRODUCTO,'1122.828.7286.29452');assert.equal(r.imagenes.fotos.find(f=>f.PRODUCTO==='1122.828.7286.15745').huella,'original');assert.equal(r.imagenes.fotos.length,2);assert.equal(r.imagenes.resumen.omitidasExistentes,1);
});
