(function(raiz){
 function cambiosDelCliente(correcciones,cliente){
  const relacionados=new Set([String(cliente)]),cambios=[];
  // Recorrer hacia atrás permite reconstruir A -> B -> C en la tarjeta actual C,
  // incluyendo varios clientes de origen que se hayan reunido en un mismo destino.
  for(let i=(correcciones||[]).length-1;i>=0;i--){
   const c=correcciones[i];if(!relacionados.has(String(c.nuevo)))continue;
   cambios.push(c);relacionados.add(String(c.anterior));
  }
  return cambios.reverse();
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={cambiosDelCliente};
 else raiz.historialClienteNV={cambiosDelCliente};
})(globalThis);
