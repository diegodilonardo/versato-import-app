const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
const repo=require('../src/services/repositorioImagenes');
test('asocia modelo y color exactos con puntos o guiones, sin adivinar otros colores',()=>{
 assert.equal(repo.productoNombre('1122-806-7286-15745.JPG'),'1122.806.7286.15745');
 assert.equal(repo.productoNombre('1122.806.7286.29452.png'),'1122.806.7286.29452');
 assert.equal(repo.productoNombre('1122-806-7286.jpg'),null);
 assert.equal(repo.productoNombre('1122-806-7286-15745-copia.jpg'),null);
});
test('valida ubicaciones locales o UNC y rechaza rutas relativas o de dispositivos',()=>{
 const base={nombre:'Fotos',ruta:'C:\\Fotos',subcarpetas:false,activa:true,prioridad:100};
 assert.equal(repo.validarUbicacion(base).ruta,'C:\\Fotos');
 assert.equal(repo.validarUbicacion({...base,ruta:'\\\\servidor\\fotos'}).ruta,path.win32.normalize('\\\\servidor\\fotos'));
 for(const ruta of ['../fotos','https://servidor/fotos','\\\\?\\C:\\Fotos'])assert.throws(()=>repo.validarUbicacion({...base,ruta}));
 assert.throws(()=>repo.validarUbicacion({...base,prioridad:0}));
});
test('la copia local permanece disponible sin el original y versiones distintas no se sobreescriben',async t=>{
 const raiz=await fs.mkdtemp(path.join(os.tmpdir(),'versato-repo-test-'));
 t.after(async()=>{for(const n of await fs.readdir(raiz))await fs.rm(path.join(raiz,n));await fs.rmdir(raiz);});
 const original=path.join(raiz,'origen.jpg'),foto=Buffer.from('foto de prueba'),hash=createHash('sha256').update(foto).digest('hex');
 await fs.writeFile(original,foto);await repo.copiar(foto,hash,'image/jpeg',raiz);await fs.rm(original);
 assert.deepEqual(await fs.readFile(repo.rutaCopia(hash,'image/jpeg',raiz)),foto);
 await repo.copiar(foto,hash,'image/jpeg',raiz);
 const nueva=Buffer.from('foto actualizada'),nuevoHash=createHash('sha256').update(nueva).digest('hex');
 await repo.copiar(nueva,nuevoHash,'image/jpeg',raiz);
 assert.deepEqual(await fs.readFile(repo.rutaCopia(hash,'image/jpeg',raiz)),foto);
 assert.deepEqual(await fs.readFile(repo.rutaCopia(nuevoHash,'image/jpeg',raiz)),nueva);
 assert.throws(()=>repo.rutaCopia('../fuera','image/jpeg',raiz));
});
