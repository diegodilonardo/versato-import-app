const path=require('node:path');
const {actualizarMaestro}=require('./actualizarMaestro');
const {FIJOS_MODULO}=require('../config/reglasPresea');
const {COLUMNAS,prepararPresea}=require('./exportarPresea');
const XLSX=require('xlsx');
const CAMPOS=['ESTILO','COD_COLOR','COLOR','COD_MATERIAL','MATERIAL','SIZE_RUN','FECHA_ALTA','CODIGO','COD_ALFA','DETALLE','DMARCA','MODC','DMODC','NIVEL','COD_ALFABA','COD_ALFABA1'];
function maximosPorEAN(registros){
 const comparar=(campo,a,b)=>{
  if(campo==='CODIGO'&&/^\d+$/.test(a)&&/^\d+$/.test(b))return BigInt(a)>BigInt(b);
  if(campo==='MODC'){const x=/^([A-Z]+)(\d+)$/.exec(a),y=/^([A-Z]+)(\d+)$/.exec(b);if(x&&y)return BigInt(x[2])===BigInt(y[2])?a>b:BigInt(x[2])>BigInt(y[2]);}
  if(campo==='FECHA_ALTA'){const fecha=v=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);return m?m[3]+m[2]+m[1]:'';};return fecha(a)>fecha(b);}
  return a>b;
 };
 return Object.fromEntries(CAMPOS.map(c=>[c,registros.reduce((max,r)=>{const v=String(r[c]||'').trim();return !max||comparar(c,v,max)?v:max;},'')]));
}
function maximoMODC(valores){
 const lista=[...new Set(valores.filter(Boolean).map(v=>String(v).trim()))];
 const partes=lista.map(v=>/^([A-Z]+)(\d+)$/.exec(v));
 if(!lista.length||partes.some(p=>!p)||new Set(partes.map(p=>p[1])).size!==1)return null;
 return lista.reduce((max,v,i)=>BigInt(partes[i][2])>BigInt(/^([A-Z]+)(\d+)$/.exec(max)[2])?v:max,lista[0]);
}
function maximoMODCProducto(valores,propuestas,marca,asignadas=[]){
 const maximo=maximoMODC(valores);if(maximo)return maximo;
 // Las series históricas ML/VZ no comparten numeración con las actuales L/V.
 // Solo usar la serie actual cuando está confirmada por el maestro de modelos
 // que originó la propuesta. No convertir códigos existentes ni admitir otras marcas.
 const series={MOLECA:['L','ML'],VIZZANO:['V','VZ']}[normalizar(marca)];
 if(!series)return null;
 const prefijo=v=>/^([A-Z]+)\d+$/.exec(String(v||''))?.[1];
 if(propuestas.length){if(propuestas.some(p=>prefijo(p.MODC)!==series[0]||prefijo(p.ultimoMODC)!==series[0]))return null;}
 else if(!asignadas.length||asignadas.some(p=>prefijo(p.MODC)!==series[0]))return null;
 if(valores.some(v=>!series.includes(prefijo(v))))return null;
 return maximoMODC(valores.filter(v=>prefijo(v)===series[0]));
}
function parsearSueltos(texto, { soloPrecios = false } = {}) {
 const articulos = [];const indice=new Map(),alfas=new Set(),modelosPorProducto=new Map();let registros=0,sinEAN=0;
 for(const [i,l]of texto.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){if(!l.trim())continue;const a=l.split('|').map(v=>v.trim());if(a.length!==16)throw new Error(`Maestro de sueltos: fila ${i+1} inválida.`);if(a[0]==='ESTILO')continue;const r=Object.fromEntries(CAMPOS.map((c,j)=>[c,a[j]]));if(r.NIVEL!=='900')throw new Error('Nivel inválido en maestro de sueltos.');registros++;if (soloPrecios) { articulos.push({ CODIGO: r.CODIGO, COD_ALFA: r.COD_ALFA, DMODC: r.DMODC }); continue; }const producto=[r.ESTILO,r.COD_MATERIAL,r.COD_COLOR].join('.');if(!modelosPorProducto.has(producto))modelosPorProducto.set(producto,new Set());if(r.MODC)modelosPorProducto.get(producto).add(r.MODC);if(r.COD_ALFA)alfas.add(r.COD_ALFA.toUpperCase());const eans=[...new Set([r.COD_ALFABA1,r.COD_ALFABA].filter(v=>/^\d{13}$/.test(v)))];if(!eans.length){sinEAN++;continue;}for(const ean of eans){if(!indice.has(ean))indice.set(ean,[]);indice.get(ean).push(r);}}
 return soloPrecios ? { articulos, registros } : { indice, alfas, registros, sinEAN, modelosPorProducto };}
