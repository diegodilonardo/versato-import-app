const PERMISOS={
 'facturas.ver':'Consultar facturas e historial', 'facturas.editar':'Analizar y actualizar facturas',
 'facturas.cancelar':'Cancelar facturas', 'nv.gestionar':'Generar NV y guardar domicilios',
 'nv.clientes':'Cambiar el cliente de una NV', 'ftp.enviar':'Enviar archivos al FTP',
 'precios.ver':'Consultar precios', 'precios.editar':'Actualizar listas, coeficientes y precios',
 'stock.ver':'Consultar stock y descargar grillas', 'stock.editar':'Actualizar stock y guardar vistas',
 'stock.programar':'Programar y publicar grillas', 'clientes.ver':'Consultar maestro de clientes',
 'clientes.editar':'Sincronizar maestro de clientes', 'fotos.ver':'Consultar fotos',
 'fotos.editar':'Gestionar ubicaciones y sincronizar fotos'
};
const comex=['facturas.ver','facturas.editar','nv.gestionar','nv.clientes','ftp.enviar','precios.ver','precios.editar','clientes.ver','clientes.editar','fotos.ver','fotos.editar'];
const comercial=['stock.ver','stock.editar','precios.ver','clientes.ver','fotos.ver'];
const PERFILES={ADMINISTRADOR:{nombre:'Administrador',permisos:Object.keys(PERMISOS)},COMEX:{nombre:'Operador COMEX',permisos:comex},COMERCIAL:{nombre:'Comercial',permisos:comercial},COMEX_COMERCIAL:{nombre:'COMEX + Comercial',permisos:[...new Set([...comex,...comercial])]},CONSULTA:{nombre:'Consulta',permisos:['facturas.ver','precios.ver','stock.ver','clientes.ver','fotos.ver']}};
function tiene(usuario,permiso){return !!usuario&&(usuario.perfil==='ADMINISTRADOR'||usuario.permisos.includes(permiso));}
// La API es la autoridad. Las rutas no clasificadas quedan reservadas al administrador.
function permisoRuta(metodo,ruta){
 const lectura=['GET','HEAD'].includes(metodo);let p=ruta.toLowerCase();
 if(p.length>1)p=p.replace(/\/+$/,'');
 if(['/','/logicas','/logicas.html','/cuenta','/cuenta.html'].includes(p))return 'sesion';
 if(p==='/usuarios'||p==='/usuarios.html'||p.startsWith('/api/admin/'))return 'administrar';
 if(p==='/stock'||p==='/stock.html'||p.startsWith('/api/stock')){
  if(!lectura&&/\/programacion$|\/ejecutar$/.test(p))return 'stock.programar';
  return lectura?'stock.ver':'stock.editar';
 }
 if(p==='/precios'||p==='/precios.html'||p.startsWith('/api/precios')){
  if(p.endsWith('/maestro.dbi'))return 'precios.editar';
  if(p.endsWith('/comparar'))return 'precios.ver';
  return lectura?'precios.ver':'precios.editar';
 }
 if(p==='/clientes'||p==='/clientes.html'||p.startsWith('/api/clientes'))return lectura?'clientes.ver':'clientes.editar';
 if(p==='/fotos'||p==='/fotos.html'||p.startsWith('/api/fotos')){
  if(!lectura&&(p.includes('/ubicaciones')||p.includes('/sincroniz')))return 'fotos.editar';
  return lectura?'fotos.ver':'fotos.editar';
 }
 if(p==='/importaciones'||p==='/index.html')return 'facturas.ver';
 if(p==='/historial'||p==='/historial.html'||p==='/consultas'||p==='/consultas.html'||p.startsWith('/api/historial')||p.startsWith('/api/consultas')||p.startsWith('/api/importaciones')){
  if(p.endsWith('/cancelar'))return 'facturas.cancelar';
  if(p.includes('/enviar-ftp'))return 'ftp.enviar';
  if(p.endsWith('/clientes/corregir'))return 'nv.clientes';
  if(p.includes('/precios-nv'))return lectura?'facturas.ver':'precios.editar';
  if(p.includes('/nv/')&&!lectura)return 'nv.gestionar';
  if(p.endsWith('/clientes/catalogo'))return 'nv.clientes';
  if(p.includes('/correo/')&& !p.endsWith('/preparar')&&!p.endsWith('/configuracion'))return 'facturas.ver';
  return lectura?'facturas.ver':'facturas.editar';
 }
 return 'administrar';
}
function inicio(u){return tiene(u,'facturas.editar')?'/importaciones':tiene(u,'stock.ver')?'/stock':tiene(u,'facturas.ver')?'/historial':'/cuenta';}
module.exports={PERMISOS,PERFILES,tiene,permisoRuta,inicio};
