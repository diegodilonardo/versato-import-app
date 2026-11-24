const XLSX = require('xlsx');
const { normalizar } = require('./detectarArchivo');
const { leerLibro } = require('./leerLibro');
const campos = [
  ['CAJA_MASTER', ['Caja Master']], ['LINHA', ['Linha']],
  ['REFERENCIA', ['Referência']], ['CABEDAL', ['Cabedal']], ['COR', ['Cor']],
  ['TALLE', ['Tamanho Externo']], ['CANTIDAD', ['Quantidade Grade']],
  ['PARES', ['Total Pares']], ['LOJAS', ['Lojas']],
  ['Factura', ['Invoice', 'Factura', 'Fatura']],
  ['CODIGO_BARRA', ['Código de Barra Versato']],
  ['CODIGO_CAJA', ['Código De Barras']]
];

function vistaPrevia(buffer, deteccion, incluirRegistros = false) {
  const mapeo = campos.map(([destino, alias]) => {
    const encontrados = deteccion.encabezados.filter(h => alias.some(a => normalizar(a) === h.normalizado));
    if (encontrados.length > 1) throw Object.assign(new Error(`Hay columnas duplicadas para ${destino}. Corregí los encabezados.`), { status: 422 });
    return { destino, origen: encontrados[0]?.texto || null, columna: encontrados[0]?.columna || null };
  });
  let libro;
  try { libro = leerLibro(buffer, { sheets: [deteccion.hoja], sheetRows: 50101 }); }
  catch { throw Object.assign(new Error('No se pudieron leer los datos de la hoja.'), { status: 422 }); }
  const hoja = libro.Sheets[deteccion.hoja];
  const rango = XLSX.utils.decode_range(hoja['!fullref'] || hoja['!ref']);
  if (rango.e.r - deteccion.filaEncabezados + 1 > 50000) {
    throw Object.assign(new Error('La vista previa admite hasta 50.000 filas después de los encabezados.'), { status: 422 });
  }
  const registros = [];
  let omitidas = 0;
  for (let r = deteccion.filaEncabezados; r <= rango.e.r; r++) {
    const datos = {};
    const errores = [];
    for (const campo of mapeo) {
      const celda = campo.columna ? hoja[`${campo.columna}${r + 1}`] : null;
      // Identificadores en texto, preservando ceros del formato de Excel.
      datos[campo.destino] = celda ? XLSX.utils.format_cell(celda).trim() : '';
      if (celda?.t === 'e') errores.push(`${campo.origen}: celda con error de Excel.`);
      if (celda?.f && celda.v == null) errores.push(`${campo.origen}: fórmula sin resultado guardado.`);
    }
    const hayContenido = deteccion.encabezados.some(h => {
      const c = hoja[`${h.columna}${r + 1}`];
      return c && (c.f || String(c.v ?? '').trim());
    });
    if (!hayContenido) { omitidas++; continue; }
    for (const campo of mapeo.filter(c => c.destino !== 'CODIGO_CAJA')) {
      if (!datos[campo.destino]) errores.push(`${campo.origen}: obligatorio vacío.`);
    }
    const cantidades = datos.CANTIDAD.split(/\s+/).filter(Boolean);
    const talles = datos.TALLE.split(/\s+/).filter(Boolean);
    const gradoValido = cantidades.length > 0 && cantidades.every(n => /^\d+$/.test(n));
    if (datos.CANTIDAD && !gradoValido) errores.push('Quantidade Grade: usar enteros no negativos separados por espacios.');
    if (gradoValido && cantidades.length !== talles.length) errores.push('La cantidad de talles no coincide con la cantidad de valores de la grade.');
    const celdaPares = hoja[`${mapeo.find(c => c.destino === 'PARES').columna}${r + 1}`];
    const pares = typeof celdaPares?.v === 'number' ? celdaPares.v : Number(String(celdaPares?.v ?? '').replace(',', '.'));
    if (datos.PARES && (!Number.isSafeInteger(pares) || pares <= 0)) errores.push('Total Pares: debe ser un entero positivo.');
    else if (datos.PARES && gradoValido && cantidades.reduce((s, n) => s + Number(n), 0) !== pares) errores.push('La suma de Quantidade Grade no coincide con Total Pares.');
    registros.push({ fila: r + 1, datos, errores, advertencias: [] });
  }
  // El código Versato identifica una combinación y puede repetirse por caja.
  // El código físico se revisa dentro de la misma factura; no bloquea la fila.
  const grupos = new Map();
  for (const registro of registros) {
    const codigo = registro.datos.CODIGO_CAJA;
    if (!codigo) continue;
    const clave = JSON.stringify([registro.datos.Factura, codigo]);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(registro);
  }
  for (const grupo of grupos.values()) if (grupo.length > 1) {
    for (const registro of grupo) registro.advertencias.push(`Código físico de caja repetido en la misma factura (${grupo.length} filas).`);
  }
  const problemas = registros.filter(r => r.errores.length || r.advertencias.length);
  const invalidos = registros.filter(r => r.errores.length).length;
  return {
    ...(incluirRegistros ? { registros } : {}),
    mapeo, resumen: { total: registros.length, validos: registros.length - invalidos,
      conErrores: invalidos, conAdvertencias: registros.filter(r => r.advertencias.length).length, filasVaciasOmitidas: omitidas },
    filas: registros.slice(0, 20), problemas: problemas.slice(0, 200),
    totalProblemas: problemas.length, limiteProblemas: 200,
    notas: ['Vista previa: primeras 20 filas no vacías. No se guardaron datos.',
      'Código de Barra Versato puede repetirse por caja. Los duplicados del código físico dentro de la misma factura son advertencias para revisar.',
      'Las fórmulas usan el resultado guardado en Excel; la app no las recalcula.']
  };
}
module.exports = { vistaPrevia };