function actualizarSueltos(opciones){return actualizarMaestro({remoto:process.env.MAESTRO_SUELTOS_FTP_PATH||'/PRODUCTOS/MAESTROS_VERSATO/Maestro_Versato_sueltos.txt',destino:path.join(__dirname,'../../data/Maestro_Versato_sueltos.txt'),parsear:texto=>parsearSueltos(texto, opciones),maxBytes:120*1024*1024});}
const normalizar=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
function generarSueltos(productos,maestro,rubros,maestroModulos){
 const modelosHistoricos=new Map();if(maestroModulos?.disponible)for(const grupo of maestroModulos.indice.values())for(const r of grupo){const k=[r.ESTILO,r.COD_MATERIAL,r.COD_COLOR].join('.');if(!modelosHistoricos.has(k))modelosHistoricos.set(k,new Set());if(r.MODC)modelosHistoricos.get(k).add(r.MODC);}
 const filas=[];const alfas=new Set(maestro?.alfas||[]);if(maestroModulos?.disponible)for(const grupo of maestroModulos.indice.values())for(const r of grupo)if(r.COD_ALFA)alfas.add(r.COD_ALFA.toUpperCase());for(const r of productos.modulos?.filas||[])if(r.COD_ALFA)alfas.add(r.COD_ALFA);
 const partes=new Intl.DateTimeFormat('en',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>partes.find(p=>p.type===t).value;const fecha=`${part('year')}-${part('month')}-${part('day')}`,aa=part('year').slice(-2);
 for(const t of productos.talles){const eans=t.EAN.split(',').map(v=>v.trim()).filter(Boolean),errores=[];const ean=eans.length===1?eans[0]:null;const talle=t.TALLE.split('/')[0].trim();const r={PRODUCTO:t.PRODUCTO,TALLE_ORIGEN:t.TALLE,EAN:ean,TALLC:talle,DTALLC:talle,errores};
  filas.push(r);if(!maestro?.disponible){r.estado='PENDIENTE_MAESTRO';errores.push('No se pudo actualizar el maestro de sueltos.');continue;}
  if(!ean){r.estado='REVISAR';errores.push('Debe existir un único EAN por combinación.');continue;}
  const existentes=maestro.indice.get(ean)||[];const unicos=[...new Map(existentes.map(v=>[JSON.stringify(v),v])).values()];
  if(unicos.length){r.coincidenciasMaestro=unicos;r.datosMaestro=maximosPorEAN(unicos);r.MODC=r.datosMaestro.MODC;r.estado='ENCONTRADO';continue;}
  r.estado='NUEVO';if(t.estado!=='COINCIDE')errores.push('La combinación tiene diferencias en el cruce.');if(!/^\d{2}$/.test(talle))errores.push('El talle debe tener dos dígitos para formar COD_ALFA de 15 caracteres.');
  const p=productos.listado.find(p=>p.PRODUCTO===t.PRODUCTO);const propuestas=(productos.modulos?.filas||[]).filter(v=>v.PRODUCTO===t.PRODUCTO);const asignadas=productos.asignaciones.filter(a=>a.PRODUCTO===t.PRODUCTO&&a.estado==='ENCONTRADO');const modelos=[...new Set([...propuestas.map(v=>v.MODC),...asignadas.map(v=>v.MODC),...(maestro.modelosPorProducto?.get(t.PRODUCTO)||[]),...(modelosHistoricos.get(t.PRODUCTO)||[])].filter(Boolean))];
  const maximo=maximoMODCProducto(modelos,propuestas,p?.marcas?.length===1?p.marcas[0]:null,asignadas);if(!maximo)errores.push('No se pudo determinar un MODC máximo válido para el producto.');
  const base=propuestas[0];const marca=p?.marcas?.length===1?p.marcas[0]:null;const modc=maximo;const colores=p?.colores||[];const color=colores.length===1?colores[0]:null;const dmodc=p?`${p.STYLE.replaceAll('.','-')}-${p.MATERIAL}`:null;
  const rubro=base?.RUBROS||((p?.descripciones||[]).some(d=>/\bBOLSA\b/i.test(d))?3:1);const marcaCodigo=base?.MARCA||asignadas[0]?.MARCA; // se resuelve abajo desde el maestro de marcas
  Object.assign(r,FIJOS_MODULO,{CODIGO:null,NIVEL:900,COD_TEM:1,DCOD_TEM:'IN',MODC:modc,DMODC:dmodc,DMARCA:marca,MARCA:marcaCodigo||null,RUBROS:rubro,RUBRO:rubro===3?'ACCESORIOS':'CALZADO',CLASIFIC:'1',DCLASIFIC:'PRIMERA',COLORC:'00',DCOLORC:color,TALLC:talle,DTALLC:talle,PARES:1,COD_ALFABA:ean,COD_ALFAB1:'',COD_ANO:aa,FECHA_ALTA:fecha,COD_ALFA:modc?`${aa}11${modc}100${talle}`:null});
  r.DETALLE=dmodc&&color?`${dmodc} ${color} - SUELTO: ${talle}`:null;r.NOMB_ART=dmodc&&color?`${dmodc} | ${color} | ${talle}`:null;
  const k=JSON.stringify([normalizar(marca),String(rubro),'SUELTOS']);const valores=rubros?.disponible?[...(rubros.indice.get(k)||[])]:[];r.RUBRO_FACT=valores.length===1?valores[0]:null;
  if(!r.COD_ALFA||!/^[A-Z0-9]{15}$/.test(r.COD_ALFA))errores.push('COD_ALFA inválido: debe tener 15 caracteres.');else if(alfas.has(r.COD_ALFA))errores.push('COD_ALFA ya existe en un maestro o módulo propuesto.');
 }
 const nuevos=filas.filter(r=>r.estado==='NUEVO'),porAlfa=new Map(),porEAN=new Map();for(const r of nuevos){for(const [map,key]of [[porAlfa,r.COD_ALFA],[porEAN,r.EAN]]){if(!key)continue;if(!map.has(key))map.set(key,[]);map.get(key).push(r);}}
 for(const [map,motivo]of [[porAlfa,'COD_ALFA repetido en los sueltos propuestos.'],[porEAN,'EAN repetido entre distintas combinaciones.']])for(const grupo of map.values())if(grupo.length>1)for(const r of grupo)r.errores.push(motivo);
 productos.sueltos={filas,maestro:{disponible:!!maestro?.disponible,archivo:maestro?.archivo,actualizado:maestro?.actualizado,huella:maestro?.huella,registros:maestro?.registros,sinEAN:maestro?.sinEAN,mensaje:maestro?.mensaje}};return productos;
}
function completarSueltos(productos,marcas){for(const r of productos.sueltos.filas){if(r.estado!=='NUEVO')continue;const marca=marcas?.disponible?marcas.indice.get(normalizar(r.DMARCA)):null;r.MARCA=marca?Number(marca.codigo):null;if(marca)r.DMARCA=marca.descripcion;for(const c of COLUMNAS)if(!['CODIGO','COD_ALFAB1'].includes(c)&&(r[c]==null||r[c]===''))r.errores.push(`Falta ${c}.`);if(r.errores.length)r.estado='REVISAR';}return productos;}
function prepararSueltos(resultado){const s=resultado.productos.sueltos;const bloqueo=prepararPresea(resultado);const mensaje=!s?.maestro.disponible?'No se pudo actualizar el maestro de sueltos.':bloqueo.mensaje;const filas=(s?.filas||[]).filter(r=>r.estado==='NUEVO'&&!r.errores.length);return{filas,listos:mensaje?0:filas.length,bloqueada:!!mensaje,mensaje};}
function exportarSueltos(resultado){const p=prepararSueltos(resultado);if(p.bloqueada||!p.filas.length)throw Object.assign(new Error(p.mensaje||'No hay sueltos nuevos válidos para exportar.'),{status:422});const ws=XLSX.utils.aoa_to_sheet([COLUMNAS,...p.filas.map(r=>COLUMNAS.map(c=>c==='FECHA_ALTA'?{t:'n',v:Date.parse(r[c]+'T00:00:00Z')/86400000+25569,z:'dd/mm/yyyy'}:r[c]))]);ws['!cols']=COLUMNAS.map(c=>({wch:['DETALLE','NOMB_ART'].includes(c)?65:20}));const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,ws,'Hoja1');return XLSX.write(w,{type:'buffer',bookType:'xlsx',compression:true});}
module.exports={maximosPorEAN,maximoMODC,parsearSueltos,actualizarSueltos,generarSueltos,completarSueltos,prepararSueltos,exportarSueltos};
