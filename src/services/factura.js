const XLSX = require('xlsx');
const { leerLibro } = require('./leerLibro');
const { normalizar } = require('./detectarArchivo');
function leerFactura(buffer, d, incluirRegistros = false) {
  const campos = [['STYLE','STYLE'],['MATERIAL_CODE','MATERIAL CODE'],['COLOR_CODE','COLOR CODE'],['SIZE_RUN','SIZE RUN'],['BOXES','BOXES'],['PAIRS','PAIRS'],['UNIT','UNIT'],['AMOUNT','AMOUNT']];
  const mapeo = campos.map(([destino, origen]) => {
    const hs = d.encabezados.filter(h => h.normalizado === normalizar(origen));
    if (!hs.length) throw Object.assign(new Error(`Factura: falta la columna ${origen}. Corregí el archivo de origen y volvé a cargarlo.`),{status:422});
    if (hs.length > 1) throw Object.assign(new Error(`Factura: la columna ${origen} está duplicada.`),{status:422});
    return {destino,origen,columna:hs[0].columna};
  });
  const marca = d.encabezados.find(h => h.normalizado === 'BRAND');
  if (marca) mapeo.push({ destino:'MARCA', origen:'BRAND', columna:marca.columna, opcional:true });
  const libro = leerLibro(buffer, { sheets:[d.hoja], sheetRows:50101 });
  const ws = libro.Sheets[d.hoja];
  const rango = XLSX.utils.decode_range(ws['!fullref'] || ws['!ref']);
  if (rango.e.r - d.filaEncabezados > 50000) throw Object.assign(new Error('Factura: supera las 50.000 filas.'),{status:422});
  const registros = []; let auxiliares = 0, totalDeclarado = null, paresDeclarados = null;
  const numerosFactura = new Set();
  for (let r = 0; r < d.filaEncabezados - 1; r++) for (let c=0;c<=Math.min(rango.e.c,255);c++) {
    const texto = String(ws[XLSX.utils.encode_cell({r,c})]?.v || '');
    const m = /FACTURA(?:\s+PROFORMA)?\s*:\s*(\d+\s*\/\s*\d{4})/i.exec(texto);
    if (m) numerosFactura.add(m[1].replace(/\s/g,''));
  }
  for (let fila=d.filaEncabezados+1;fila<=rango.e.r+1;fila++) {
    const datos={}, valores={},errores=[];
    for (const m of mapeo) {
      const cell=ws[`${m.columna}${fila}`];
      datos[m.destino]=cell?XLSX.utils.format_cell(cell).trim():'';
      valores[m.destino]=typeof cell?.v === 'number'?cell.v:Number(String(cell?.v??'').replace(',','.'));
      if(cell?.t==='e'||cell?.f&&cell.v==null)errores.push(`${m.origen}: error o fórmula sin resultado guardado.`);
    }
    if (normalizar(datos.UNIT)==='TOTAL') {
      if(totalDeclarado!==null) errores.push('Más de una fila TOTAL.');
      totalDeclarado=Number.isFinite(valores.AMOUNT)?valores.AMOUNT:null;
      paresDeclarados=Number.isFinite(valores.PAIRS)?valores.PAIRS:null;
      auxiliares++; if(!errores.length)continue;
    } else if (!['STYLE','MATERIAL_CODE','COLOR_CODE','SIZE_RUN','BOXES'].some(k=>datos[k])) {auxiliares++;continue;}
    else if(mapeo.every(m=>normalizar(datos[m.destino])===normalizar(m.origen))){auxiliares++;continue;}
    for(const m of mapeo)if(!m.opcional&&!datos[m.destino])errores.push(`${m.origen}: obligatorio vacío.`);
    for(const k of ['BOXES','PAIRS'])if(!Number.isSafeInteger(valores[k])||valores[k]<=0)errores.push(`${k}: debe ser entero positivo.`);
    for(const k of ['UNIT','AMOUNT'])if(!Number.isFinite(valores[k])||valores[k]<0)errores.push(`${k}: importe inválido.`);
    if(Number.isFinite(valores.AMOUNT)&&Number.isFinite(valores.UNIT)&&Math.abs(Math.round(valores.PAIRS*valores.UNIT*100)-Math.round(valores.AMOUNT*100))>1)errores.push('PAIRS × UNIT no coincide con AMOUNT (tolerancia 0,01).');
    registros.push({fila,datos,errores,advertencias:[],valores});
  }
  const validos=registros.filter(r=>!r.errores.length);
  const importe=validos.reduce((s,r)=>s+Math.round(r.valores.AMOUNT*100),0)/100;
  const pares=validos.reduce((s,r)=>s+r.valores.PAIRS,0);
  const problemas=registros.filter(r=>r.errores.length);
  return {mapeo,resumen:{total:registros.length,validos:validos.length,conErrores:problemas.length,conAdvertencias:0,filasAuxiliaresOmitidas:auxiliares},filas:registros.slice(0,20),problemas:problemas.slice(0,200),totalProblemas:problemas.length,limiteProblemas:200,
    numerosFactura:[...numerosFactura],totales:{pares,importe,totalDeclarado,paresDeclarados,importeCoincide:totalDeclarado==null?null:Math.abs(Math.round(importe*100)-Math.round(totalDeclarado*100))<=1,paresCoinciden:paresDeclarados==null?null:pares===paresDeclarados},
    notas:['Factura: validación por producto, cajas, pares y precio × pares = importe. No se cruza por talle en esta etapa.','Los totales calculados incluyen solo filas válidas. Importes sin moneda inferida.'],...(incluirRegistros?{registros}:{})};
}
function controlarFactura(factura,productos,facturas) {
  const mapa=new Map();
  for(const r of factura.registros){if(r.errores.length)continue;const d=r.datos,k=JSON.stringify([d.STYLE,d.MATERIAL_CODE,d.COLOR_CODE]);if(!mapa.has(k))mapa.set(k,{PRODUCTO:`${d.STYLE}.${d.MATERIAL_CODE}.${d.COLOR_CODE}`,paresFactura:0,cajasFactura:0,importe:0,filasFactura:[]});const g=mapa.get(k);g.paresFactura+=r.valores.PAIRS;g.cajasFactura+=r.valores.BOXES;g.importe+=Math.round(r.valores.AMOUNT*100);g.filasFactura.push(r.fila);}
  for(const p of productos.listado){const k=JSON.stringify([p.STYLE,p.MATERIAL,p.COLOR]);if(!mapa.has(k))mapa.set(k,{PRODUCTO:p.PRODUCTO,paresFactura:null,cajasFactura:null,importe:null,filasFactura:[]});Object.assign(mapa.get(k),{paresPacking:p.paresPacking,paresCodigos:p.paresCodigos,paresEan:p.paresEan,cajasPacking:p.cajasPacking,cajasCodigos:p.cajasCodigos});}
  const filas=[...mapa.values()].map(g=>{const problemas=[];if(g.paresFactura==null)problemas.push('Sin producto válido en Factura');for(const t of ['paresPacking','paresCodigos','paresEan'])if(g[t]==null)problemas.push(`Sin ${t}`);else if(g.paresFactura!=null&&g[t]!==g.paresFactura)problemas.push(`Diferencia ${t}`);for(const t of ['cajasPacking','cajasCodigos'])if(g.cajasFactura!=null&&g[t]!=null&&g[t]!==g.cajasFactura)problemas.push(`Diferencia ${t}`);return{...g,importe:g.importe==null?null:g.importe/100,estado:problemas.length?'REVISAR':'COINCIDE',problemas};});
  return {filas,totales:factura.totales,numerosFactura:factura.numerosFactura,numeroCoincide:factura.numerosFactura.length===1&&facturas.length===1?factura.numerosFactura[0]===facturas[0]:null,resumen:{productos:filas.length,coinciden:filas.filter(r=>r.estado==='COINCIDE').length,revisar:filas.filter(r=>r.estado!=='COINCIDE').length,filasInvalidas:factura.resumen.conErrores},notas:factura.notas};
}
module.exports={leerFactura,controlarFactura};
