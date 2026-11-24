const XLSX = require('xlsx');
const formatos = require('../config/formatos');
const { leerLibro } = require('./leerLibro');

const LIMITES = { filas: 100, columnas: 256, hojas: 100 };
const normalizar = valor => {
  const texto = String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return texto === 'LINREF' ? 'LINHAREF' : texto;
};

function detectarLibro(libro) {
  if (libro.SheetNames.length > LIMITES.hojas) {
    throw Object.assign(new Error('El libro supera el límite de 100 hojas.'), { status: 422 });
  }
  const coincidencias = [];
  const diagnostico = [];
  for (const hoja of libro.SheetNames) {
    const ws = libro.Sheets[hoja];
    if (!ws?.['!ref']) continue;
    const rango = XLSX.utils.decode_range(ws['!ref']);
    let mejor = null;
    for (let r = 0; r <= Math.min(rango.e.r, LIMITES.filas - 1); r++) {
      const encabezados = [];
      for (let c = 0; c <= Math.min(rango.e.c, LIMITES.columnas - 1); c++) {
        const celda = ws[XLSX.utils.encode_cell({ r, c })];
        if (!celda || celda.t === 'e' || celda.f || celda.v == null) continue;
        const texto = String(celda.v).trim();
        if (texto) encabezados.push({ columna: XLSX.utils.encode_col(c), texto, normalizado: normalizar(texto) });
      }
      if (!encabezados.length) continue;
      const nombres = new Set(encabezados.map(h => h.normalizado));
      for (const formato of formatos) {
        const faltantes = formato.campos.filter(alias => !alias.some(a => nombres.has(normalizar(a))))
          .map(alias => alias[0]);
        const encontrados = formato.campos.length - faltantes.length;
        const candidato = { tipo: formato.tipo, nombre: formato.nombre, hoja,
          filaEncabezados: r + 1, encabezados, faltantes };
        if (!faltantes.length) coincidencias.push(candidato);
        const puntaje = encontrados / formato.campos.length;
        if (encontrados && (!mejor || puntaje > mejor.puntaje)) mejor = { ...candidato, puntaje };
      }
    }
    if (mejor) { const { puntaje, ...detalle } = mejor; diagnostico.push(detalle); }
  }
  // Repeticiones del mismo encabezado en una hoja no generan ambigüedad.
  const especificas = coincidencias.filter(c => !(c.tipo === 'PACKING_LIST' && coincidencias.some(f => f.tipo === 'FACTURA' && f.hoja === c.hoja && f.filaEncabezados === c.filaEncabezados)));
  const unicas = especificas.filter((c, i, lista) =>
    lista.findIndex(x => x.hoja === c.hoja && x.tipo === c.tipo) === i);
  if (unicas.length === 1) return { estado: 'DETECTADO', ...unicas[0], limites: LIMITES };
  return {
    estado: unicas.length ? 'AMBIGUO' : 'NO_RECONOCIDO', tipo: null, hoja: null,
    encabezados: [],
    mensaje: unicas.length ? 'Hay más de una hoja o formato compatible. Separá los archivos para continuar.'
      : 'No se encontró una fila con todos los encabezados requeridos.',
    coincidencias: unicas, diagnostico, limites: LIMITES
  };
}

function detectarArchivo(buffer) {
  const libro = leerLibro(buffer, { sheetRows: LIMITES.filas, cellFormula: false });
  return detectarLibro(libro);
}

module.exports = { detectarArchivo, detectarLibro, normalizar, LIMITES };
