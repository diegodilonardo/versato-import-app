const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash}=require('node:crypto');
const { actualizarMaestro } = require('./actualizarMaestro');
const REMOTO = '/STOCK/VERSATO/FILE_STOCK_VERSATO.TXT';
const archivo = path.join(__dirname, '../../data/FILE_STOCK_VERSATO.TXT');
let actualizando, preciosCache;

function parsearStock(texto) {
  const filas = [];
  for (const [i, linea] of texto.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!linea.trim()) continue;
    const c = linea.split('|').map(v => v.trim());
    if (c.length !== 21 || !/^\d+$/.test(c[2]) || !['900','950'].includes(c[10]) ||
        !/^\d+$/.test(c[18]) || !/^-?\d+(?:\.\d+)?$/.test(c[20]) || !/^\d+(?:\.\d+)?$/.test(c[7])) {
      throw new Error(`Stock: formato inválido en la fila ${i + 1}. Se conservó la copia anterior.`);
    }
    filas.push({ marca:c[0], rubro:c[1], codigo:c[2], alfa:c[3], modelo:c[4], detalle:c[5], color:c[6],
      paresUnidad:Number(c[7]), curva:c[8], sexo:c[9], tipo:c[10] === '950' ? 'Módulo' : 'Suelto',
      codigoColor:c[11], colorCompleto:c[12], material:c[14], deposito:c[18], nombreDeposito:c[19], cantidad:Number(c[20]) });
  }
  return { registros:filas.length, filas };
}

async function actualizar() {
  if (actualizando) return actualizando;
  actualizando = (async () => {
    let anterior;try{anterior=createHash('sha256').update(await fs.readFile(archivo)).digest('hex');}catch(e){if(e.code!=='ENOENT')throw e;}
    const r = await actualizarMaestro({ remoto:REMOTO, destino:archivo, parsear:parsearStock });
    if (!r.disponible) throw Object.assign(new Error('No se pudo actualizar el stock desde el FTP. La copia anterior se conserva.'), {status:502});
    if(anterior!==r.huella)preciosCache = null;
    return catalogo();
  })();
  try { return await actualizando; } finally { actualizando = null; }
}

async function leer() {
  try {
    const b = await fs.readFile(archivo);
    let texto;
    try { texto = new TextDecoder('utf-8', {fatal:true}).decode(b); }
    catch { texto = new TextDecoder('windows-1252').decode(b); }
    return {...parsearStock(texto), huella:createHash('sha256').update(b).digest('hex'),fecha:(await fs.stat(archivo)).mtime.toISOString()};
  } catch (e) {
    if (e.code === 'ENOENT') throw Object.assign(new Error('Primero actualizá el stock desde FTP.'), {status:422});
    throw e;
  }
}

async function catalogo() {
  const s = await leer();
  return { fecha:s.fecha,huella:s.huella,registros:s.registros, origen:REMOTO,
    depositos:[...new Map(s.filas.map(r=>[r.deposito,{codigo:r.deposito,nombre:r.nombreDeposito}])).values()].sort((a,b)=>Number(a.codigo)-Number(b.codigo)),
    marcas:[...new Set(s.filas.map(r=>r.marca))].sort(), listas:['03','04','05','980'] };
}

const clavePrecio = (codigo, alfa, lista) => JSON.stringify([codigo,alfa,String(Number(lista))]);
async function precios(filas, fechaStock) {
  const fuente = require('./listaPreseaSQL');
  const meta = await fuente.leerCopia();
  if (!meta) throw Object.assign(new Error('Actualizá primero la lista de precios de Presea en la sección Precios.'), {status:422});
  const id = meta.huella + fechaStock;
  if (preciosCache?.id === id) return preciosCache.promesa;
  const buscados = new Set(filas.map(r=>JSON.stringify([r.codigo,r.alfa]))), valores = new Map();
  const promesa = fuente.compararCopia({
    linea(linea) {
      if (!linea.trim()) return;
      const c = require('./maestroPrecios').camposPrecio(linea);
      if (c[5] !== '1' || !buscados.has(JSON.stringify([c[2],c[3]]))) return;
      const k = clavePrecio(c[2],c[3],c[4]);
      if (!valores.has(k)) valores.set(k,new Set());
      valores.get(k).add(Math.round(Number(c[6])*100)/100);
    }, resultado() { return {valores}; }
  }).then(r=>({valores:r.valores,fecha:r.fecha}));
  preciosCache = {id,promesa};
  try { return await promesa; } catch(e) { if(preciosCache?.id===id)preciosCache=null; throw e; }
}

function agrupar(filas, listas, separar) {
  const grupos = new Map();
  for (const r of filas) {
    const k = JSON.stringify([separar?r.deposito:'',r.marca,r.modelo,r.codigoColor,r.color,r.tipo,r.tipo==='Módulo'?r.curva:'']);
    if (!grupos.has(k)) grupos.set(k,{marca:r.marca,modelo:r.modelo,color:r.color,codigoColor:r.codigoColor,
      deposito:separar?`${r.deposito} · ${r.nombreDeposito}`:'Depósitos sumados',tipo:r.tipo,curva:r.tipo==='Módulo'?r.curva:'',
      talles:{},cantidad:0,totalPares:0,precios:Object.fromEntries(listas.map(l=>[l,new Set()]))});
    const g=grupos.get(k);
    g.cantidad+=r.cantidad; g.totalPares+=r.cantidad*r.paresUnidad;
    if(r.tipo==='Suelto')g.talles[r.curva]=(g.talles[r.curva]||0)+r.cantidad;
    else {
      // Distribuir únicamente las curvas explícitas cuya suma coincide con el módulo.
      const partes=r.curva.split(/\s+/).map(v=>/^(\d+(?:\/\d+)?):(\d+)$/.exec(v));
      if(partes.length && partes.every(Boolean) && partes.reduce((s,p)=>s+Number(p[2]),0)===r.paresUnidad) {
        for(const p of partes)g.talles[p[1]]=(g.talles[p[1]]||0)+Number(p[2])*r.cantidad;
      }
    }
    for(const l of listas)g.precios[l].add(r.precios[l]??'Sin precio');
  }
  return [...grupos.values()].map(g=>({...g,precios:Object.fromEntries(listas.map(l=>{
    const vs=[...g.precios[l]];
    return [l,vs.length===1?vs[0]:'Varía / revisar detalle'];
  }))})).sort((a,b)=>a.marca.localeCompare(b.marca)||a.modelo.localeCompare(b.modelo, 'es', {numeric:true})||a.color.localeCompare(b.color));
}

