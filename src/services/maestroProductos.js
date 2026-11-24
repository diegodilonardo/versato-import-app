const fs = require('node:fs');
const path = require('node:path');
const columnas = ['ESTILO','COD_COLOR','COLOR','COD_MATERIAL','MATERIAL','SIZE_RUN','FECHA_ALTA','CODIGO','COD_ALFA','DETALLE','DMARCA','MODC','DMODC','NIVEL','COD_ALFABA','COD_ALFAB1','COD_AÑO','DCLASIFIC','DCOD_TEM','COLORC','DCOLORC','SEXO','TALLC','DTALLC','PARES','DSUBG','DGRUPO','DET_LINEA'];
const clave = (producto, grade) => `${producto}.${grade}`;
function parsearMaestro(texto) {
  const indice = new Map(); let registros = 0; const omitidas = [];
  for (const [i, linea] of texto.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!linea.trim()) continue;
    let valores = linea.split('|').map(v => v.trim());
    if(valores.length>28){
      // Presea exporta sin comillas el DETALLE de los módulos, que puede contener |.
      // Solo reconstruirlo cuando el prefijo y los 18 campos finales son inequívocos.
      const cola=valores.slice(-18),detalle=valores.slice(9,-18);
      const estructura=/^\d+\.\d+$/.test(valores[0])&&/^\d+$/.test(valores[1])&&/^\d+$/.test(valores[3])&&/^\d+$/.test(valores[5])&&/^\d+$/.test(valores[7])&&/^[A-Z0-9]{12,15}$/i.test(valores[8])&&/^[A-Z]+\d+$/i.test(cola[1])&&cola[3]==='950'&&/^\d+(?:\.\d+){3,6}$/.test(cola[5])&&/^\d{2}$/.test(cola[6])&&/^\d+$/.test(cola[14]);
      const descripcion=detalle.length>=2&&detalle.length<=3&&detalle[0]===cola[2]&&detalle[1]&&(valores[2].startsWith(detalle[1])||detalle[1].startsWith(valores[2]))&&(detalle.length===2||/^S(?:Z(?::\s*\d*)?)?$/i.test(detalle[2]));
      if(estructura&&descripcion)valores=[...valores.slice(0,9),linea.split('|').slice(9,-18).join('|').trim(),...cola];
    }
    if (valores.length !== 28) throw new Error(`Maestro: fila ${i + 1} tiene ${valores.length} campos; se esperan 28.`);
    const r = Object.fromEntries(columnas.map((c, j) => [c, valores[j]]));
    if (r.ESTILO === 'ESTILO') continue;
    if (!r.COD_ALFAB1) { omitidas.push(i + 1); continue; }
    const k = r.COD_ALFAB1;
    if (!indice.has(k)) indice.set(k, []);
    indice.get(k).push({ ...r, filaMaestro: i + 1 }); registros++;
  }
  return { indice, registros, omitidas };
}
function cargarMaestro() {
  const archivo = process.env.MAESTRO_PRODUCTOS_PATH || path.join(__dirname, '../../data/Maestro_Versato.TXT');
  try {
    const buffer = fs.readFileSync(archivo);
    if (buffer.length > 50 * 1024 * 1024) throw new Error('Maestro: supera los 50 MB.');
    let texto;
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { texto = new TextDecoder('windows-1252').decode(buffer); }
    return { ...parsearMaestro(texto), disponible: true, archivo: path.basename(archivo), actualizado: fs.statSync(archivo).mtime.toISOString() };
  } catch (error) { return { disponible: false, mensaje: error.code === 'ENOENT' ? 'No hay copia local del maestro.' : error.message }; }
}
function aplicarMaestro(productos, facturas, maestro = cargarMaestro()) {
  const anio = facturas.length === 1 ? /\/(20\d{2})\s*$/.exec(facturas[0])?.[1].slice(-2) || null : null;
  productos.maestro = { disponible: maestro.disponible, archivo: maestro.archivo || null, actualizado: maestro.actualizado || null,
    origen:maestro.origen||'LOCAL',huella:maestro.huella||null,rutaRemota:maestro.rutaRemota||null,
    registros: maestro.registros || 0, filasOmitidas: maestro.omitidas || [], factura: facturas[0] || null, anio, criterio: 'Código de Barra Versato del archivo = COD_ALFAB1 (exacto)', mensaje: maestro.mensaje || (maestro.omitidas?.length ? `Se omitieron ${maestro.omitidas.length} filas del maestro sin COD_ALFAB1.` : null) };
  productos.asignaciones = [];
  for (const p of productos.listado) {
    const asignaciones = p.sizeRuns.flatMap(grade => {
      const base = clave(p.PRODUCTO, grade);
      const codigos=[...new Set((p.codigosVersato||[]).map(v=>String(v).trim()).filter(Boolean))];
      const asociadas=codigos.filter(c=>c===base||c.startsWith(base+'.'));
      const candidatas=asociadas.length?asociadas:p.sizeRuns.length===1?codigos.filter(c=>!c.startsWith(p.PRODUCTO+'.')):[];
      return (candidatas.length?candidatas:[null]).map(buscada=>{
      const sufijo=buscada?.startsWith(base+'.')?buscada.slice(base.length+1):null;
      const anioClave=sufijo&&/^\d{2}$/.test(sufijo)?sufijo:anio;

      const clavesBuscadas = buscada ? [buscada] : [];
      const filas = maestro.disponible && buscada ? maestro.indice.get(buscada) || [] : [];
      // Descripciones o fechas distintas no cambian la asignación del código.
      const unicas = [...new Map(filas.map(r => [JSON.stringify(['CODIGO', 'MODC', 'COD_ALFA', 'COD_AÑO'].map(c => r[c])), r])).values()];
      const r = unicas.length === 1 ? unicas[0] : null;
      const estado = !maestro.disponible ? 'MAESTRO_NO_DISPONIBLE' : !buscada ? 'CODIGO_VERSATO_NO_DEFINIDO' : !filas.length ? 'SIN_COINCIDENCIA' : !r ? 'MAESTRO_AMBIGUO' : !r.CODIGO || !r.MODC ? 'MAESTRO_INCOMPLETO' : 'ENCONTRADO';
      return { PRODUCTO: p.PRODUCTO, SIZE_RUN: grade, claveBuscada: buscada, clavesBuscadas, COD_ALFAB1: r ? r.COD_ALFAB1 : null, AA: anioClave,
        CODIGO: estado === 'ENCONTRADO' ? r.CODIGO : null, MODC: estado === 'ENCONTRADO' ? r.MODC : null,
        COD_ALFA: estado === 'ENCONTRADO' ? r.COD_ALFA : null,
        CODIGO_DE_BARRA: buscada,
        CODIGO_SUELTO: null, estado, coincidencia: !maestro.disponible || !buscada ? 'PENDIENTE' : filas.length ? 'ENCONTRADO' : 'NO_ENCONTRADO', filasMaestro: filas.map(r => r.filaMaestro) };
      });
    });
    productos.asignaciones.push(...asignaciones);
    const completas = asignaciones.length > 0 && asignaciones.every(a => a.estado === 'ENCONTRADO');
    if (p.estado !== 'REVISAR') p.estado = completas ? 'MAESTRO_ENCONTRADO' : asignaciones.some(a => a.estado === 'MAESTRO_AMBIGUO') ? 'MAESTRO_AMBIGUO' : 'PENDIENTE_MAESTRO';
    const anios = [...new Set(asignaciones.map(a => a.AA).filter(Boolean))];
    p.AA = completas && anios.length === 1 ? anios[0] : null;
    const codigos = [...new Set(asignaciones.map(a => a.CODIGO).filter(Boolean))];
    const modelos = [...new Set(asignaciones.map(a => a.MODC).filter(Boolean))];
    p.CODIGO = completas && codigos.length === 1 ? codigos[0] : null;
    p.MODC = completas && modelos.length === 1 ? modelos[0] : null;
  }
  productos.resumen.pendientesMaestro = productos.listado.filter(p => ['PENDIENTE_MAESTRO', 'MAESTRO_AMBIGUO'].includes(p.estado)).length;
  productos.resumen.maestroEncontrado = productos.listado.filter(p => p.estado === 'MAESTRO_ENCONTRADO').length;
  productos.notas = [productos.notas[0],
    'Maestro: coincidencia exacta Código de Barra Versato del archivo = COD_ALFAB1. No se agrega, quita ni sustituye el año al buscar.',
    'CODIGO y MODC se copian del maestro con coincidencia única. CODIGO_DE_BARRA conserva la clave del archivo. Una clave existente no genera otro módulo.',
    'CODIGO_SUELTO continúa pendiente de su regla. Códigos por grade y filas del maestro se detallan en Asignaciones maestro.',
    productos.notas.at(-1)];
  return productos;
}
module.exports = { parsearMaestro, aplicarMaestro, cargarMaestro };
