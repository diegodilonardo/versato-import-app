require('../src/config/entorno');
const fs=require('node:fs/promises'),path=require('node:path'),bd=require('../src/services/sqlServer');
async function ejecutar(){
 if(!bd.habilitada())throw Error('Configurá SQL_ENABLED=true antes de migrar.');
 const archivo=path.resolve(process.argv[2]||path.join(__dirname,'../data/precios-coeficientes.json'));
 let local;try{local=JSON.parse((await fs.readFile(archivo,'utf8')).replace(/^\uFEFF/,''));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(local&&(!Array.isArray(local.historial)||!local.historial.length))throw Error('El archivo no contiene un historial de coeficientes para importar.');
 const servicio=require('../src/services/documentosAppSQL');
 const configuracion=local?await servicio.cambiar('precios-coeficientes',()=>local,actual=>actual.historial?.length?actual:local):await require('../src/services/almacenCoeficientes').leer();
 if(!configuracion.historial?.length)throw Error('No hay coeficientes en SQL ni un archivo local para importar. Recuperá precios-coeficientes.json de la instalación anterior.');
 const anterior=await require('../src/services/almacenCoeficientes').leerAnterior();
 console.log('Vigencias de coeficientes en SQL:',configuracion.historial.length);
 console.log('Historial anterior en SQL:',anterior.historial?.length||0);
 console.log('Una configuración SQL existente con vigencias se conserva sin reemplazarla.');
}
ejecutar().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>bd.cerrar());
