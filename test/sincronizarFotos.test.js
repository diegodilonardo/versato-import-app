const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('eliminar ubicación confirma dentro de la fila y actualiza el listado sin recargar',async()=>{
 class Elemento{constructor(){this.children=[];this.disabled=false;}append(...h){this.children.push(...h);}replaceChildren(...h){this.children=h;}querySelectorAll(tipo){return this.children.flatMap(c=>[...(c.tag===tipo?[c]:[]),...c.querySelectorAll(tipo)]);}focus(){}reset(){} }
 const elementos=new Map(),el=id=>{if(!elementos.has(id))elementos.set(id,new Elemento());return elementos.get(id);};
 const fuente={id:'id-prueba',revision:'revision-prueba',nombre:'Prueba',ruta:'C:\\Fotos',prioridad:100,activa:true};let borrada=false,lecturas=0;
 const contexto={document:{getElementById:el,createElement:tag=>Object.assign(new Elemento(),{tag})},window:{addEventListener(){},dispatchEvent(){}},fetch:async(url,opciones)=>{
 if(opciones?.method==='DELETE'){assert.equal(JSON.parse(opciones.body).revision,fuente.revision);borrada=true;return{ok:true,json:async()=>({eliminada:true})};}
 lecturas++;return{ok:true,json:async()=>({disponible:true,ubicaciones:[fuente]})};
 },setTimeout,clearTimeout,setInterval,clearInterval,Date,Event};
 vm.runInNewContext(fs.readFileSync('public/sincronizarFotos.js','utf8'),contexto);await new Promise(setImmediate);
 const cuerpo=el('foto-ubicaciones-filas');assert.equal(cuerpo.children.length,1);
 cuerpo.querySelectorAll('button').find(b=>b.textContent==='Eliminar').onclick();assert.equal(borrada,false);
 const confirmar=cuerpo.querySelectorAll('button').find(b=>b.textContent==='Confirmar eliminación');assert.ok(confirmar);await confirmar.onclick();
 assert.equal(borrada,true);assert.equal(cuerpo.children.length,0);assert.equal(lecturas,1);assert.match(el('foto-ubicaciones-estado').textContent,/Ubicación eliminada/);
});
