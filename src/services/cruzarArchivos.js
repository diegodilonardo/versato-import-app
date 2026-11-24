const { detectarArchivo } = require('./detectarArchivo');
const { vistaPrevia } = require('./vistaPrevia');
const { vistaPreviaOtros } = require('./vistaPreviaOtros');
const { generarProductos } = require('./generarProductos');
const { aplicarMaestro } = require('./maestroProductos');
const { resumenPresea } = require('./resumenPresea');
const { leerFactura, controlarFactura } = require('./factura');
const { resumenMarcas } = require('./resumenMarcas');
const { proponerModulos } = require('./modelos');
const { completarDatosModulos } = require('./marcas');
const { completarRubrosFact } = require('./rubrosFact');
function comparar(previews) {
  const mapa = new Map();
  function agregar(tipo, style, material, color, talle, cantidad, fila, ean) {
    const key = JSON.stringify([style, material, color, talle]);
    if (!mapa.has(key)) mapa.set(key, { STYLE: style, MATERIAL: material, COLOR: color, TALLE: talle,
      PACKING_LIST: null, CODIGOS_BARRA: null, EAN: null, eans: [], filas: { PACKING_LIST: [], CODIGOS_BARRA: [], EAN: [] } });
    const grupo = mapa.get(key);
    grupo[tipo] = (grupo[tipo] ?? 0) + cantidad;
    if (!Number.isSafeInteger(grupo[tipo])) throw Object.assign(new Error('La suma de cantidades supera la precisión admitida.'), { status: 422 });
    if (ean && !grupo.eans.includes(ean)) grupo.eans.push(ean);
    if (!grupo.filas[tipo].includes(fila)) grupo.filas[tipo].push(fila);
  }
  const omitidas = [];
  for (const tipo of ['PACKING_LIST', 'CODIGOS_BARRA']) {
    for (const r of previews[tipo].registros) {
      if (r.errores.length) { omitidas.push({ tipo, fila: r.fila, motivos: r.errores }); continue; }
      const d = r.datos;
      const talles = d.TALLE?.split(/\s+/).filter(Boolean) || [];
      const cantidades = d.CANTIDAD?.split(/\s+/).filter(Boolean) || [];
      if (!talles.length || talles.length !== cantidades.length || cantidades.some(n => !/^\d+$/.test(n))) {
        omitidas.push({ tipo, fila: r.fila, motivos: ['No se pudo distribuir la cantidad por talle.'] }); continue;
      }
      const style = tipo === 'PACKING_LIST' ? d.STYLE : `${d.LINHA}.${d.REFERENCIA}`;
      const multiplicador = tipo === 'PACKING_LIST' ? Number(d.BOXES) : 1;
      if (!Number.isSafeInteger(multiplicador) || multiplicador <= 0) { omitidas.push({ tipo, fila: r.fila, motivos: ['BOXES no interpretable.'] }); continue; }
      for (let i = 0; i < talles.length; i++) {
        const cantidad = Number(cantidades[i]) * multiplicador;
        if (!cantidad) continue;
        agregar(tipo, style, tipo === 'PACKING_LIST' ? d.MATERIAL_CODE : d.CABEDAL,
          tipo === 'PACKING_LIST' ? d.COLOR_CODE : d.COR, talles[i], cantidad, r.fila);
      }
    }
  }
  for (const r of previews.EAN.registros) {
    if (r.errores.length || r.paresNumericos == null) {
      omitidas.push({ tipo: 'EAN', fila: r.fila, motivos: r.errores.length ? r.errores : ['Cantidad de pares no disponible.'] }); continue;
    }
    const d = r.datos;
    agregar('EAN', d.STYLE, d.CABEDAL, d.COR, d.TALLE, r.paresNumericos, r.fila, d.EAN);
  }
  const sinMovimiento = [...mapa.values()].filter(g => g.PACKING_LIST == null && g.CODIGOS_BARRA == null && g.EAN === 0);
  const filas = [...mapa.values()].filter(g => !(g.PACKING_LIST == null && g.CODIGOS_BARRA == null && g.EAN === 0)).map(g => {
    const problemas = [];
    if (g.PACKING_LIST == null) problemas.push('Sin Packing List');
    if (g.CODIGOS_BARRA == null) problemas.push('Sin Códigos de Barra');
    if (g.EAN == null) problemas.push('Sin EAN válido con cantidad');
    if (g.PACKING_LIST != null && g.CODIGOS_BARRA != null && g.PACKING_LIST !== g.CODIGOS_BARRA) problemas.push('Diferencia Packing / Códigos');
    if (g.PACKING_LIST != null && g.EAN != null && g.PACKING_LIST !== g.EAN) problemas.push('Diferencia Packing / EAN');
    if (g.CODIGOS_BARRA != null && g.EAN != null && g.CODIGOS_BARRA !== g.EAN) problemas.push('Diferencia Códigos / EAN');
    return { ...g, estado: problemas.length ? 'REVISAR' : 'COINCIDE', problemas };
  });
  return { estado: omitidas.length ? 'PARCIAL' : 'COMPLETO', filas, omitidas, sinMovimiento,
    resumen: { combinaciones: filas.length, coinciden: filas.filter(r => r.estado === 'COINCIDE').length,
      revisar: filas.filter(r => r.estado === 'REVISAR').length, filasExcluidas: omitidas.length, eanSinMovimiento: sinMovimiento.length,
      sinEan: filas.filter(r => r.EAN == null && (r.PACKING_LIST != null || r.CODIGOS_BARRA != null)).length,
      pares: Object.fromEntries(['PACKING_LIST', 'CODIGOS_BARRA', 'EAN'].map(t => [t, filas.reduce((s, r) => s + (r[t] ?? 0), 0)])) },
    notas: ['Comparación textual exacta por STYLE + MATERIAL/CABEDAL + COLOR/COR + TALLE. Códigos usa LINHA.REFERENCIA como STYLE.',
      'Packing: cantidad por talle × BOXES. Códigos de Barra: cantidad por talle por cada fila de caja. EAN: suma de pares por combinación.',
      'Los talles 36/37 se conservan como un solo talle. No se rellenan ceros ni se corrigen identificadores automáticamente.',
      'Solo se comparan filas válidas con cantidades disponibles. Un cruce parcial no confirma el lote completo.',
      `${sinMovimiento.length} combinaciones EAN con cero pares y sin movimiento en Packing/Códigos se conservan aparte; no son faltantes. Un cero EAN frente a cantidades positivas sí genera diferencia.`,
      'Seleccioná archivos de la misma factura. La pertenencia a una factura no se verifica para EAN y Packing List. No se guardan datos.'] };
}
function cruzarArchivos(files, maestro, modelos, marcas, rubrosFact) {
  if (![3,4].includes(files?.length)) throw Object.assign(new Error('Seleccioná los tres archivos habituales y, opcionalmente, la Factura como cuarto archivo.'), { status: 400 });
  const previews = {}, archivos = [];
  for (const file of files) {
    const d = detectarArchivo(file.buffer);
    if (d.estado !== 'DETECTADO') throw Object.assign(new Error(`${file.originalname}: ${d.estado === 'AMBIGUO' ? 'se encontraron varias hojas o formatos compatibles.' : d.mensaje}`), { status: 422 });
    if (previews[d.tipo]) throw Object.assign(new Error(`Se detectaron dos archivos de tipo ${d.nombre}. Se necesita uno de cada tipo.`), { status: 422 });
    previews[d.tipo] = d.tipo === 'CODIGOS_BARRA' ? vistaPrevia(file.buffer, d, true) : d.tipo === 'FACTURA' ? leerFactura(file.buffer,d,true) : vistaPreviaOtros(file.buffer, d, true);
    const { registros, ...previewPublica } = previews[d.tipo];
    archivos.push({ archivo: file.originalname, tipo: d.tipo, hoja: d.hoja, deteccion: d, vistaPrevia: previewPublica });
  }
  if (!['PACKING_LIST','CODIGOS_BARRA','EAN'].every(t=>previews[t])) throw Object.assign(new Error('Falta Packing List, Códigos de Barra o EAN. La Factura es un cuarto archivo opcional.'),{status:400});
  const resultado = comparar(previews);
  const facturas = [...new Set(previews.CODIGOS_BARRA.registros.map(r => r.datos.Factura).filter(Boolean))];
  if (facturas.length > 1) throw Object.assign(new Error('Códigos de Barra contiene varias facturas. Separá el lote antes de cruzar.'), { status: 422 });
  const productos = resumenPresea(aplicarMaestro(generarProductos(resultado, previews), facturas, maestro), previews, resultado);
  if(modelos)proponerModulos(productos,maestro,modelos);
  if(marcas)completarDatosModulos(productos,previews,marcas);
  if(rubrosFact)completarRubrosFact(productos,rubrosFact);
  const salida = { archivos, facturas, ...resultado, productos, resumenMarcas:resumenMarcas(productos,previews.FACTURA), ...(previews.FACTURA?{controlFactura:controlarFactura(previews.FACTURA,productos,facturas)}:{}) };
  Object.defineProperty(salida,'datosPersistencia',{value:previews,enumerable:false});
  return salida;
}
module.exports = { cruzarArchivos, comparar };
