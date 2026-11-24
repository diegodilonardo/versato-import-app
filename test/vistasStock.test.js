const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vistas=require('../src/services/vistasStock');
const configuracion={depositos:['7','203'],marcas:['VIZZANO'],listas:['03'],tipo:'Módulo',separar:'no',buscar:'1122-806-7286'};
function temporal(t){const carpeta=fs.mkdtempSync(path.join(os.tmpdir(),'versato-vistas-test-')),archivo=path.join(carpeta,'vistas.json');t.after(()=>{fs.rmSync(archivo,{force:true});fs.rmdirSync(carpeta);});return archivo;}
test('conserva varias vistas al leer de nuevo y actualiza una sin alterar otra',t=>{
 const archivo=temporal(t);
 const a=vistas.guardar({nombre:'Vendedores',configuracion},archivo);
 const b=vistas.guardar({nombre:'Stock',configuracion:{...configuracion,depositos:['203'],buscar:''}},archivo);
 assert.equal(vistas.leer(archivo).length,2);
 assert.deepEqual(vistas.leer(archivo)[0].configuracion,configuracion);
 const nueva=vistas.guardar({id:a.id,revision:a.revision,nombre:'Vendedores módulos',configuracion:{...configuracion,listas:['04']}},archivo);
 assert.notEqual(nueva.revision,a.revision);
 assert.equal(vistas.leer(archivo).find(v=>v.id===b.id).nombre,'Stock');
 assert.throws(()=>vistas.guardar({id:a.id,revision:a.revision,nombre:'Vieja',configuracion},archivo),e=>e.status===409);
 vistas.eliminar(nueva.id,nueva.revision,archivo);
 assert.equal(vistas.leer(archivo)[0].id,b.id);
});
test('rechaza nombres duplicados y selecciones incompletas sin perder lo guardado',t=>{
 const archivo=temporal(t);
 vistas.guardar({nombre:'Vendedores',configuracion},archivo);
 assert.throws(()=>vistas.guardar({nombre:' VENDEDORES ',configuracion},archivo),e=>e.status===409);
 assert.throws(()=>vistas.guardar({nombre:'Vacía',configuracion:{...configuracion,depositos:[]}},archivo),e=>e.status===422);
 assert.equal(vistas.leer(archivo).length,1);
});
test('permite guardar y recuperar una vista con la lista 05',t=>{
 const archivo=temporal(t);
 vistas.guardar({nombre:'Lista 05',configuracion:{...configuracion,listas:['05']}},archivo);
 assert.deepEqual(vistas.leer(archivo)[0].configuracion.listas,['05']);
});
