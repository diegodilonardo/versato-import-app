const path=require('node:path');const {actualizarMaestro}=require('./actualizarMaestro');
const normalizar=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const clave=(marca,rubro,tipo)=>JSON.stringify([normalizar(marca),String(rubro).trim(),normalizar(tipo)]);
function parsearRubrosFact(texto){
 const indice=new Map();let registros=0;
 for(const [i,l]of texto.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
  if(!l.trim())continue;const c=l.split('|').map(v=>v.trim());
  if(c.length!==6||!c[1]||!/^\d+$/.test(c[3])||!c[4]||!c[5])throw new Error(`Maestro de rubros de facturación: fila ${i+1} inválida.`);
  const k=clave(c[1],c[3],c[4]);if(!indice.has(k))indice.set(k,new Set());indice.get(k).add(c[5]);registros++;
 }
 return{indice,registros};
}
function actualizarRubrosFact(){return actualizarMaestro({remoto:process.env.MAESTRO_RUBROS_FACT_FTP_PATH||'/PRODUCTOS/MAESTROS_VERSATO/Maestro_Rubro_Fa.TXT',destino:path.join(__dirname,'../../data/Maestro_Rubro_Fa.TXT'),parsear:parsearRubrosFact});}
function completarRubrosFact(productos,maestro){
 if(!productos.modulos)return productos;
 for(const r of productos.modulos.filas){
  const valores=maestro?.disponible?[...(maestro.indice.get(clave(r.DMARCA,r.RUBROS,'MODULOS'))||[])]:[];
  r.RUBRO_FACT=valores.length===1?valores[0]:null;
  r.erroresDatos=r.erroresDatos||[];
  if(!r.RUBRO_FACT){r.erroresDatos.push(!maestro?.disponible?'Maestro de rubros de facturación no disponible.':valores.length?'RUBRO_FACT ambiguo para marca, rubro y MODULOS.':'No hay RUBRO_FACT para marca, rubro y MODULOS.');r.estado='REVISAR_DATOS_MODULO';}
 }
 productos.modulos.maestroRubrosFact={disponible:!!maestro?.disponible,actualizado:maestro?.actualizado||null,huella:maestro?.huella||null};
 productos.modulos.resumen.pendientes=productos.modulos.filas.filter(r=>!r.MODC||!r.COD_ALFA||r.errorCodAlfa||r.erroresDatos.length).length;
 productos.modulos.nota+=' RUBRO_FACT: coincidencia por marca + código de rubro + MODULOS en Maestro_Rubro_Fa.TXT. No se toman rubros de SUELTOS como alternativa.';
 return productos;
}
module.exports={parsearRubrosFact,actualizarRubrosFact,completarRubrosFact};
