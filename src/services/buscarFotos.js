function parametrosFotos(modelo='',pagina='0'){
 if(typeof modelo!=='string'||modelo.length>80)throw Object.assign(new Error('Ingresá un modelo válido.'),{status:422});
 const busqueda=modelo.trim().replaceAll('-','.');
 if(busqueda&&!/^\d+(?:\.\d+){0,3}$/.test(busqueda))throw Object.assign(new Error('Usá números separados por puntos o guiones, por ejemplo 1122.800.7286.'),{status:422});
 if(typeof pagina!=='string'||!/^\d{1,6}$/.test(pagina))throw Object.assign(new Error('Página no válida.'),{status:422});
 return {busqueda,pagina:Number(pagina),porPagina:40};
}
module.exports={parametrosFotos};
