const XLSX = require('xlsx');
const { normalizar } = require('./detectarArchivo');
const { agruparEans } = require('./agruparEans');
const { leerLibro } = require('./leerLibro');
const esTalle = valor => /^\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?$/.test(valor);
const definiciones = {
  EAN: [
    ['MARCA', 'Descrição Marca', true], ['STYLE', 'Linha/Ref', true],
    ['CABEDAL', 'Cabedal', true], ['COR', 'Cor', true],
    ['TALLE', 'Numeração Ext', true], ['EAN', 'Ean 13', true], ['PARES', 'Qtd. Pares', false]
  ],
  PACKING_LIST: [
    ['STYLE', 'STYLE', true], ['MATERIAL_CODE', 'MATERIAL CODE', true],
    ['COLOR_CODE', 'COLOR CODE', true], ['SIZE_RUN', 'SIZE RUN', true],
    ['BOXES', 'BOXES', true], ['PAIRS', 'PAIRS', true], ['SHOP', 'SHOP', false],
    ['MARCA', 'BRAND', false], ['DESCRIPCION', 'NAME', false],
    ['DESCRIPCION_MATERIAL', 'MATERIAL', false], ['DESCRIPCION_COLOR', 'COLOR', false]
  ]
};
function eanValido(codigo) {
  if (!/^\d{13}$/.test(codigo)) return false;
  const suma = [...codigo.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - suma % 10) % 10 === Number(codigo[12]);
}
function vistaPreviaOtros(buffer, deteccion, incluirRegistros = false) {
  const esPacking = deteccion.tipo === 'PACKING_LIST';
  const mapeo = definiciones[deteccion.tipo].map(([destino, origen, obligatorio]) => {
    const encontrados = deteccion.encabezados.filter(h => h.normalizado === normalizar(origen));
    if (encontrados.length > 1) throw Object.assign(new Error(`Hay columnas duplicadas para ${destino}.`), { status: 422 });
    return { destino, origen, obligatorio, columna: encontrados[0]?.columna || null };
  });
  let libro;
  try { libro = leerLibro(buffer, { sheets: [deteccion.hoja], sheetRows: 50101 }); }
  catch { throw Object.assign(new Error('No se pudieron leer los datos de la hoja.'), { status: 422 }); }
  const hoja = libro.Sheets[deteccion.hoja];
  const rango = XLSX.utils.decode_range(hoja['!fullref'] || hoja['!ref']);
  if (rango.e.r - deteccion.filaEncabezados + 1 > 50000) throw Object.assign(new Error('La vista previa admite hasta 50.000 filas después de los encabezados.'), { status: 422 });
  const registros = [];
  let vacias = 0, auxiliares = 0;
  const columnas = deteccion.encabezados.map(h => h.columna);
  const finFijos = Math.max(...mapeo.filter(m => m.columna).map(m => XLSX.utils.decode_col(m.columna)));
  const iniciales = esPacking ? deteccion.encabezados.filter(h => XLSX.utils.decode_col(h.columna) > finFijos && esTalle(h.texto)) : [];
  const inicioTalles = iniciales.length ? Math.min(...iniciales.map(h => XLSX.utils.decode_col(h.columna))) : null;
  const columnasTalles = inicioTalles == null ? [] : Array.from({ length: Math.min(rango.e.c, 255) - inicioTalles + 1 }, (_, i) => XLSX.utils.encode_col(inicioTalles + i));
  let talles = iniciales.map(h => ({ columna: h.columna, talle: h.texto }));
  const texto = (c, fila) => c && hoja[`${c}${fila}`] ? XLSX.utils.format_cell(hoja[`${c}${fila}`]).trim() : '';
  for (let fila = deteccion.filaEncabezados + 1; fila <= rango.e.r + 1; fila++) {
    const datos = Object.fromEntries(mapeo.map(m => [m.destino, texto(m.columna, fila)]));
    const errores = [], advertencias = [];
    if (!columnas.some(c => texto(c, fila) || hoja[`${c}${fila}`]?.f)) { vacias++; continue; }
    // Encabezados completos repetidos dentro del reporte.
    if (mapeo.filter(m => m.columna).every(m => normalizar(datos[m.destino]) === normalizar(m.origen))) { auxiliares++; continue; }
    if (esPacking) {
      const identidad = ['STYLE', 'MATERIAL_CODE', 'COLOR_CODE', 'SIZE_RUN', 'BOXES', 'SHOP'].some(c => datos[c]);
      const nuevos = columnasTalles.map(c => ({ columna: c, talle: texto(c, fila) })).filter(t => t.talle);
      if (!identidad && nuevos.length && nuevos.every(t => esTalle(t.talle)) && !datos.PAIRS) {
        talles = nuevos; auxiliares++; continue;
      }
      // Totales aislados y notas sin campos de producto/caja: no son registros.
      if (!identidad && !nuevos.length) { auxiliares++; continue; }
      datos.TALLE = talles.map(t => t.talle).join(' ');
      datos.CANTIDAD = talles.map(t => texto(t.columna, fila) || '0').join(' ');
    }
    for (const m of mapeo) {
      if (m.obligatorio && !datos[m.destino]) errores.push(`${m.origen}: obligatorio vacío${m.columna ? '' : ' (columna no encontrada)'}.`);
      const cell = m.columna && hoja[`${m.columna}${fila}`];
      if (cell?.t === 'e') errores.push(`${m.origen}: error de Excel.`);
      if (cell?.f && cell.v == null) errores.push(`${m.origen}: fórmula sin resultado guardado.`);
    }
    const numero = destino => {
      const m = mapeo.find(m => m.destino === destino);
      const v = m?.columna && hoja[`${m.columna}${fila}`]?.v;
      return typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
    };
    if (esPacking) {
      for (const c of ['BOXES', 'PAIRS']) if (datos[c] && (!Number.isSafeInteger(numero(c)) || numero(c) <= 0)) errores.push(`${c}: debe ser un entero positivo.`);
      if (!talles.length) advertencias.push('No se encontraron columnas de talles; no se verificó la suma.');
      else {
        const cantidades = talles.map(t => {
          const cell = hoja[`${t.columna}${fila}`];
          if (cell?.t === 'e' || (cell?.f && cell.v == null)) errores.push(`Talle ${t.talle}: error o fórmula sin resultado.`);
          return cell?.v == null || cell.v === '' ? 0 : Number(String(cell.v).replace(',', '.'));
        });
        if (cantidades.some(n => !Number.isSafeInteger(n) || n < 0)) errores.push('Cantidades por talle: deben ser enteros no negativos.');
        else if (datos.PAIRS && datos.BOXES && cantidades.reduce((s, n) => s + n, 0) * numero('BOXES') !== numero('PAIRS')) errores.push('La suma por talle multiplicada por BOXES no coincide con PAIRS.');
      }
    } else {
      if (datos.EAN && !eanValido(datos.EAN)) errores.push('EAN: debe tener 13 dígitos y un dígito de control válido.');
      if (datos.PARES && (!Number.isSafeInteger(numero('PARES')) || numero('PARES') < 0)) errores.push('Qtd. Pares: debe ser un entero no negativo.');
    }
    registros.push({ fila, datos, errores, advertencias,
      ...(!esPacking ? { paresNumericos: datos.PARES ? numero('PARES') : null } : {}) });
  }
  const agrupacion = esPacking ? null : agruparEans(registros);
  if (esPacking) for (const destino of ['TALLE', 'CANTIDAD']) mapeo.push({ destino, origen: 'Columnas de talles vigentes', columna: columnasTalles.join(', '), obligatorio: false });
  const problemas = registros.filter(r => r.errores.length || r.advertencias.length);
  const conErrores = registros.filter(r => r.errores.length).length;
  return {
    ...(incluirRegistros ? { registros } : {}),
    ...(agrupacion ? { agrupacion } : {}),
    mapeo, resumen: { total: registros.length, validos: registros.length - conErrores, conErrores,
      conAdvertencias: registros.filter(r => r.advertencias.length).length, filasVaciasOmitidas: vacias, filasAuxiliaresOmitidas: auxiliares },
    filas: registros.slice(0, 20), problemas: problemas.slice(0, 200), totalProblemas: problemas.length, limiteProblemas: 200,
    notas: ['Vista previa: primeras 20 filas de datos. No se guardaron datos.',
      ...(esPacking ? [`Se omitieron ${auxiliares} filas auxiliares (encabezados de talles, totales aislados y notas sin campos de producto/caja).`,
        'Los talles se actualizan al encontrar una fila intermedia de talles. Se verifica suma por talle × BOXES = PAIRS.']
        : ['EAN: las repeticiones compatibles se agrupan sumando pares. Los conflictos de asignación son errores y se excluyen de la agrupación.',
          'Se conservan las filas originales. Las cantidades ausentes se muestran sin total completo, no como cero.']),
      'Las fórmulas usan el resultado guardado en Excel; la app no las recalcula.']
  };
}
module.exports = { vistaPreviaOtros, eanValido };
