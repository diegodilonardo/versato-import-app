const ZONA='America/Argentina/Buenos_Aires';
const formato=new Intl.DateTimeFormat('en-US',{timeZone:ZONA,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'});
const cache=new Map();
const fallo=()=>Object.assign(new Error('Cron inválido. Usá cinco campos numéricos: minuto, hora, día, mes y día de semana. Ejemplo: */5 * * * *.'),{status:422});
function parsear(expresion){
 if(typeof expresion!=='string'||expresion.length>100)throw fallo();
 const texto=expresion.trim().replace(/\s+/g,' ');
 if(cache.has(texto))return cache.get(texto);
 const campos=texto.split(' '),limites=[[0,59],[0,23],[1,31],[1,12],[0,7]];
 if(campos.length!==5)throw fallo();
 const valores=campos.map((campo,i)=>{
  const [min,max]=limites[i],salida=new Set();
  for(const parte of campo.split(',')){
   const m=/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(parte);if(!m)throw fallo();
   const paso=m[2]?Number(m[2]):1;if(paso<1||paso>max+1)throw fallo();
   let inicio,fin;
   if(m[1]==='*'){inicio=min;fin=max;}
   else{const n=m[1].split('-').map(Number);inicio=n[0];fin=n[1]??(m[2]?max:inicio);}
   if(inicio<min||fin>max||fin<inicio)throw fallo();
   for(let n=inicio;n<=fin;n+=paso)salida.add(i===4&&n===7?0:n);
  }
  if(!salida.size)throw fallo();return salida;
 });
 const c={texto,valores,libreDia:campos[2].includes('*'),libreSemana:campos[4].includes('*')};
 if(cache.size>200)cache.clear();cache.set(texto,c);return c;
}
function local(fecha){const p=Object.fromEntries(formato.formatToParts(fecha).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));return {y:p.year,m:p.month,d:p.day,h:p.hour,min:p.minute};}
function diaValido(c,p){
 const semana=new Date(Date.UTC(p.y,p.m-1,p.d)).getUTCDay(),dia=c.valores[2].has(p.d),sem=c.valores[4].has(semana);
 return c.valores[3].has(p.m)&&(c.libreDia||c.libreSemana?dia&&sem:dia||sem);
}
function coincide(cron,fecha){const c=typeof cron==='string'?parsear(cron):cron,p=local(fecha);return diaValido(c,p)&&c.valores[0].has(p.min)&&c.valores[1].has(p.h);}
function instante(y,m,d,h,min){
 const deseada=Date.UTC(y,m-1,d,h,min);let t=deseada;
 for(let i=0;i<3;i++){const p=local(new Date(t)),delta=deseada-Date.UTC(p.y,p.m-1,p.d,p.h,p.min);t+=delta;if(!delta)break;}
 return t;
}
function siguiente(cron,desde=new Date()){
 const c=typeof cron==='string'?parsear(cron):cron,actual=local(desde),horas=[...c.valores[1]].sort((a,b)=>a-b),minutos=[...c.valores[0]].sort((a,b)=>a-b);
 for(let n=0;n<1465;n++){
  const dia=new Date(Date.UTC(actual.y,actual.m-1,actual.d+n)),p={y:dia.getUTCFullYear(),m:dia.getUTCMonth()+1,d:dia.getUTCDate()};
  if(!diaValido(c,p))continue;
  for(const h of horas)for(const min of minutos){
   if(!n&&(h<actual.h||(h===actual.h&&min<=actual.min)))continue;
   const t=instante(p.y,p.m,p.d,h,min);if(t>desde.getTime()&&coincide(c,new Date(t)))return new Date(t).toISOString();
  }
 }
 throw fallo();
}
module.exports={ZONA,parsear,coincide,siguiente};
