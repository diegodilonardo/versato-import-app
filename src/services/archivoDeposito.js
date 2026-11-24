const XLSX=require('xlsx');
const TIPO='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HOJAS=[
 {nombre:'PRODUCTOS',columnas:['MARCA','MODELO','CAJAS','PARES']},
 {nombre:'PRODUCTOS POR COLOR',columnas:['MARCA','MODELO','PRODUCTO','CODIGO COLOR','COLOR','CAJAS','PARES']},
 {nombre:'PRODUCTOS POR COLOR Y CURVA',columnas:['MARCA','MODELO','CODIGO COLOR','COLOR','CURVA','COMPOSICION CURVA','CAJAS','PARES']}
];
const HOJA_CODIGOS_ALFA={nombre:'CODIGOS_ALFA',columnas:['MARCA','CODIGO INTERNO','CODIGO ALFA','DETALLE','MODELO','CODIGO COLOR','COLOR','CURVA','COMPOSICION CURVA','CAJAS','PARES']};
function agregarCodigosAlfa(archivo,resultado){
 if(!archivo?.hojas)return archivo;
 const origen=archivo.hojas.find(h=>h.nombre==='PRODUCTOS POR COLOR Y CURVA');if(!origen)return archivo;
 const advertencias=[];
 const filas=origen.filas.map(f=>{
  const producto=String(f.MODELO).replaceAll('-','.')+'.'+f['CODIGO COLOR'];
  const asignaciones=(resultado.productos?.asignaciones||[]).filter(a=>a.PRODUCTO===producto&&String(a.SIZE_RUN)===String(f.CURVA));
  const a=asignaciones.length===1?asignaciones[0]:null;
  const propuesta=a?(resultado.productos?.modulos?.filas||[]).find(r=>r.COD_ALFAB1===a.claveBuscada):null;
  const alfa=a?.estado==='ENCONTRADO'?a.COD_ALFA:propuesta?.COD_ALFA;
  const codigo=a?.estado==='ENCONTRADO'?a.CODIGO:propuesta?.CODIGO;
  const comex=alfa?(resultado.comex?.masterData?.filas||[]).find(r=>r.cod_alfa===alfa):null;
  const detalle=comex?.descripcion||propuesta?.DETALLE||'';
  if(!alfa)advertencias.push(producto+' / '+f.CURVA+': sin COD_ALFA único confirmado.');
  return {...f,'CODIGO INTERNO':codigo==null?'':String(codigo),'CODIGO ALFA':alfa||'',DETALLE:detalle};
 });
 return {...archivo,version:2,hojas:[...archivo.hojas.filter(h=>h.nombre!=='CODIGOS_ALFA'),{...HOJA_CODIGOS_ALFA,filas,total:{...origen.total}}],advertenciasCodigosAlfa:[...new Set(advertencias)]};
}
function agruparDeposito(filas,total){
 const errores=[];
 for(const [i,f]of filas.entries()){
  for(const c of new Set(HOJAS.flatMap(h=>h.columnas.slice(0,-2))))if(f[c]==null||String(f[c]).trim()==='')errores.push('Fila '+(i+1)+': falta '+c+'.');
  if(!Number.isSafeInteger(f.CAJAS)||f.CAJAS<=0||!Number.isSafeInteger(f.PARES)||f.PARES<=0)errores.push('Fila '+(i+1)+': cajas o pares inválidos.');
 }
 if(!filas.length)errores.push('No hay filas para el archivo de depósito.');
 const hojas=HOJAS.map(h=>{
  const dimensiones=h.columnas.slice(0,-2),grupos=new Map();
  for(const f of filas){const clave=JSON.stringify(dimensiones.map(c=>f[c]));if(!grupos.has(clave))grupos.set(clave,Object.fromEntries([...dimensiones.map(c=>[c,f[c]]),['CAJAS',0],['PARES',0]]));const g=grupos.get(clave);g.CAJAS+=f.CAJAS;g.PARES+=f.PARES;}
  const registros=[...grupos.values()].sort((a,b)=>{for(const c of dimensiones){const diferencia=String(a[c]).localeCompare(String(b[c]),'es',{numeric:true});if(diferencia)return diferencia;}return 0;});
  const cajas=registros.reduce((s,r)=>s+r.CAJAS,0),pares=registros.reduce((s,r)=>s+r.PARES,0);
  if(!Number.isSafeInteger(cajas)||!Number.isSafeInteger(pares)||cajas!==total.cajas||pares!==total.pares)errores.push(h.nombre+': los totales no coinciden con el informe del correo.');
  return{...h,filas:registros,total:{cajas,pares}};
 });
 return{version:1,hojas,total,errores:[...new Set(errores)],bloqueada:errores.length>0};
}
function prepararArchivoDeposito(resultado,previews,total){
 const filas=[],errores=[];if(resultado.estado==='PARCIAL'||resultado.resumen?.revisar>0)errores.push('Resolvé las diferencias o filas excluidas del análisis.');
 for(const r of previews.PACKING_LIST?.registros||[]){
  if(r.errores?.length){errores.push('Packing fila '+r.fila+': contiene errores.');continue;}
  const d=r.datos,texto=v=>String(v??'').trim(),style=texto(d.STYLE),material=texto(d.MATERIAL_CODE),color=texto(d.COLOR_CODE),producto=[style,material,color].join('.');
  const p=resultado.productos?.listado?.find(p=>p.PRODUCTO===producto);
  const unica=valores=>{const v=[...new Set((valores||[]).filter(Boolean))];return v.length===1?v[0]:'';};
  const talles=texto(d.TALLE).split(/\s+/).filter(Boolean),cantidades=texto(d.CANTIDAD).split(/\s+/).filter(Boolean);
  const cajas=Number(d.BOXES),pares=Number(d.PAIRS);
  if(!style||!material||!color)errores.push('Packing fila '+r.fila+': falta STYLE, MATERIAL CODE o COLOR CODE.');
  if(!talles.length||talles.length!==cantidades.length||cantidades.some(n=>!/^\d+$/.test(n))||cantidades.reduce((sum,n)=>sum+Number(n),0)*cajas!==pares)errores.push('Packing fila '+r.fila+': la composición no coincide con los pares de las cajas.');
  filas.push({'MARCA':texto(d.MARCA)||unica(p?.marcas),'MODELO':style.replaceAll('.','-')+'-'+material,'PRODUCTO':producto,'CODIGO COLOR':color,'COLOR':texto(d.DESCRIPCION_COLOR)||unica(p?.colores),'CURVA':texto(d.SIZE_RUN),'COMPOSICION CURVA':talles.map((t,i)=>({t,n:Number(cantidades[i])})).filter(v=>v.n>0).map(v=>v.t+':'+v.n).join(' '),'CAJAS':cajas,'PARES':pares});
 }
 const archivo=agruparDeposito(filas,total);archivo.errores=[...new Set([...archivo.errores,...errores])];archivo.bloqueada=archivo.errores.length>0;
 archivo.nombre='Salida archivo Deposito - '+String(resultado.facturas?.[0]||'factura').replace(/[^A-Za-z0-9-]/g,'-')+'.xlsx';
 return agregarCodigosAlfa(archivo,resultado);
}
function exportarDeposito(archivo){
 if(!archivo||archivo.bloqueada)throw Object.assign(new Error('Revisá los datos del archivo de depósito antes de adjuntarlo.'),{status:422});
 const libro=XLSX.utils.book_new();
 for(const h of archivo.hojas){
  const datos=h.filas.map(r=>h.columnas.map(c=>r[c])),totales=h.columnas.map(()=>null);totales[h.columnas.length-3]='TOTAL';totales[h.columnas.length-2]=h.total.cajas;totales[h.columnas.length-1]=h.total.pares;
  const ws=XLSX.utils.aoa_to_sheet([h.columnas,...datos,h.columnas.map(()=>null),totales]);
  const ultimaFila=datos.length+1,filaTotal=datos.length+3;
  for(const col of [h.columnas.length-2,h.columnas.length-1]){const letra=XLSX.utils.encode_col(col);ws[letra+filaTotal]={t:'n',v:totales[col],f:'SUM('+letra+'2:'+letra+ultimaFila+')',z:'#,##0'};}
  ws['!cols']=h.columnas.map(c=>({wch:c==='DETALLE'?65:c==='COMPOSICION CURVA'?55:c==='PRODUCTO'?32:c==='MODELO'?26:c==='MARCA'||c==='COLOR'?24:19}));ws['!autofilter']={ref:'A1:'+XLSX.utils.encode_col(h.columnas.length-1)+ultimaFila};XLSX.utils.book_append_sheet(libro,ws,h.nombre);
 }
 return XLSX.write(libro,{type:'buffer',bookType:'xlsx',compression:true});
}
module.exports={HOJAS,HOJA_CODIGOS_ALFA,TIPO,agregarCodigosAlfa,agruparDeposito,prepararArchivoDeposito,exportarDeposito};
