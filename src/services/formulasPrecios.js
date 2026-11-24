const fallo=m=>Object.assign(new Error(m),{status:422});
function compilar(expresion,permitidas){
 if(typeof expresion!=='string'||!expresion.trim()||expresion.length>500)throw fallo('Completá una fórmula de hasta 500 caracteres.');
 const s=expresion.toUpperCase(),tokens=[];let pos=0;
 while(pos<s.length){if(/\s/.test(s[pos])){pos++;continue;}const m=/^(?:\d+(?:\.\d+)?|[A-Z][A-Z0-9_]*|[()+*/-])/.exec(s.slice(pos));if(!m)throw fallo('La fórmula solo admite números, variables y operaciones + - * / ( ).');tokens.push(m[0]);pos+=m[0].length;if(tokens.length>150)throw fallo('La fórmula es demasiado extensa.');}
 let i=0;
 function factor(){const t=tokens[i++];if(t==='+'||t==='-')return {op:t==='-'?'neg':'pos',a:factor()};if(t==='('){const a=suma();if(tokens[i++]!==')')throw fallo('Falta cerrar un paréntesis.');return a;}if(/^\d/.test(t||''))return {valor:Number(t)};if(/^[A-Z][A-Z0-9_]*$/.test(t||'')){if(!permitidas.has(t))throw fallo('Variable no definida: '+t);return {variable:t};}throw fallo('La fórmula está incompleta.');}
 function producto(){let a=factor();while(['*','/'].includes(tokens[i])){const op=tokens[i++];a={op,a,b:factor()};}return a;}
 function suma(){let a=producto();while(['+','-'].includes(tokens[i])){const op=tokens[i++];a={op,a,b:producto()};}return a;}
 const ast=suma();if(i!==tokens.length)throw fallo('Revisá los operadores y paréntesis de la fórmula.');
 function evaluar(n,v){if('valor'in n)return n.valor;if(n.variable)return v[n.variable];const a=evaluar(n.a,v);if(n.op==='neg')return -a;if(n.op==='pos')return a;const b=evaluar(n.b,v);if(n.op==='/'&&b===0)throw fallo('División por cero en la fórmula.');return n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'?a*b:a/b;}
 return valores=>{const r=evaluar(ast,valores);if(!Number.isFinite(r)||r<0)throw fallo('La fórmula produjo un precio negativo o no válido.');return r;};
}
function validarConfiguracion(c){
 if(!c||!c.parametros||typeof c.parametros!=='object'||Array.isArray(c.parametros)||Object.keys(c.parametros).length>30)throw fallo('Revisá los parámetros de cálculo.');
 for(const [k,v]of Object.entries(c.parametros))if(!/^[A-Z][A-Z0-9_]{0,39}$/.test(k)||['FOB','PRECIO_MAYORISTA','PRECIO_PUBLICO','CONSTRUCTOR','PROTOTYPE'].includes(k)||typeof v!=='number'||!Number.isFinite(v))throw fallo('Parámetro inválido: '+k);
 if(!Number.isInteger(c.decimales)||c.decimales<0||c.decimales>6)throw fallo('Elegí entre 0 y 6 decimales.');
 const mayorista=compilar(c.formulaMayorista,new Set(['FOB',...Object.keys(c.parametros)])),publico=compilar(c.formulaPublico,new Set(['FOB','PRECIO_MAYORISTA',...Object.keys(c.parametros)]));
 return {mayorista,publico};
}
function calcularPrecios(filas,c){const f=validarConfiguracion(c),errores=[],resultado=filas.map(r=>{try{if(r.marcas.length!==1)throw fallo('El modelo aparece en varias marcas: '+r.marcas.join(', '));const variables={...c.parametros,FOB:r.fobMaximo},m=f.mayorista(variables),p=f.publico({...variables,PRECIO_MAYORISTA:m}),redondear=v=>Math.round((v+Number.EPSILON)*10**c.decimales)/10**c.decimales;return {...r,precioMayorista:redondear(m),precioPublico:redondear(p)};}catch(e){errores.push({modelo:r.modelo,motivo:e.message});return {...r,precioMayorista:null,precioPublico:null};}});return {filas:resultado,errores};}
module.exports={compilar,validarConfiguracion,calcularPrecios};
