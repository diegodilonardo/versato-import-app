const {prepararProductosPresea}=require('./productosPresea');
const {escribirDBI}=require('./escribirDBI');
const esquemas={relformu:require('../config/dbi/relformu.json'),relacion:require('../config/dbi/relacion.json')};
function prepararRelacionesDBI(resultado){
 const productos=prepararProductosPresea(resultado),formulas=[],relaciones=[],excluidas=[];
 const sueltos=resultado.productos.sueltos?.filas||[],propuestos=new Map(productos.filas.filter(r=>r.NIVEL===900).map(r=>[r.EAN,r]));
 for(const m of productos.filas.filter(r=>r.NIVEL===950)){
  const errores=[],componentes=new Map();const detalle=`${m.DMODC} ${m.DCOLORC} ${m.DTALLC}`;
  for(const parte of String(m.DTALLC||'').split(/\s+/).filter(Boolean)){
   const match=/^([^:]+):(\d+)$/.exec(parte);if(!match){errores.push('Distribución por talle inválida.');continue;}
   const cantidad=Number(match[2]);if(!cantidad)continue;const talle=match[1].split('/')[0];
   const candidatos=sueltos.filter(s=>s.PRODUCTO===m.PRODUCTO&&String(s.TALLE_ORIGEN).split('/')[0]===talle);
   if(candidatos.length!==1){errores.push(`Talle ${talle}: falta un suelto único asociado al producto.`);continue;}
   const s=candidatos[0],datos=s.estado==='ENCONTRADO'?s.datosMaestro:propuestos.get(s.EAN);
   if(!datos?.COD_ALFA||!['ENCONTRADO','NUEVO'].includes(s.estado)){errores.push(`Talle ${talle}: suelto no disponible para relacionar.`);continue;}
   if(!componentes.has(s.EAN))componentes.set(s.EAN,{datos,talle,cantidad:0});componentes.get(s.EAN).cantidad+=cantidad;
  }
  const suma=[...componentes.values()].reduce((s,r)=>s+r.cantidad,0);if(suma!==Number(m.PARES))errores.push('La suma de cantidades por talle no coincide con PARES del módulo.');
  if(!componentes.size)errores.push('El módulo no tiene sueltos con cantidad positiva.');
  const formula={ARTICULO:null,FORMULA:'EMBALAJE MODULO',LOTEOPTIMO:0,DIAS_PROCE:0,CA_ARTICUL:m.COD_ALFA,DETALLE:detalle,PROVEEDOR:80005,OBLIGATORI:'',RECEP_AUTO:'',DEPO_PROXI:'S',FRECUPROCE:0,AUTOMATICA:'FALSO',PRODMINIMA:0,DESARME:'.T.'};
  const filas=[...componentes.values()].map(c=>({ARTICULO:null,CANTIDAD:c.cantidad,INSUMO:null,CA_ARTICUL:m.COD_ALFA,CA_INSUMO:c.datos.COD_ALFA,UNIDADES:0,DETAARTI:detalle,DETAINSU:`${m.DMODC} ${m.DCOLORC} ${c.talle}`,MEDIDAARTI:'07',MEDIDAINSU:'07',ALTERNATIV:'',FORMULA:'EMBALAJE MODULO',TOMA_SERIE:0,CONSUFIJO:0,INSUPRINCI:0,CRITICO:0,OPCIONAL:0,NUM_APER:0,CANT_FIJA:0,TOLERANCIA:0}));
  if(!errores.length)try{escribirDBI(esquemas.relformu,[formula]);escribirDBI(esquemas.relacion,filas);}catch(e){errores.push(e.message);}
  if(errores.length){excluidas.push({clave:m.COD_ALFAB1,motivos:[...new Set(errores)]});continue;}
  formulas.push(formula);relaciones.push(...filas);
 }
 return{formulas,relaciones,excluidas,bloqueada:productos.bloqueada,mensaje:productos.mensaje,modulos:productos.bloqueada?0:formulas.length,componentes:productos.bloqueada?0:relaciones.length};
}
function exportarRelacionesDBI(resultado,tipo){const p=prepararRelacionesDBI(resultado);if(!esquemas[tipo])throw Object.assign(new Error('Tipo DBI no válido.'),{status:400});if(p.bloqueada||!p.modulos)throw Object.assign(new Error(p.mensaje||'No hay módulos con familias completas para generar DBI.'),{status:422});return escribirDBI(esquemas[tipo],tipo==='relformu'?p.formulas:p.relaciones);}
module.exports={prepararRelacionesDBI,exportarRelacionesDBI};
