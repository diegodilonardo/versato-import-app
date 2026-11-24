const XLSX = require('xlsx');
function exportarCruce(resultado) {
  const libro = XLSX.utils.book_new();
  function hoja(nombre, rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(wch => ({ wch }));
    if (rows.length > 1) ws['!autofilter'] = { ref: ws['!ref'] };
    XLSX.utils.book_append_sheet(libro, ws, nombre);
  }
  const s = resultado.resumen;
  if(resultado.productos?.maestro){const m=resultado.productos.maestro;hoja('Origen maestro',[['DATO','VALOR'],['Origen',m.origen],['Ruta FTP',m.rutaRemota],['Actualizado',m.actualizado],['SHA256',m.huella],['Disponible',m.disponible?'Sí':'No'],['Aviso',m.mensaje],['Análisis',resultado.analisis?.id||''],['Descarga', 'Usa los datos guardados durante el análisis, sin consultar nuevamente el FTP.']],[30,110]);}
  if(resultado.resumenMarcas){const m=resultado.resumenMarcas;hoja('Totales por marca',[['MARCA','CAJAS PACKING','CAJAS CODIGOS','CAJAS FACTURA','PARES PACKING','PARES CODIGOS','PARES EAN','PARES FACTURA','IMPORTE FACTURA'],...[...m.filas,m.total].map(r=>[r.marca,r.cajasPacking,r.cajasCodigos,r.cajasFactura,r.paresPacking,r.paresCodigos,r.paresEan,r.paresFactura,r.importeFactura])],[28,22,22,22,22,22,22,22,24]);}
  hoja('Resumen', [
    ['Concepto', 'Valor'], ['Estado', resultado.estado],
    ['Facturas en Códigos', resultado.facturas.join(', ')],
    ['Combinaciones', s.combinaciones], ['Coinciden', s.coinciden], ['Para revisar', s.revisar],
    ['Sin EAN válido con cantidad', s.sinEan], ['Filas excluidas', s.filasExcluidas],
    ...Object.entries(s.pares).map(([tipo, total]) => [`Pares comparados ${tipo}`, total]),
    ...resultado.archivos.map(a => [`Archivo ${a.tipo}`, `${a.archivo} | Hoja: ${a.hoja}`]),
    ...resultado.notas.map(n => ['Nota', n]),
    ['Exportación', 'Todas las combinaciones; no aplica los filtros de pantalla. Las cantidades ausentes se dejan vacías.']
  ], [40, 110]);
  const headers = ['STYLE', 'MATERIAL', 'COLOR', 'TALLE', 'PARES PACKING', 'PARES CODIGOS', 'PARES EAN', 'EAN', 'ESTADO', 'DETALLE', 'DIF PACKING-CODIGOS', 'DIF PACKING-EAN', 'DIF CODIGOS-EAN'];
  const diferencia = (a, b) => a == null || b == null ? null : a - b;
  const rows = resultado.filas.map(r => [r.STYLE, r.MATERIAL, r.COLOR, r.TALLE,
    r.PACKING_LIST, r.CODIGOS_BARRA, r.EAN, r.eans.join(', '), r.estado, r.problemas.join(' | '),
    diferencia(r.PACKING_LIST, r.CODIGOS_BARRA), diferencia(r.PACKING_LIST, r.EAN), diferencia(r.CODIGOS_BARRA, r.EAN)]);
  const widths = [18, 16, 16, 14, 19, 19, 19, 22, 15, 65, 24, 24, 24];
  hoja('Cruce completo', [headers, ...rows], widths);
  hoja('Diferencias', [headers, ...rows.filter(r => r[8] !== 'COINCIDE')], widths);
  hoja('Filas excluidas', [['TIPO', 'FILA EXCEL', 'MOTIVOS'], ...resultado.omitidas.map(r => [r.tipo, r.fila, r.motivos.join(' | ')])], [24, 16, 110]);
  if (resultado.sinMovimiento?.length) hoja('EAN sin movimiento', [['STYLE','MATERIAL','COLOR','TALLE','EAN','PARES','FILAS EAN'], ...resultado.sinMovimiento.map(r => [r.STYLE,r.MATERIAL,r.COLOR,r.TALLE,r.eans.join(', '),r.EAN,r.filas.EAN.join(', ')])], [18,16,16,14,24,14,40]);
  // Una fila por referencia evita truncar listas grandes de filas en una celda.
  const referencias = [['STYLE', 'MATERIAL', 'COLOR', 'TALLE', 'TIPO', 'FILA EXCEL']];
  for (const r of resultado.filas) for (const tipo of ['PACKING_LIST', 'CODIGOS_BARRA', 'EAN']) {
    for (const fila of r.filas[tipo]) referencias.push([r.STYLE, r.MATERIAL, r.COLOR, r.TALLE, tipo, fila]);
  }
  if (referencias.length > 1048576) throw Object.assign(new Error('Las referencias superan el límite de filas de Excel.'), { status: 422 });
  hoja('Origen de filas', referencias, [18, 16, 16, 14, 24, 16]);
  if (resultado.productos) {
    const p = resultado.productos;
    if(p.modulos)hoja('Modulos datos generales',[['COD_ALFAB1','DETALLE','DMODC','FECHA_ALTA','SEXO'],...p.modulos.filas.map(r=>[r.COD_ALFAB1,r.DETALLE,r.DMODC,r.FECHA_ALTA?{t:'n',v:Date.parse(r.FECHA_ALTA+'T00:00:00Z')/86400000+25569,z:'dd/mm/yyyy'}:null,r.SEXO])],[45,70,30,22,16]);
    if(p.modulos?.maestroRubrosFact)hoja('Modulos rubro facturacion',[['PRODUCTO','SIZE_RUN','DMARCA','RUBROS','RUBRO','TIPO','RUBRO_FACT','ESTADO','OBSERVACIONES'],...p.modulos.filas.map(r=>[r.PRODUCTO,r.SIZE_RUN,r.DMARCA,r.RUBROS,r.RUBRO,'MODULOS',r.RUBRO_FACT,r.estado,r.erroresDatos?.join(' | ')])],[35,15,24,15,22,20,30,28,80]);
    if(p.modulos?.maestroMarcas)hoja('Modulos campos fijos',[['COD_ALFAB1','NIVEL','ORIG_PRO','DET_ORIGEN','COD_GRUPOC','DGRUPO','COD_SUBG','DSUBG','LINEA','DET_LINEA','COD_TEM','DCOD_TEM','CLASIFIC','DCLASIFIC'],...p.modulos.filas.map(r=>[r.COD_ALFAB1,r.NIVEL,r.ORIG_PRO,r.DET_ORIGEN,r.COD_GRUPOC,r.DGRUPO,r.COD_SUBG,r.DSUBG,r.LINEA,r.DET_LINEA,r.COD_TEM,r.DCOD_TEM,r.CLASIFIC,r.DCLASIFIC])],[45,15,15,24,20,22,18,24,18,22,16,18,18,22]);
    if(p.modulos?.maestroMarcas)hoja('Modulos datos Presea',[['PRODUCTO','SIZE_RUN','COD_ALFAB1','MARCA','DMARCA','RUBROS','RUBRO','CLASIFIC','DCLASIFIC','COLORC','DCOLORC','TALLC','DTALLC','PARES','MODC','COD_ALFA','ESTADO','OBSERVACIONES'],...p.modulos.filas.map(r=>[r.PRODUCTO,r.SIZE_RUN,r.COD_ALFAB1,r.MARCA,r.DMARCA,r.RUBROS,r.RUBRO,r.CLASIFIC,r.DCLASIFIC,r.COLORC,r.DCOLORC,r.TALLC,r.DTALLC,r.PARES,r.MODC,r.COD_ALFA,r.estado,r.erroresDatos?.join(' | ')])],[35,15,45,16,25,12,18,14,20,14,40,14,70,18,18,26,28,80]);
    if(p.modulos)hoja('Modulos MODC propuestos',[['PRODUCTO','SIZE_RUN','AA','COD_ALFAB1','DMARCA','ULTIMO MODC','MODC PROPUESTO','CODIGO','COD_ALFA','ANIO COD_ALFA','ESTADO','ERROR COD_ALFA'],...p.modulos.filas.map(r=>[r.PRODUCTO,r.SIZE_RUN,r.AA,r.COD_ALFAB1,r.DMARCA,r.ultimoMODC,r.MODC,r.CODIGO,r.COD_ALFA,r.ANIO_COD_ALFA,r.estado,r.errorCodAlfa])],[35,15,10,45,25,20,22,20,25,18,28,70]);
    if(p.resumenCoincidencias){const r=p.resumenCoincidencias;hoja('Coincidencias por marca',[['MARCA','ENCONTRADOS','NO ENCONTRADOS','PENDIENTES DE MAESTRO','TOTAL PRODUCTO + SIZE_RUN + año'],...[...r.filas,r.total].map(f=>[f.marca,f.encontrados,f.noEncontrados,f.pendientes,f.total])],[28,22,22,28,32]);}
    if (p.presea) hoja('Preparacion Presea', [['PRODUCTO','MARCA','DESCRIPCION','MATERIAL','COLOR','TALLES','SIZE RUN','CAJAS PACKING','CAJAS CODIGOS','PARES PACKING','PARES CODIGOS','PARES EAN','MAESTRO','CODIGOS INTERNOS','MODC','PREPARACION'],
      ...p.listado.map(r => [r.PRODUCTO,r.marcas.join(' / '),r.descripciones.join(' / '),r.materiales.join(' / '),r.colores.join(' / '),r.talles.join(' '),r.sizeRuns.join(', '),r.cajasPacking,r.cajasCodigos,r.paresPacking,r.paresCodigos,r.paresEan,r.situacionMaestro,r.codigosInternos.join(', '),r.modelos.join(', '),r.preparacion])], [35,22,45,30,30,35,20,20,20,20,20,20,26,28,24,38]);
    hoja('Productos propuestos', [['PRODUCTO', 'STYLE', 'MATERIAL', 'COLOR', 'TALLES', 'PARES PACKING', 'PARES CODIGOS', 'PARES EAN', 'SIZE RUN', 'CODIGOS VERSATO DEL ARCHIVO', 'ESTADO', 'AA', 'CODIGO', 'CODIGO_SUELTO', 'MODC'],
      ...p.listado.map(r => [r.PRODUCTO, r.STYLE, r.MATERIAL, r.COLOR, r.talles.join(' '), r.paresPacking, r.paresCodigos, r.paresEan, r.sizeRuns.join(', '), r.codigosVersato.join(', '), r.situacionMaestro || r.estado, r.AA, r.CODIGO, r.CODIGO_SUELTO, r.MODC])], [35, 18, 16, 16, 35, 20, 20, 20, 20, 70, 26, 12, 16, 20, 16]);
    hoja('Productos por talle', [['PRODUCTO', 'TALLE', 'EAN', 'PARES PACKING', 'PARES CODIGOS', 'PARES EAN', 'ESTADO', 'DETALLE'],
      ...p.talles.map(r => [r.PRODUCTO, r.TALLE, r.EAN, r.paresPacking, r.paresCodigos, r.paresEan, r.estado, r.problemas.join(' | ')])], [35, 16, 24, 20, 20, 20, 20, 70]);
    hoja('Reglas de productos', [['REGLA'], ...p.notas.map(n => [n])], [120]);
    if (p.asignaciones) hoja('Asignaciones maestro', [['PRODUCTO', 'SIZE_RUN', 'AA', 'CODIGO', 'MODC', 'COD_ALFA', 'CODIGO_DE_BARRA', 'CODIGO_SUELTO', 'ESTADO', 'FILAS MAESTRO'],
      ...p.asignaciones.map(a => [a.PRODUCTO, a.SIZE_RUN, a.AA, a.CODIGO, a.MODC, a.COD_ALFA, a.CODIGO_DE_BARRA, a.CODIGO_SUELTO, a.coincidencia, a.filasMaestro.join(', ')])], [35, 15, 10, 22, 18, 26, 45, 22, 30, 30]);
    if (p.maestro) hoja('Estado maestro', [['CONCEPTO', 'VALOR'], ['Archivo', p.maestro.archivo], ['Modificación copia local', p.maestro.actualizado], ['Clave de búsqueda', 'Código de Barra Versato del archivo = COD_ALFAB1 (exacto)'], ['Origen AA', 'Año del código de origen si tiene sufijo; en su ausencia, año de factura para datos del alta. No determina la coincidencia.'], ['Mensaje', p.maestro.mensaje], ...p.maestro.filasOmitidas.map(f => ['Fila maestro excluida', f])], [35, 100]);
  }
  if(resultado.controlFactura){const f=resultado.controlFactura;
    hoja('Control Factura', [['PRODUCTO','PARES FACTURA','PARES PACKING','PARES CODIGOS','PARES EAN','CAJAS FACTURA','CAJAS PACKING','CAJAS CODIGOS','IMPORTE','ESTADO','DETALLE','FILAS FACTURA'],...f.filas.map(r=>[r.PRODUCTO,r.paresFactura,r.paresPacking,r.paresCodigos,r.paresEan,r.cajasFactura,r.cajasPacking,r.cajasCodigos,r.importe,r.estado,r.problemas.join(' | '),r.filasFactura.join(', ')])],[35,20,20,20,20,20,20,20,20,16,70,35]);
    hoja('Totales Factura', [['CONTROL','VALOR'],['Factura detectada',f.numerosFactura.join(', ')],['Número coincide con Códigos',f.numeroCoincide==null?'No verificable':f.numeroCoincide?'Sí':'No'],['Pares de filas válidas',f.totales.pares],['Pares declarados',f.totales.paresDeclarados],['Importe de filas válidas',f.totales.importe],['Importe declarado',f.totales.totalDeclarado],['Total importe coincide',f.totales.importeCoincide==null?'No verificable':f.totales.importeCoincide?'Sí':'No'],['Total pares coincide',f.totales.paresCoinciden==null?'No verificable':f.totales.paresCoinciden?'Sí':'No'],['Filas inválidas',f.resumen.filasInvalidas]],[45,50]);
  }
  if(resultado.productos?.sueltos){const s=resultado.productos.sueltos;
    hoja('Control sueltos',[['PRODUCTO','TALLE ARCHIVO','TALLE SUELTO','EAN','ESTADO','CODIGO MAESTRO','MODC','COD_ALFA','DETALLE','OBSERVACIONES'],...s.filas.map(r=>[r.PRODUCTO,r.TALLE_ORIGEN,r.TALLC,r.EAN,r.estado,r.datosMaestro?.CODIGO||null,r.datosMaestro?.MODC||r.MODC,r.datosMaestro?.COD_ALFA||r.COD_ALFA,r.datosMaestro?.DETALLE||r.DETALLE,r.errores.join(' | ')])],[35,18,18,24,24,22,18,25,65,85]);
    hoja('Coincidencias sueltos',[['PRODUCTO','EAN','CODIGO','MODC','COD_ALFA','DETALLE','FECHA ALTA'],...s.filas.flatMap(r=>(r.coincidenciasMaestro||[]).map(m=>[r.PRODUCTO,r.EAN,m.CODIGO,m.MODC,m.COD_ALFA,m.DETALLE,m.FECHA_ALTA]))],[35,24,22,18,25,65,20]);
    hoja('Maestro sueltos',[['DATO','VALOR'],['Archivo',s.maestro.archivo],['Actualizado',s.maestro.actualizado],['SHA256',s.maestro.huella],['Disponible',s.maestro.disponible?'Sí':'No'],['Registros',s.maestro.registros],['Sin EAN utilizable',s.maestro.sinEAN],['Aviso',s.maestro.mensaje]],[30,100]);
  }
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', compression: true });
}
module.exports = { exportarCruce };
