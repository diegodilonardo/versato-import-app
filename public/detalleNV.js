(function(raiz){
 const unico=valores=>{const v=[...new Set(valores.map(x=>String(x??'').trim()).filter(Boolean))];return v.length===1?v[0]:'';};
 function filas(resultado,cliente){
  const c=resultado.notasVenta?.clientes?.find(c=>c.cliente===cliente);if(!c)return [];
  return c.filas.map(f=>{
   const catalogo=(resultado.comex?.masterData?.filas||[]).filter(m=>m.cod_alfa===f.COD_ALFA&&String(m.codigo_interno)===String(f.CODIGO));
   const asignaciones=(resultado.productos?.asignaciones||[]).filter(a=>a.COD_ALFA===f.COD_ALFA&&String(a.CODIGO)===String(f.CODIGO));
   const producto=unico(asignaciones.map(a=>a.PRODUCTO)),origen=resultado.productos?.listado?.find(p=>p.PRODUCTO===producto);
   return {marca:f.MARCA||unico(catalogo.map(m=>m.marca)),modelo:f.MODELO||unico(catalogo.map(m=>m.cod_mod))||(producto?producto.split('.').slice(0,3).join('-'):''),color:f.COLOR||unico(catalogo.map(m=>m.color))||unico(origen?.colores||[]),codAlfa:f.COD_ALFA,cantidad:f.CANTIDAD};
  });
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={filas};else raiz.detalleNV={filas};
})(globalThis);
