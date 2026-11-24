const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
let generando=false;
function nombreGrilla(nombre){
 const vista=(typeof nombre==='string'?nombre:'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'').slice(0,80).trim()||'Sin vista';
 return `Grilla Stock - ${vista} - Vendedores`;
}

function prepararFilas(datos,separar=true){
 const grupos=new Map();
 for(const f of datos.filas){
  const clave=JSON.stringify([separar?f.deposito:'',f.codigo,f.alfa,f.modelo,f.codigoColor,f.color,f.curva,f.tipo,f.paresUnidad,f.precios]);
  if(!grupos.has(clave)){
   const modelo=f.modelo.replace(/-/g,'.');
   const productoFoto=f.codigoColor&&!modelo.endsWith('.'+f.codigoColor)?modelo+'.'+f.codigoColor:modelo;
   grupos.set(clave,{...f,cantidad:0,productoFoto,depositoTexto:separar?`${f.deposito} · ${f.nombreDeposito}`:'Depósitos sumados'});
  }
  grupos.get(clave).cantidad+=f.cantidad;
 }
 return [...grupos.values()].sort((a,b)=>a.marca.localeCompare(b.marca)||a.modelo.localeCompare(b.modelo,'es',{numeric:true})||a.color.localeCompare(b.color)||a.alfa.localeCompare(b.alfa));
}

function dimensiones(buffer){
 if(buffer.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return [buffer.readUInt32BE(16),buffer.readUInt32BE(20)];
 if(buffer[0]===255&&buffer[1]===216){
  let i=2;
  while(i+9<buffer.length){
   if(buffer[i++]!==255)break;
   const tipo=buffer[i++];if(tipo===216||tipo===217)continue;
   const n=buffer.readUInt16BE(i);if(n<2)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(tipo))return [buffer.readUInt16BE(i+5),buffer.readUInt16BE(i+3)];
   i+=n;
  }
 }
 return [120,90];
}

async function fotosPara(filas){
 const {sql,conectar,habilitada}=require('./sqlServer');
 if(!habilitada())return {};
 const pool=await conectar(),productos=[...new Set(filas.map(f=>f.productoFoto))];
 const resultado=await pool.request().input('productos',sql.NVarChar(sql.MAX),JSON.stringify(productos)).query(`
 WITH fotos AS (
  SELECT f.Producto,f.Tipo,f.Contenido,ROW_NUMBER() OVER(PARTITION BY f.Producto ORDER BY a.Creado DESC,a.Id DESC) posicion
  FROM versato.ImagenesProducto f JOIN versato.Analisis a ON a.Id=f.AnalisisId
  JOIN OPENJSON(@productos) p ON f.Producto=p.value COLLATE Latin1_General_100_BIN2
 ) SELECT Producto,Tipo,Contenido FROM fotos WHERE posicion=1`);
 const locales=await require('./repositorioImagenes').fotosProductos(productos);
 const preferidas=new Map(resultado.recordset.map(f=>[f.Producto,f]));
 for(const [Producto,f]of locales)preferidas.set(Producto,{Producto,...f});
 const fotos={};
 for(const f of preferidas.values()){
  if(!['image/png','image/jpeg'].includes(f.Tipo))continue;
  const [w,h]=dimensiones(f.Contenido),escala=Math.min(130/w,106/h);
  fotos[f.Producto]={dataUrl:`data:${f.Tipo};base64,${f.Contenido.toString('base64')}`,width:Math.round(w*escala),height:Math.round(h*escala)};
 }
 return fotos;
}

async function exportar(datos,opciones={}){
 if(generando)throw Object.assign(new Error('Hay una grilla en preparación. Esperá a que termine para descargar otra.'),{status:409});
 if(!datos.filas.length)throw Object.assign(new Error('No hay productos para exportar con esta selección.'),{status:422});
 generando=true;
 let carpeta;
 try{
  const filas=prepararFilas(datos,opciones.separar!=='no').filter(f=>f.cantidad>0);
  if(!filas.length)throw Object.assign(new Error('No hay stock disponible para exportar con esta selección.'),{status:422});
  const marcasPlantilla=['VIZZANO','MODARE','MOLECA','MOLEKINHA','MOLEKINHO','BEIRA RIO','BR SPORT','ACTVITTA'];
  const faltantes=[...new Set(filas.map(f=>f.marca))].filter(m=>!marcasPlantilla.includes(m));
  if(faltantes.length)throw Object.assign(new Error('La plantilla original no contiene solapa para '+faltantes.join(', ')+'. Quitá esas marcas de la selección para conservar el formato original.'),{status:422});
  const fotos=await fotosPara(filas);
  const fecha=v=>new Date(v).toLocaleString('es-AR',{timeZone:'America/Buenos_Aires'});
  const listas=[...new Set(datos.listas)];
  const separar=opciones.separar!=='no';
  const nombre=nombreGrilla(opciones.nombreVista);
  const entrada={filas,listas,fotos,separar,nombreArchivo:nombre,fechaTexto:fecha(datos.fecha),fechaPreciosTexto:fecha(datos.fechaPrecios)};
  carpeta=await fs.mkdtemp(path.join(os.tmpdir(),'versato-grilla-'));
  const salida=path.join(carpeta,'grilla.xlsx');
  const python=process.env.STOCK_EXCEL_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  const plantilla=path.join(__dirname,'../config/plantillas/Grilla Versato Stock - Vendedores.xlsx');
  await new Promise((resolve,reject)=>{
   const proceso=spawn(python,[path.join(__dirname,'../../scripts/plantilla-grilla.py'),plantilla,salida],{windowsHide:true,stdio:['pipe','ignore','pipe']});
   let error='';
   proceso.stderr.on('data',b=>{error=(error+b).slice(-3000);});
   proceso.on('error',reject);
   proceso.on('close',codigo=>codigo===0?resolve():reject(new Error('No se pudo completar la grilla con la plantilla original. Revisá el registro de la aplicación.',{cause:new Error(error)})));
   proceso.stdin.on('error',()=>{});
   proceso.stdin.end(JSON.stringify(entrada));
  });
  const cantidad=listas.length*(separar?new Set(filas.map(f=>f.deposito)).size:1);
  return {buffer:await fs.readFile(salida),tipo:cantidad>1?'application/zip':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   nombre:nombre+'.'+(cantidad>1?'zip':'xlsx')};
 }finally{
  if(carpeta){
   for(const nombre of ['grilla.xlsx','grilla.xlsx.inspect.ndjson'])await fs.rm(path.join(carpeta,nombre),{force:true}).catch(()=>{});
   await fs.rmdir(carpeta).catch(()=>{});
  }
  generando=false;
 }
}
module.exports={prepararFilas,dimensiones,exportar,nombreGrilla};
