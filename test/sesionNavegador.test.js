const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function navegador(datos){
 const llamadas=[],location={href:'http://versato.test/stock',origin:'http://versato.test',replace(){},assign(){}};
 class Formulario{constructor(){this.action='http://versato.test/api/precios/maestro.dbi';this.method='post';this.campos=[];}querySelector(){return this.campos[0];}append(c){this.campos.push(c);}submit(){this.enviado=true;}}
 const document={readyState:'loading',addEventListener(){},createElement:()=>({})};
 const window={fetch:async(url,opciones)=>{llamadas.push([url,opciones]);return new Response(JSON.stringify(String(url)==='/api/auth/me'?datos:{ok:true}),{headers:{'Content-Type':'application/json'}});}};
 const c={window,document,location,HTMLFormElement:Formulario,Headers,Request,URL,Error,MutationObserver:class{observe(){}}};vm.runInNewContext(fs.readFileSync(require.resolve('../public/sesion.js'),'utf8'),c);return {window,llamadas,Formulario};
}
test('El navegador conserva multipart y agrega CSRF solo a operaciones del mismo origen',async()=>{
 const n=navegador({habilitada:true,usuario:{},csrf:'token-prueba'});await n.window.versatoSesion;
 await n.window.fetch('/api/importaciones/cruzar',{method:'POST',body:'multipart-prueba'});let o=n.llamadas.at(-1)[1];assert.equal(o.headers.get('X-CSRF-Token'),'token-prueba');assert.equal(o.headers.get('Content-Type'),null);assert.equal(o.body,'multipart-prueba');
 await n.window.fetch('http://otro.test/api',{method:'POST'});assert.equal(n.llamadas.at(-1)[1].headers,undefined);
 await n.window.fetch('/api/stock');assert.equal(n.llamadas.at(-1)[1].headers,undefined);
 const form=new n.Formulario();form.submit();assert.equal(form.campos[0].name,'_csrf');assert.equal(form.campos[0].value,'token-prueba');assert(form.enviado);
});
test('La transición sin AUTH_ENABLED conserva las solicitudes existentes',async()=>{const n=navegador({habilitada:false});await n.window.fetch('/api/stock/actualizar',{method:'POST'});assert.equal(n.llamadas.at(-1)[1].headers,undefined);});
