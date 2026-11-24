function resumenMarcas(productos, factura) {
  const grupos = new Map();
  const obtener = marca => {
    if(!grupos.has(marca)) grupos.set(marca,{marca,cajasPacking:0,cajasCodigos:0,cajasFactura:factura?0:null,paresPacking:0,paresCodigos:0,paresEan:0,paresFactura:factura?0:null,importeFactura:factura?0:null});
    return grupos.get(marca);
  };
  const porProducto=new Map();
  for(const p of productos.listado){
    const marca=p.marcas.length===1?p.marcas[0]:'Marca sin definir';
    porProducto.set(p.PRODUCTO,marca);
    const g=obtener(marca);g.paresPacking+=p.paresPacking;g.paresCodigos+=p.paresCodigos;g.paresEan+=p.paresEan;
    g.cajasPacking+=p.cajasPacking??0;g.cajasCodigos+=p.cajasCodigos??0;
  }
  if(factura)for(const r of factura.registros){
    if(r.errores.length)continue;
    const d=r.datos,id=`${d.STYLE}.${d.MATERIAL_CODE}.${d.COLOR_CODE}`;
    const g=obtener(d.MARCA||porProducto.get(id)||'Marca sin definir');
    g.paresFactura+=r.valores.PAIRS;g.importeFactura+=Math.round(r.valores.AMOUNT*100);
    g.cajasFactura+=r.valores.BOXES;
  }
  const filas=[...grupos.values()].sort((a,b)=>a.marca.localeCompare(b.marca,'es'));
  for(const g of filas)if(g.importeFactura!=null)g.importeFactura/=100;
  const campos=['cajasPacking','cajasCodigos','cajasFactura','paresPacking','paresCodigos','paresEan','paresFactura','importeFactura'];
  const total={marca:'TOTAL GENERAL'};
  for(const campo of campos)total[campo]=!factura&&['cajasFactura','paresFactura','importeFactura'].includes(campo)?null:filas.reduce((s,g)=>s+(campo==='importeFactura'?Math.round(g[campo]*100):g[campo]),0)/(campo==='importeFactura'?100:1);
  return{filas,total,conFactura:!!factura,nota:'Pares comparados y facturados de filas válidas. Los importes corresponden a la suma de líneas de Factura, sin inferir moneda ni sumar cargos. Las marcas sin identificación única se muestran aparte.'};
}
module.exports={resumenMarcas};
