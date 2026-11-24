const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {verificarAccesoLocal,abrirCorreoLocal}=require('../src/services/abrirCorreoLocal');
const req=(ip='127.0.0.1',origin='http://localhost:3100')=>({socket:{remoteAddress:ip},headers:{origin},get:()=> 'localhost:3100'});
test('Abrir correo exige Windows, origen local y conexión local',()=>{
 assert.doesNotThrow(()=>verificarAccesoLocal(req(),'win32'));
 for(const r of [req('192.168.1.3'),req('127.0.0.1','http://ajeno.test'),req('127.0.0.1','')])assert.throws(()=>verificarAccesoLocal(r,'win32'),{status:403});
 assert.throws(()=>verificarAccesoLocal(req(),'linux'),{status:422});
});
test('Abre el EML intacto con la asociación de Windows, sin enviar el mensaje',async()=>{
 const buffer=Buffer.from('To: usuario@example.com\r\nX-Unsent: 1\r\n\r\nBorrador');
 await abrirCorreoLocal(buffer,{lanzar:async(exe,args,opts)=>{
  assert.equal(exe,'powershell.exe');assert.match(args.at(-1),/Start-Process/);assert.equal(opts.windowsHide,true);
  assert.deepEqual(await fs.readFile(opts.env.VERSATO_BORRADOR_EML),buffer);
 }});
 await assert.rejects(()=>abrirCorreoLocal(buffer,{lanzar:async()=>{throw Error('Sin asociación');}}),{status:422});
});
