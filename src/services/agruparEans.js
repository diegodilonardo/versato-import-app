const identidad = ['STYLE', 'CABEDAL', 'COR', 'TALLE'];
// Comparación textual exacta: no quitar puntos, ceros ni separadores de talles.
const clave = (datos, campos) => JSON.stringify(campos.map(c => datos[c]));
function agruparEans(registros) {
  const porEan = new Map(), porProducto = new Map();
  const agregar = (mapa, key, r) => { if (!mapa.has(key)) mapa.set(key, []); mapa.get(key).push(r); };
  for (const r of registros) {
    if (!r.datos.EAN || identidad.some(c => !r.datos[c])) continue;
    agregar(porEan, r.datos.EAN, r);
    agregar(porProducto, clave(r.datos, identidad), r);
  }
  const conflictos = [];
  for (const [ean, filas] of porEan) {
    if (new Set(filas.map(r => clave(r.datos, identidad))).size <= 1) continue;
    conflictos.push({ tipo: 'EAN_EN_VARIOS_PRODUCTOS', ean, filas: filas.map(r => r.fila) });
    for (const r of filas) r.errores.push(`El EAN ${ean} está asignado a distintos productos o talles.`);
  }
  for (const filas of porProducto.values()) {
    if (new Set(filas.map(r => r.datos.EAN)).size <= 1) continue;
    conflictos.push({ tipo: 'PRODUCTO_CON_VARIOS_EAN', producto: Object.fromEntries(identidad.map(c => [c, filas[0].datos[c]])), eans: [...new Set(filas.map(r => r.datos.EAN))], filas: filas.map(r => r.fila) });
    for (const r of filas) r.errores.push('La misma combinación STYLE + CABEDAL + COR + TALLE tiene varios EAN.');
  }
  const mapa = new Map();
  for (const r of registros) {
    if (r.errores.length) continue;
    agregar(mapa, clave(r.datos, [...identidad, 'EAN']), r);
  }
  const grupos = [...mapa.values()].map(filas => {
    const marcas = [...new Set(filas.map(r => r.datos.MARCA))];
    if (marcas.length > 1) for (const r of filas) r.advertencias.push('La combinación agrupada tiene distintas marcas; revisar.');
    const cantidades = filas.map(r => r.paresNumericos);
    const sumaConocida = cantidades.filter(n => n != null).reduce((s, n) => s + n, 0);
    const completa = cantidades.every(n => n != null);
    const segura = Number.isSafeInteger(sumaConocida);
    if (!segura) for (const r of filas) r.advertencias.push('La suma de pares excede la precisión admitida.');
    return { ...Object.fromEntries([...identidad, 'EAN'].map(c => [c, filas[0].datos[c]])),
      MARCAS: marcas, PARES: completa && segura ? sumaConocida : null,
      paresConocidos: segura ? sumaConocida : null, cantidadCompleta: completa && segura,
      registrosOrigen: filas.length, filasOrigen: filas.map(r => r.fila) };
  });
  const excluidas = registros.filter(r => r.errores.length).length;
  return { columnasClave: [...identidad, 'EAN'], grupos, conflictos,
    resumen: { filasOriginales: registros.length, filasAgrupadas: registros.length - excluidas,
      filasExcluidas: excluidas, grupos: grupos.length,
      repeticionesConsolidadas: registros.length - excluidas - grupos.length,
      conflictos: conflictos.length,
      pares: grupos.every(g => g.cantidadCompleta) && Number.isSafeInteger(grupos.reduce((s, g) => s + g.PARES, 0)) ? grupos.reduce((s, g) => s + g.PARES, 0) : null } };
}
module.exports = { agruparEans };
