// dBase III sin memo, según los DBI de referencia suministrados por el usuario.
const codigos1252=new Map();const decoder=new TextDecoder('windows-1252');for(let i=0;i<256;i++)codigos1252.set(decoder.decode(Uint8Array.of(i)),i);
const fallo=mensaje=>Object.assign(new Error(mensaje),{status:422});
function texto1252(texto){const bytes=[];for(const c of String(texto)){if(!codigos1252.has(c)||/[\x00-\x1f\x7f]/.test(c))throw fallo('El DBI contiene un carácter no admitido en Windows-1252.');bytes.push(codigos1252.get(c));}return Buffer.from(bytes);}
function escribirDBI(esquema,filas,fecha=new Date()){
 const campos=esquema.fields,header=32+32*campos.length+1,registro=1+campos.reduce((s,c)=>s+c.length,0);
 const buffer=Buffer.alloc(header+registro*filas.length+1,0);buffer[0]=esquema.version;const partes=new Intl.DateTimeFormat('en',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(fecha);const valor=t=>Number(partes.find(p=>p.type===t).value);buffer[1]=valor('year')-1900;buffer[2]=valor('month');buffer[3]=valor('day');buffer.writeUInt32LE(filas.length,4);buffer.writeUInt16LE(header,8);buffer.writeUInt16LE(registro,10);buffer[29]=esquema.language;
 campos.forEach((c,i)=>{const p=32+i*32;buffer.write(c.name,p,11,'ascii');buffer[p+11]=c.type.charCodeAt(0);buffer[p+16]=c.length;buffer[p+17]=c.decimals;});buffer[header-1]=13;
 filas.forEach((fila,i)=>{let offset=header+i*registro;buffer.fill(32,offset,offset+registro);offset++;
  for(const c of campos){const value=fila[c.name];let bytes;
   if(c.type==='C'){bytes=texto1252(value??'');}
   else if(c.type==='N'){if(value==null||value==='')bytes=Buffer.alloc(0);else{if(!/^-?\d+(\.\d+)?$/.test(String(value))||!Number.isFinite(Number(value)))throw fallo(`DBI: ${c.name} inválido en fila ${i+1}.`);bytes=Buffer.from(Number(value).toFixed(c.decimals),'ascii');}}
   else if(c.type==='D'){const s=String(value??'');if(s&&!/^\d{8}$/.test(s))throw fallo(`DBI: ${c.name} debe tener una fecha AAAAMMDD en fila ${i+1}.`);if(s){const y=Number(s.slice(0,4)),m=Number(s.slice(4,6)),d=Number(s.slice(6,8)),fecha=new Date(Date.UTC(y,m-1,d));if(fecha.getUTCFullYear()!==y||fecha.getUTCMonth()!==m-1||fecha.getUTCDate()!==d)throw fallo(`DBI: ${c.name} contiene una fecha inválida en fila ${i+1}.`);}bytes=Buffer.from(s,'ascii');}
   else throw fallo('Tipo DBI no admitido.');
   if(bytes.length>c.length)throw fallo(`DBI: ${c.name} supera ${c.length} caracteres en fila ${i+1}.`);bytes.copy(buffer,offset+(c.type==='N'?c.length-bytes.length:0));offset+=c.length;
  }
 });buffer[buffer.length-1]=26;return buffer;
}
module.exports={escribirDBI};
