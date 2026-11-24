const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {finished}=require('node:stream/promises');
const {actualizarMaestro}=require('../src/services/actualizarMaestro');const {crearAlmacen}=require('../src/services/analisisGuardados');
function contenido(){const a=Array(28).fill('');a[0]='1.2';a[1]='4';a[3]='3';a[5]='1';a[7]='123';a[11]='MOD1';a[15]='1.2.3.4.1';a[16]='26';return a.join('|');}
test('FTP valida copia y falla sin usar el maestro anterior ni revelar credenciales',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'versato-ftp-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const destino=path.join(dir,'Maestro.TXT');
 const env={MAESTRO_FTP_PASSWORD:'secreto-de-prueba'};
 let cierres=0;const client={async access(){},async downloadTo(stream){stream.end(contenido());await finished(stream);},close(){cierres++;}};
 const ok=await actualizarMaestro({env,client,destino});assert.equal(ok.disponible,true);assert.equal(ok.origen,'FTP');assert.equal(ok.registros,1);assert.ok(ok.huella);assert.ok(cierres);
 const anterior=await fs.readFile(destino,'utf8');
 const fail=await actualizarMaestro({env,client:{async access(){throw new Error('secreto-de-prueba');},close(){}},destino});
 assert.equal(fail.disponible,false);assert.ok(!JSON.stringify(fail).includes('secreto-de-prueba'));assert.equal(await fs.readFile(destino,'utf8'),anterior);
 const bad=await actualizarMaestro({env,client:{async access(){},async downloadTo(s){s.end('mal');await finished(s);},close(){}},destino});assert.equal(bad.disponible,false);assert.equal(await fs.readFile(destino,'utf8'),anterior);
});
test('Sin credenciales el control queda pendiente',async()=>{assert.equal((await actualizarMaestro({env:{}})).disponible,false);});
test('El análisis conserva su resultado para exportar, con vencimiento y límite',()=>{
 let tiempo=0;const a=crearAlmacen({ttl:1000,max:2,reloj:()=>tiempo});const original={productos:{maestro:{huella:'original'}}};const id=a.guardar(original).id;
 assert.equal(a.obtener(id),original);tiempo=1001;assert.equal(a.obtener(id),null);
 const primero=a.guardar({}).id;a.guardar({});a.guardar({});assert.equal(a.obtener(primero),null);
});
