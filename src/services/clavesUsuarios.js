const {scrypt,randomBytes,timingSafeEqual,createHash}=require('node:crypto');
const derivar=require('node:util').promisify(scrypt);
const opciones={N:32768,r:8,p:3,maxmem:64*1024*1024};
let procesos=0;
async function derivarLimitada(clave,sal){if(procesos>=2)throw Object.assign(Error('Hay otros accesos en proceso. Volvé a intentar en unos segundos.'),{status:429});procesos++;try{return await derivar(clave,sal,64,opciones);}finally{procesos--;}}
function validarClave(clave){if(typeof clave!=='string'||clave.length<12||clave.length>128)throw Object.assign(Error('La contraseña debe tener entre 12 y 128 caracteres.'),{status:422});}
async function hashClave(clave){validarClave(clave);const sal=randomBytes(16).toString('hex');const hash=await derivarLimitada(clave,sal);return ['scrypt',32768,8,3,sal,hash.toString('hex')].join('$');}
async function comprobarClave(clave,valor){if(typeof clave!=='string'||clave.length>128)return false;const [tipo,n,r,p,sal,hash]=String(valor||'').split('$');if(tipo!=='scrypt'||n!=='32768'||r!=='8'||p!=='3'||!/^[a-f0-9]{32}$/.test(sal)||!/^[a-f0-9]{128}$/.test(hash))return false;const calculado=await derivarLimitada(clave,sal);return timingSafeEqual(calculado,Buffer.from(hash,'hex'));}
const huella=v=>createHash('sha256').update(v).digest('hex');
module.exports={validarClave,hashClave,comprobarClave,huella};
