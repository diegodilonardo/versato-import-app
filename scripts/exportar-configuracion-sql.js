const fs=require('node:fs/promises'),path=require('node:path');
async function exportar(){
 const raiz=path.resolve(process.argv[3]||path.join(__dirname,'../data')),destino=path.resolve(process.argv[2]||path.join(__dirname,'../../outputs/007_configuracion_y_clientes_con_datos.sql'));
 let texto='USE [FC_VERSATO_APP];\nGO\n'+await fs.readFile(path.join(__dirname,'../sql/007_configuracion_y_clientes.sql'),'utf8')+'\nGO\n';
 const documentos=[];
 for(const [clave,nombre] of [['vistas-stock','vistas-stock.json'],['grillas-programadas','grillas-programadas.json'],['precios-coeficientes','precios-coeficientes.json'],['precios-vigencias-anteriores','precios-vigencias.json']]){
  try{let d=JSON.parse((await fs.readFile(path.join(raiz,nombre),'utf8')).replace(/^\uFEFF/,''));if(clave==='vistas-stock'){if(d.version!==1||!Array.isArray(d.vistas))throw Error('Archivo de vistas inválido.');d=d.vistas;}documentos.push([clave,d]);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 try{const f=path.join(raiz,'Clientes_Versato.TXT'),buffer=await fs.readFile(f),stat=await fs.stat(f);const d={contenido:buffer.toString('base64'),fecha:stat.mtime.toISOString()};if(!require('../src/services/clientesSQL').analizar(d).maestro.registros)throw Error('Maestro de clientes vacío.');documentos.push(['maestro-clientes',d]);}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const [clave,d]of documentos){const json=JSON.stringify(d).replace(/'/g,"''");texto+=`-- Importa solo si todavía no hay una copia en SQL. Nunca reemplaza una restauración.\nIF NOT EXISTS(SELECT 1 FROM versato.DocumentosApp WHERE Clave='${clave}')\n INSERT versato.DocumentosApp(Clave,Contenido)VALUES('${clave}',N'${json}');\nGO\n`;}
 await fs.mkdir(path.dirname(destino),{recursive:true});await fs.writeFile(destino,'\uFEFF'+texto,'utf8');console.log('Archivo SQL preparado:',destino);console.log('Documentos incluidos:',documentos.map(d=>d[0]).join(', '));
}
exportar().catch(e=>{console.error(e.message);process.exitCode=1;});