async function generar(opciones) {
  const s=await leer();
  const elegir=(valor,permitidos)=>String(valor||'').split(',').filter(v=>permitidos.includes(v));
  const depositos=elegir(opciones.depositos,[...new Set(s.filas.map(r=>r.deposito))]);
  const marcas=elegir(opciones.marcas,[...new Set(s.filas.map(r=>r.marca))]);
  const listas=elegir(opciones.listas,['03','04','05','980']);
  if(!depositos.length||!marcas.length||!listas.length)throw Object.assign(new Error('Elegí al menos un depósito, una marca y una lista de precios.'),{status:422});
  const p=await precios(s.filas,s.fecha);
  const normalizar=v=>v.toUpperCase().replace(/[.\-\s]/g,'');
  const buscar=normalizar(String(opciones.buscar||'').slice(0,100));
  const filas=s.filas.filter(r=>depositos.includes(r.deposito)&&marcas.includes(r.marca)&&r.cantidad!==0&&
    (!opciones.tipo||r.tipo===opciones.tipo)&&(!buscar||normalizar([r.codigo,r.alfa,r.modelo,r.color].join(' ')).includes(buscar)))
    .map(r=>({...r,precios:Object.fromEntries(listas.map(l=>{
      const vs=[...(p.valores.get(clavePrecio(r.codigo,r.alfa,l))||[])];
      return [l,vs.length===1?vs[0]:vs.length?'En conflicto':null];
    }))}));
  const grupos=agrupar(filas,listas,opciones.separar!=='no');
  return {fecha:s.fecha,fechaPrecios:p.fecha,listas,filas,grupos,
    talles:[...new Set(grupos.flatMap(g=>Object.keys(g.talles)))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true})),
    resumen:{productos:filas.length,grupos:grupos.length,modulos:filas.filter(r=>r.tipo==='Módulo').reduce((a,r)=>a+r.cantidad,0),
      pares:filas.reduce((a,r)=>a+r.cantidad*r.paresUnidad,0),sinPrecio:filas.filter(r=>listas.some(l=>r.precios[l]===null)).length} };
}

function excel(datos) {
  const XLSX=require('xlsx'), libro=XLSX.utils.book_new();
  const cabecera=['Depósito','Marca','Modelo','Código color','Color','Tipo','Curva',...datos.talles,'Cantidad','Total pares',...datos.listas.map(l=>'Precio '+l)];
  const matriz=[cabecera,...datos.grupos.map(g=>[g.deposito,g.marca,g.modelo,g.codigoColor,g.color,g.tipo,g.curva,...datos.talles.map(t=>g.talles[t]??''),g.cantidad,g.totalPares,...datos.listas.map(l=>g.precios[l])])];
  const hoja=XLSX.utils.aoa_to_sheet(matriz);
  hoja['!cols']=cabecera.map((c,i)=>({wch:i===0?28:i===2?22:c.includes('Precio')?24:18}));
  hoja['!autofilter']={ref:hoja['!ref']};
  XLSX.utils.book_append_sheet(libro,hoja,'Grilla de stock');
  const detalle=datos.filas.map(r=>({'Depósito':r.deposito,'Nombre depósito':r.nombreDeposito,'Código':r.codigo,'COD_ALFA':r.alfa,
    'Marca':r.marca,'Modelo':r.modelo,'Código color':r.codigoColor,'Color':r.color,'Tipo':r.tipo,'Talle / curva':r.curva,
    'Cantidad':r.cantidad,'Pares por unidad':r.paresUnidad,'Total pares':r.cantidad*r.paresUnidad,
    ...Object.fromEntries(datos.listas.map(l=>['Precio '+l,r.precios[l]??'Sin precio']))}));
  XLSX.utils.book_append_sheet(libro,XLSX.utils.json_to_sheet(detalle),'Detalle por producto');
  XLSX.utils.book_append_sheet(libro,XLSX.utils.aoa_to_sheet([
    ['Stock actualizado',datos.fecha],['Precios Presea actualizados',String(datos.fechaPrecios)],
    ['Listas',datos.listas.join(', ')],['Total pares',datos.resumen.pares],
    ['Criterio','Precios de Presea, versión 1, por código interno y COD_ALFA. Precio del módulo completo o de un suelto.'],
    ['Módulos','Se distribuyen pares por talle solo cuando hay una curva explícita y su suma coincide con los pares del módulo.']
  ]),'Información');
  return XLSX.write(libro,{type:'buffer',bookType:'xlsx'});
}
module.exports={parsearStock,agrupar,actualizar,catalogo,generar,excel};
