// Reglas recuperadas del importador Access. No asigna códigos internos.
const producto = (style, material, color) => `${style}.${material}.${color}`;
function generarProductos(cruce, previews) {
  const mapa = new Map();
  const talles = [];
  for (const r of cruce.filas) {
    const id = producto(r.STYLE, r.MATERIAL, r.COLOR);
    const clave = JSON.stringify([r.STYLE, r.MATERIAL, r.COLOR]);
    if (!mapa.has(clave)) mapa.set(clave, { PRODUCTO: id, STYLE: r.STYLE, MATERIAL: r.MATERIAL, COLOR: r.COLOR,
      talles: [], paresPacking: 0, paresCodigos: 0, paresEan: 0, combinacionesRevisar: 0,
      codigosVersato: [], sizeRuns: [], estado: 'PENDIENTE_MAESTRO', AA: null,
      CODIGO: null, CODIGO_SUELTO: null, MODC: null });
    const p = mapa.get(clave);
    if (!p.talles.includes(r.TALLE)) p.talles.push(r.TALLE);
    p.paresPacking += r.PACKING_LIST ?? 0;
    p.paresCodigos += r.CODIGOS_BARRA ?? 0;
    p.paresEan += r.EAN ?? 0;
    if (r.estado !== 'COINCIDE') p.combinacionesRevisar++;
    talles.push({ PRODUCTO: id, TALLE: r.TALLE, EAN: r.eans.join(', '),
      paresPacking: r.PACKING_LIST, paresCodigos: r.CODIGOS_BARRA, paresEan: r.EAN,
      estado: r.estado, problemas: [...r.problemas], filas: r.filas });
  }
  for (const tipo of ['PACKING_LIST', 'CODIGOS_BARRA']) {
    for (const r of previews[tipo].registros) {
      if (r.errores.length) continue;
      const d = r.datos;
      const style = tipo === 'PACKING_LIST' ? d.STYLE : `${d.LINHA}.${d.REFERENCIA}`;
      const material = tipo === 'PACKING_LIST' ? d.MATERIAL_CODE : d.CABEDAL;
      const color = tipo === 'PACKING_LIST' ? d.COLOR_CODE : d.COR;
      const p = mapa.get(JSON.stringify([style, material, color]));
      if (!p) continue;
      if (tipo === 'PACKING_LIST' && d.SIZE_RUN && !p.sizeRuns.includes(d.SIZE_RUN)) p.sizeRuns.push(d.SIZE_RUN);
      if (tipo === 'CODIGOS_BARRA' && d.CODIGO_BARRA && !p.codigosVersato.includes(d.CODIGO_BARRA)) p.codigosVersato.push(d.CODIGO_BARRA);
    }
  }
  const listado = [...mapa.values()];
  // Una concatenación podría colisionar si los componentes contienen puntos.
  const cantidadesId = new Map();
  for (const p of listado) cantidadesId.set(p.PRODUCTO, (cantidadesId.get(p.PRODUCTO) || 0) + 1);
  for (const p of listado) {
    if (p.combinacionesRevisar || cantidadesId.get(p.PRODUCTO) > 1) p.estado = 'REVISAR';
  }
  return { listado, talles, resumen: { productos: listado.length, productoTalles: talles.length,
    pendientesMaestro: listado.filter(p => p.estado === 'PENDIENTE_MAESTRO').length,
    revisar: listado.filter(p => p.estado === 'REVISAR').length },
    notas: ['PRODUCTO = STYLE.MATERIAL.COLOR. En Códigos de Barra STYLE = LINHA.REFERENCIA; en EAN material y color corresponden a CABEDAL y COR.',
      'AA se obtiene del maestro de productos, aún no conectado. CODIGO, CODIGO_SUELTO y MODC quedan pendientes de sus reglas y maestros.',
      'Los códigos Versato mostrados provienen del archivo: no se generaron códigos nuevos ni se extrajo AA de ellos.',
      'Esta propuesta usa las filas comparadas. Si el cruce es parcial, no representa todos los productos del lote. No se guarda ni se da de alta ningún producto.'] };
}
module.exports = { generarProductos, producto };
