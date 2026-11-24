const XLSX=require('xlsx'),{inflateRawSync}=require('node:zlib'),{createHash}=require('node:crypto');
const limite=60*1024*1024;
const error=mensaje=>Object.assign(new Error(mensaje),{status:422});
// Lee únicamente CSV; nunca extrae rutas del ZIP al disco.
function contenidos(file){
 if(/\.csv$/i.test(file.originalname))return [{nombre:file.originalname,buffer:file.buffer}];
 if(!/\.zip$/i.test(file.originalname))throw error('Usá pedidos CSV o ZIP con archivos CSV.');
 const b=file.buffer;let fin=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){fin=i;break;}
 if(fin<0||b.readUInt16LE(fin+4)||b.readUInt16LE(fin+6))throw error('ZIP inválido o dividido en varios volúmenes.');
 const cantidad=b.readUInt16LE(fin+10);let p=b.readUInt32LE(fin+16),total=0;const salida=[];
 if(cantidad>100)throw error('El ZIP admite hasta 100 archivos.');
 for(let i=0;i<cantidad;i++){
  if(p+46>b.length||b.readUInt32LE(p)!==0x02014b50)throw error('Directorio ZIP inválido.');
  const flags=b.readUInt16LE(p+8),metodo=b.readUInt16LE(p+10),comprimido=b.readUInt32LE(p+20),bytes=b.readUInt32LE(p+24),l=b.readUInt16LE(p+28),extra=b.readUInt16LE(p+30),comentario=b.readUInt16LE(p+32),offset=b.readUInt32LE(p+42),nombre=b.subarray(p+46,p+46+l).toString('utf8');p+=46+l+extra+comentario;
  if(nombre.endsWith('/'))continue;
  if(!/\.csv$/i.test(nombre))throw error('El ZIP contiene un archivo que no es CSV: '+nombre);
  total+=bytes;if(total>limite||bytes===0||flags&1||![0,8].includes(metodo))throw error('ZIP vacío, cifrado, demasiado grande o con compresión no admitida.');
  if(offset+30>b.length||b.readUInt32LE(offset)!==0x04034b50)throw error('Entrada ZIP inválida.');
  const inicio=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);if(inicio+comprimido>b.length)throw error('ZIP incompleto.');
  const contenido=b.subarray(inicio,inicio+comprimido),buffer=metodo===8?inflateRawSync(contenido,{maxOutputLength:bytes}):Buffer.from(contenido);
  if(buffer.length!==bytes)throw error('Tamaño CSV inconsistente.');salida.push({nombre,buffer});
 }
 if(!salida.length)throw error('El ZIP no contiene pedidos CSV.');return salida;
}
function leerPedidos(files){
 const archivos=[],filas=[],huellas=new Set();let total=0;
 for(const file of files)for(const c of contenidos(file)){
  total+=c.buffer.length;if(total>limite)throw error('Los CSV descomprimidos superan 60 MB.');
  const huella=createHash('sha256').update(c.buffer).digest('hex');if(huellas.has(huella))continue;huellas.add(huella);
  const texto=new TextDecoder('utf-8',{fatal:false}).decode(c.buffer),contenido=texto.includes('\ufffd')?new TextDecoder('windows-1252').decode(c.buffer):texto;
  const libro=XLSX.read(contenido,{type:'string',FS:';',raw:true}),rows=XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]],{header:1,defval:'',raw:true});
  const cab=rows.shift()?.map(v=>String(v).trim());const requeridos=['Pedido','Linha','Ref.','Cabedal','Cor','Grade','Qtd.','Loja Clientes','Caixas'];
  if(!cab||requeridos.some(h=>cab.filter(v=>v===h).length!==1))throw error('Encabezados de pedido inválidos en '+c.nombre);
  const talles=cab.map((h,i)=>({h,i})).filter(v=>/^\d+(?:\/\d+)?$/.test(v.h));if(!talles.length)throw error('Faltan talles en '+c.nombre);
  const antes=filas.length;
  for(const [i,row]of rows.entries()){
   if(row.every(v=>String(v).trim()===''))continue;
   if(filas.length>=50000)throw error('Se admiten hasta 50.000 filas de pedidos.');
   const get=h=>String(row[cab.indexOf(h)]??'').trim(),codigo=h=>get(h).split(/\s+-\s+/)[0],numero=v=>/^\d+$/.test(String(v).trim())?Number(v):NaN;
   const r={archivo:file.originalname,csv:c.nombre,fila:i+2,pedido:get('Pedido'),PRODUCTO:['Linha','Ref.','Cabedal','Cor'].map(codigo).join('.'),SIZE_RUN:get('Grade'),cliente:get('Loja Clientes'),cajas:numero(get('Caixas')),pares:numero(get('Qtd.')),talles:Object.fromEntries(talles.map(t=>[t.h,numero(row[t.i])])),errores:[]};
   if(!/^\d+(?:\.\d+){3}$/.test(r.PRODUCTO)||![r.pedido,r.SIZE_RUN,r.cliente].every(v=>/^\d+$/.test(v)))r.errores.push('Identificadores incompletos o inválidos.');
   if(!Number.isSafeInteger(r.cajas)||r.cajas<=0||!Number.isSafeInteger(r.pares)||r.pares<0||Object.values(r.talles).some(v=>!Number.isSafeInteger(v)||v<0))r.errores.push('Cantidades inválidas.');
   else if(Object.values(r.talles).reduce((s,n)=>s+n,0)*r.cajas!==r.pares)r.errores.push('La curva por cajas no coincide con Qtd.');
   filas.push(r);
  }
  archivos.push({archivo:file.originalname,csv:c.nombre,huella,filas:filas.length-antes});
 }
 return {archivos,filas};
}
function compararPedidos(origen,previews,correcciones=[]){
 const efectivos=require('./correccionesClientes').aplicarCorreccionesClientes(previews,correcciones),mapa=new Map(),invalidas=[];
 const agregar=(cliente,producto,grade,cajas,pares,talles,fuente)=>{const k=JSON.stringify([cliente,producto,grade]);if(!mapa.has(k))mapa.set(k,{cliente,PRODUCTO:producto,SIZE_RUN:grade,pedidos:[],pedido:{cajas:0,pares:0,talles:{}},factura:{cajas:0,pares:0,talles:{}}});const r=mapa.get(k),g=r[fuente];g.cajas+=cajas;g.pares+=pares;for(const [t,n]of Object.entries(talles))g.talles[t]=(g.talles[t]||0)+n*cajas;return r;};
 for(const r of origen.filas){if(r.errores.length){invalidas.push(r);continue;}agregar(r.cliente,r.PRODUCTO,r.SIZE_RUN,r.cajas,r.pares,r.talles,'pedido').pedidos.push(r.pedido);}
 for(const r of efectivos.PACKING_LIST?.registros||[]){const d=r.datos;if(r.errores?.length){invalidas.push({archivo:'Packing List',fila:r.fila,errores:r.errores});continue;}agregar(String(d.SHOP),[d.STYLE,d.MATERIAL_CODE,d.COLOR_CODE].join('.'),String(d.SIZE_RUN),Number(d.BOXES),Number(d.PAIRS),Object.fromEntries(String(d.TALLE).split(/\s+/).map((t,i)=>[t,Number(String(d.CANTIDAD).split(/\s+/)[i])])),'factura');}
 const filas=[...mapa.values()].map(r=>{r.pedidos=[...new Set(r.pedidos)];r.diferencias=[];if(!r.pedido.cajas)r.diferencias.push('Sin pedido cargado');if(!r.factura.cajas)r.diferencias.push('No figura en la factura');if(r.pedido.cajas!==r.factura.cajas)r.diferencias.push('Cajas diferentes');if(r.pedido.pares!==r.factura.pares)r.diferencias.push('Pares diferentes');if([...new Set([...Object.keys(r.pedido.talles),...Object.keys(r.factura.talles)])].some(t=>(r.pedido.talles[t]||0)!==(r.factura.talles[t]||0)))r.diferencias.push('Cantidades por talle diferentes');r.estado=r.diferencias.length?'REVISAR':'COINCIDE';return r;});
 return {fecha:new Date().toISOString(),informativo:true,archivos:origen.archivos,origen:origen.filas,correccionesOrigen:JSON.stringify(correcciones),resumen:{pedidos:new Set(origen.filas.map(r=>r.pedido)).size,coinciden:filas.filter(r=>r.estado==='COINCIDE').length,revisar:filas.filter(r=>r.estado==='REVISAR').length,invalidas:invalidas.length,cajasPedido:filas.reduce((s,r)=>s+r.pedido.cajas,0),paresPedido:filas.reduce((s,r)=>s+r.pedido.pares,0),cajasDeclaradas:origen.filas.reduce((s,r)=>s+(Number.isSafeInteger(r.cajas)?r.cajas:0),0),paresDeclarados:origen.filas.reduce((s,r)=>s+(Number.isSafeInteger(r.pares)?r.pares:0),0),cajasFactura:filas.reduce((s,r)=>s+r.factura.cajas,0),paresFactura:filas.reduce((s,r)=>s+r.factura.pares,0)},filas,invalidas};
}
module.exports={contenidos,leerPedidos,compararPedidos};
