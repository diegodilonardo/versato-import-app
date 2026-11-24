const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const cron=require('../src/services/cronGrillas');const {crear,publicar}=require('../src/services/programadorGrillas');
test('cron respeta Argentina, días de semana, límites y año bisiesto',()=>{
 assert.equal(cron.siguiente('0 8 * * 1-5',new Date('2026-11-20T12:00:00Z')),'2026-11-23T11:00:00.000Z');
 assert.equal(cron.siguiente('0 0 29 2 *',new Date('2026-11-20T12:00:00Z')),'2028-02-29T03:00:00.000Z');
 assert.equal(cron.siguiente('*/5 * * * *',new Date('2026-11-20T03:59:55Z')),'2026-11-20T04:00:00.000Z');
 assert.throws(()=>cron.parsear('70 * * * *'));assert.throws(()=>cron.parsear('* * * * * rm'));
});
test('publicación conserva anterior si la vista cambió',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'grilla-test-'));try{await fs.writeFile(path.join(dir,'a.xlsx'),'anterior');await assert.rejects(publicar(dir,{nombre:'a.xlsx',buffer:Buffer.from('nueva')},()=>false));assert.equal(await fs.readFile(path.join(dir,'a.xlsx'),'utf8'),'anterior');assert.deepEqual(await fs.readdir(dir),['a.xlsx']);}finally{await fs.rm(path.join(dir,'a.xlsx'),{force:true});await fs.rmdir(dir);}
});
test('programador publica, omite sin cambios y bloquea stock no actualizado',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cron-test-'));let ahora=new Date('2026-11-20T12:00:00Z'),cantidad=1,fallar=false,exports=0;
 const v={id:'v',revision:'1',nombre:'Prueba',configuracion:{depositos:['7'],marcas:['VIZZANO'],listas:['03'],tipo:'',separar:'si'},programacion:{activa:true,cron:'*/5 * * * *',destino:dir,soloCambios:true}};
 const s=crear({archivo:path.join(dir,'estado.json'),ahora:()=>ahora,vistas:{leer:()=>[v]},stock:{actualizar:async()=>{if(fallar)throw Error('FTP caído');},generar:async()=>({filas:[{cantidad}]})},exportador:{exportar:async()=>{exports++;return{nombre:'prueba.xlsx',buffer:Buffer.from(String(cantidad))};}}});
 try{await s.ciclo();s.ejecutar('v','1');await s.ciclo();assert.equal(exports,1);s.ejecutar('v','1');await s.ciclo();assert.equal(exports,1);assert.equal(s.estado().vistas[0].estado,'Sin cambios');
 cantidad=2;ahora=new Date('2026-11-20T12:10:00Z');fallar=true;await s.ciclo();assert.equal(exports,1);assert.equal(await fs.readFile(path.join(dir,'prueba.xlsx'),'utf8'),'1');assert.equal(s.estado().vistas[0].estado,'Error');
 ahora=new Date('2026-11-20T12:20:00Z');fallar=false;await s.ciclo();assert.equal(exports,2);assert.equal(await fs.readFile(path.join(dir,'prueba.xlsx'),'utf8'),'2');
 }finally{for(const f of await fs.readdir(dir))await fs.rm(path.join(dir,f));await fs.rmdir(dir);}
});
test('ejecución única espera su hora, reintenta fallas y no se repite al reiniciar',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'unica-test-'));let ahora=new Date('2026-11-20T12:00:00Z'),fallar=true,exports=0;
 const v={id:'unica',revision:'a',nombre:'Una vez',configuracion:{depositos:['7'],marcas:['VIZZANO'],listas:['03']},programacion:{activa:true,modo:'unica',ejecutarEn:'2026-11-20T12:01:00.000Z',cron:'*/5 * * * *',destino:dir,soloCambios:false}};
 const opciones={archivo:path.join(dir,'estado.json'),ahora:()=>ahora,vistas:{leer:()=>[v]},stock:{actualizar:async()=>{},generar:async()=>({filas:[]})},exportador:{exportar:async()=>{if(fallar)throw Error('Archivo ocupado');exports++;return{nombre:'unica.xlsx',buffer:Buffer.from('ok')};}}};
 const s=crear(opciones);let reiniciado;
 try{await s.ciclo();assert.equal(exports,0);ahora=new Date('2026-11-20T12:01:00Z');await s.ciclo();assert.equal(s.estado().vistas[0].estado,'Error');fallar=false;ahora=new Date('2026-11-20T12:02:00Z');await s.ciclo();assert.equal(exports,1);assert.equal(s.estado().vistas[0].estado,'Completada');assert.equal(s.estado().vistas[0].proxima,null);
 ahora=new Date('2026-11-21T12:00:00Z');await s.ciclo();assert.equal(exports,1);
 reiniciado=crear(opciones);await reiniciado.iniciar();await new Promise(r=>setTimeout(r,40));await reiniciado.ciclo();assert.equal(exports,1);assert.equal(reiniciado.estado().vistas[0].proxima,null);
 }finally{reiniciado?.detener();for(const f of await fs.readdir(dir))await fs.rm(path.join(dir,f));await fs.rmdir(dir);}
});
test('fecha única valida calendario y convierte hora Argentina',()=>{
 const validar=require('../src/services/vistasStock').validarProgramacion;
 const base={activa:true,soloCambios:true,destino:'C:\\Grillas',cron:'*/5 * * * *',modo:'unica'};
 assert.equal(validar({...base,ejecutarEn:'2099-11-20T08:30'}).ejecutarEn,'2099-11-20T11:30:00.000Z');
 assert.throws(()=>validar({...base,ejecutarEn:'2099-02-30T08:30'}));assert.throws(()=>validar({...base,ejecutarEn:'2020-01-01T08:30'}));
});
test('días y horario genera cron semanal y rechaza días u horas inválidos',()=>{
 const validar=require('../src/services/vistasStock').validarProgramacion;
 const base={activa:true,soloCambios:true,destino:'C:\\Grillas',modo:'semanal',dias:[1,3,5],hora:'08:30'};
 const p=validar(base);assert.equal(p.cron,'30 8 * * 1,3,5');assert.deepEqual(p.dias,[1,3,5]);
 assert.equal(cron.siguiente(p.cron,new Date('2026-11-20T12:00:00Z')),'2026-11-23T11:30:00.000Z');
 assert.throws(()=>validar({...base,dias:[]}));assert.throws(()=>validar({...base,dias:[7]}));assert.throws(()=>validar({...base,hora:'24:00'}));
});
test('actualiza stock en backend cada diez minutos sin vistas ni navegador',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stock-intervalo-'));let ahora=new Date('2026-11-24T12:00:00Z'),consultas=0;
 const s=crear({archivo:path.join(dir,'estado.json'),ahora:()=>ahora,vistas:{leer:()=>[]},stock:{actualizar:async()=>{consultas++;}},exportador:{}});
 try{await s.ciclo();assert.equal(consultas,1);ahora=new Date('2026-11-24T12:05:00Z');await s.ciclo();assert.equal(consultas,1);ahora=new Date('2026-11-24T12:09:59Z');await s.ciclo();assert.equal(consultas,1);ahora=new Date('2026-11-24T12:10:00Z');await s.ciclo();assert.equal(consultas,2);}finally{await fs.rm(path.join(dir,'estado.json'));await fs.rmdir(dir);}
});
test('cada generación consulta FTP aunque no hayan pasado diez minutos',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stock-fresco-'));let consultas=0;
 const v={id:'fresca',revision:'1',nombre:'Fresca',configuracion:{depositos:['7'],marcas:['VIZZANO'],listas:['03']},programacion:{activa:false,cron:'*/5 * * * *',destino:dir,soloCambios:false}};
 const s=crear({archivo:path.join(dir,'estado.json'),ahora:()=>new Date('2026-11-24T12:00:00Z'),vistas:{leer:()=>[v]},stock:{actualizar:async()=>{consultas++;},generar:async()=>({filas:[]})},exportador:{exportar:async()=>({nombre:'fresca.xlsx',buffer:Buffer.from('ok')})}});
 try{await s.ciclo();assert.equal(consultas,1);s.ejecutar(v.id,v.revision);await s.ciclo();assert.equal(consultas,2);s.ejecutar(v.id,v.revision);await s.ciclo();assert.equal(consultas,3);}finally{for(const f of await fs.readdir(dir))await fs.rm(path.join(dir,f));await fs.rmdir(dir);}
});
