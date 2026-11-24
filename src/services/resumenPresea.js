function resumenPresea(productos, previews, cruce) {
  const porClave = new Map(productos.listado.map(p => [JSON.stringify([p.STYLE, p.MATERIAL, p.COLOR]), p]));
  for (const p of productos.listado) {
    p.marcas = []; p.descripciones = []; p.materiales = []; p.colores = [];
    p.cajasPacking = null; p.cajasCodigos = null;
  }
  const guardar = (lista, texto) => { if (texto && !lista.includes(texto)) lista.push(texto); };
  for (const r of previews.PACKING_LIST.registros) {
    if (r.errores.length) continue;
    const d = r.datos, p = porClave.get(JSON.stringify([d.STYLE, d.MATERIAL_CODE, d.COLOR_CODE]));
    if (!p) continue;
    guardar(p.marcas, d.MARCA); guardar(p.descripciones, d.DESCRIPCION);
    guardar(p.materiales, d.DESCRIPCION_MATERIAL); guardar(p.colores, d.DESCRIPCION_COLOR);
    const cajas = Number(d.BOXES);
    if (Number.isSafeInteger(cajas) && cajas > 0) p.cajasPacking = (p.cajasPacking ?? 0) + cajas;
  }
  for (const r of previews.CODIGOS_BARRA.registros) {
    if (r.errores.length) continue;
    const d = r.datos, p = porClave.get(JSON.stringify([`${d.LINHA}.${d.REFERENCIA}`, d.CABEDAL, d.COR]));
    if (p) p.cajasCodigos = (p.cajasCodigos ?? 0) + 1;
  }
  for (const r of previews.EAN.registros) {
    if (r.errores.length) continue;
    const d = r.datos, p = porClave.get(JSON.stringify([d.STYLE, d.CABEDAL, d.COR]));
    if (p) guardar(p.marcas, d.MARCA);
  }
  for (const p of productos.listado) {
    const asignaciones = productos.asignaciones.filter(a => a.PRODUCTO === p.PRODUCTO);
    const encontradas = asignaciones.filter(a => a.estado === 'ENCONTRADO');
    p.codigosInternos = [...new Set(encontradas.map(a => a.CODIGO))];
    p.modelos = [...new Set(encontradas.map(a => a.MODC))];
    p.controlMaestro = asignaciones.map(a => ({ SIZE_RUN: a.SIZE_RUN, estado: a.coincidencia || (a.estado === 'ENCONTRADO' ? 'ENCONTRADO' : 'NO_ENCONTRADO') }));
    p.situacionMaestro = p.controlMaestro.map(a => `${a.SIZE_RUN}: ${a.estado === 'ENCONTRADO' ? 'Encontrado' : a.estado === 'PENDIENTE' ? 'Pendiente de maestro' : 'No encontrado'}`).join(' | ');
    p.preparacion = productos.maestro?.disponible === false || cruce.estado === 'PARCIAL' || p.estado === 'REVISAR'
      ? 'REVISAR' : p.controlMaestro.some(a => a.estado === 'NO_ENCONTRADO') ? 'SIN_COINCIDENCIA_PARA_EVALUAR' : 'EXISTENTE_EN_MAESTRO';
  }
  productos.presea = {
    total: productos.listado.length,
    claves: productos.asignaciones.length,
    encontrados: productos.listado.flatMap(p => p.controlMaestro).filter(a => a.estado === 'ENCONTRADO').length,
    sinCoincidencia: productos.listado.flatMap(p => p.controlMaestro).filter(a => a.estado === 'NO_ENCONTRADO').length,
    pendientesMaestro:productos.listado.flatMap(p=>p.controlMaestro).filter(a=>a.estado==='PENDIENTE').length,
    pendientesRevision: productos.listado.filter(p => p.preparacion === 'REVISAR').length,
    alcance: cruce.estado,
    nota: 'Resumen para preparar en Presea. Sin coincidencia no implica un alta nueva: la decisión y las reglas de Presea todavía no están implementadas. Cajas y pares provienen de filas válidas; un análisis parcial no representa todo el lote.'
  };
  const porMarca = new Map();
  for (const p of productos.listado) {
    const marca = p.marcas.length === 1 ? p.marcas[0] : 'Marca sin definir';
    if (!porMarca.has(marca)) porMarca.set(marca, { marca, encontrados:0, noEncontrados:0, pendientes:0, total:0 });
    const grupo = porMarca.get(marca);
    for (const control of p.controlMaestro) {
      grupo.total++;
      if (control.estado === 'ENCONTRADO') grupo.encontrados++;
      else if (control.estado === 'NO_ENCONTRADO') grupo.noEncontrados++;
      else grupo.pendientes++;
    }
  }
  const filas = [...porMarca.values()].sort((a,b)=>a.marca.localeCompare(b.marca,'es'));
  const total = { marca:'TOTAL GENERAL', encontrados:0, noEncontrados:0, pendientes:0, total:0 };
  for (const fila of filas) for (const campo of ['encontrados','noEncontrados','pendientes','total']) total[campo]+=fila[campo];
  productos.resumenCoincidencias = { filas, total, nota:'Cada Código de Barra Versato del archivo se cuenta una vez. Las repeticiones por caja no generan módulos adicionales. La búsqueda usa COD_ALFAB1 exactamente, sin modificar el año. Si el maestro no está actualizado, se muestra pendiente, no como no encontrado.' };
  return productos;
}
module.exports = { resumenPresea };
