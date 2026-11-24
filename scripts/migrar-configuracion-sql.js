require('../src/config/entorno');
const fs=require('node:fs/promises'),path=require('node:path');
const bd=require('../src/services/sqlServer');
async function ejecutar(){
 if(!bd.habilitada())throw Error('Configurá SQL_ENABLED=true antes de migrar.');
 const vistas=await require('../src/services/vistasStock').leer();
 console.log('Vistas guardadas en SQL:',vistas.length);
 const historial=await require('../src/services/documentosAppSQL').leer('grillas-programadas',async()=>{
  try{return JSON.parse(await fs.readFile(path.join(__dirname,'../data/grillas-programadas.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}
 });
 console.log('Estados de grillas en SQL:',Object.keys(historial.estados||{}).length);
 try{const clientes=await require('../src/services/clientesSQL').leer();console.log('Registros de clientes en SQL:',clientes.maestro.registros);}catch(e){if(e.code!=='ENOENT')throw e;console.log('Sin maestro local de clientes: sincronizalo una vez desde la app.');}
}
ejecutar().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>bd.cerrar());
