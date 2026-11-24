const { generarBloquesPreciosNV, filasPorListas } = require('./preciosNV');
const { camposPrecio } = require('./maestroPrecios');

const texto = valor => String(valor ?? '').trim();
const modelo = valor => texto(valor).replace(/\s*[.-]\s*/g, '.');
const errorExportacion = mensaje => Object.assign(new Error(mensaje), { status: 422 });

function prepararPreciosMaestro(precios, maestro, sueltos) {
  if (!precios.catalogo?.filas.length) throw errorExportacion('Primero consolidá las listas FOB.');
  if (precios.catalogo.errores?.length) throw errorExportacion('Revisá los errores de origen en las listas FOB.');
  if (!maestro.disponible) throw errorExportacion('No se pudo actualizar el maestro Versato desde el FTP.');

  if (!sueltos.disponible) throw errorExportacion('No se pudo actualizar el maestro de sueltos desde el FTP.');

  const porModelo = new Map(precios.catalogo.filas.map(fila => [modelo(fila.modelo), fila]));
  const encontrados = new Set();
  const porCodigo = new Map(), porAlfa = new Map(), definiciones = new Map();
  function marcarIdentidad(indice, id, clave) {
    if (!id) return;
    if (!indice.has(id)) indice.set(id, clave);
    else if (indice.get(id) !== clave) indice.set(id, null);
  }
  function agregar(registros, esSuelto) {
    for (const registro of registros) {
      const codigo = texto(registro.CODIGO).replace(/^0+(?=\d)/, '');
      const cod_alfa = texto(registro.COD_ALFA);
      const dmodc = modelo(registro.DMODC);
      const pares = esSuelto ? 1 : Number(registro.PARES);
      const clave = JSON.stringify([codigo, cod_alfa, dmodc, pares, esSuelto]);
      definiciones.set(clave, { codigo, cod_alfa, dmodc, pares, esSuelto });
      marcarIdentidad(porCodigo, codigo, clave);
      marcarIdentidad(porAlfa, cod_alfa.toUpperCase(), clave);
    }
  }

  for (const registros of maestro.indice.values()) agregar(registros, false);
  agregar(sueltos.articulos, true);

  const productos = [];
  let omitidos = 0;
  for (const { codigo, cod_alfa, dmodc, pares, esSuelto } of definiciones.values()) {
    const precio = porModelo.get(dmodc);
    if (!precio) continue;
    encontrados.add(dmodc);
    const precioBase = Math.round((precio.precioMayorista * pares + Number.EPSILON) * 100) / 100;
    if (!/^\d+$/.test(codigo) || !Number.isSafeInteger(Number(codigo)) || Number(codigo) <= 0 ||
        !/^[A-Z0-9]{1,254}$/i.test(cod_alfa) || porCodigo.get(codigo) === null || porAlfa.get(cod_alfa.toUpperCase()) === null ||
        !Number.isSafeInteger(pares) || pares <= 0 || !Number.isFinite(precioBase) ||
        precioBase <= 0 || precioBase * 105 > Number.MAX_SAFE_INTEGER) {
      omitidos++;
      continue;
    }
    productos.push({ codigo, cod_alfa, precioBase, dmodc, pares, esSuelto, precioPar: precio.precioMayorista });
  }
  if (!productos.length) throw errorExportacion('No hay artículos del maestro con coincidencia, pares y precio mayorista válidos.');

  return {
    productos,
    omitidos,
    modelosSinCoincidencia: porModelo.size - encontrados.size
  };
}

function compararPreciosMaestro(productos) {
  const porAlfa = new Map(productos.map(p => [p.cod_alfa.toUpperCase(), new Map()]));
  const contradictorios = new Map();
  const listas = new Set([3, 4, 980]);
  let leidos = 0;
  const centavos = importe => Math.round((Number(importe) + Number.EPSILON) * 100);
  const estado = (actual, esperado) => actual === null ? 'CONFLICTO' : actual === undefined ? 'NUEVO' : actual === esperado ? 'IGUAL' : 'CAMBIO';
  return {
    linea(linea) {
      const campos = camposPrecio(linea);
      if (!campos) return;
      leidos++;
      const lista = Number(campos[4]);
      if (Number(campos[5]) !== 1 || !listas.has(lista)) return;
      const precios = porAlfa.get(campos[3].toUpperCase());
      if (!precios) return;
      const importe = centavos(campos[6]);
      if (!Number.isSafeInteger(importe)) throw new Error('Precio de Presea fuera de rango.');
      if (!precios.has(lista)) precios.set(lista, importe);
      else if (precios.get(lista) !== importe) {
        const clave = `${campos[3].toUpperCase()}|${lista}`;
        if (!contradictorios.has(clave)) contradictorios.set(clave, new Set([precios.get(lista)]));
        contradictorios.get(clave).add(importe);
        precios.set(lista, null);
      }
    },
    resultado() {
      if (!leidos) throw new Error('Maestro vacío.');
      let iguales = 0, altas = 0, cambios = 0, conflictos = 0, articulos = 0;
      const porLista = Object.fromEntries(['03', '04', '980'].map(lista => [lista, { iguales: 0, altas: 0, cambios: 0, conflictos: 0 }]));
      const contador = { IGUAL: 'iguales', NUEVO: 'altas', CAMBIO: 'cambios', CONFLICTO: 'conflictos' };
      for (const producto of productos) {
        const precios = porAlfa.get(producto.cod_alfa.toUpperCase());
        let exportar = false;
        for (const fila of filasPorListas([producto])) {
          const actual = precios.get(Number(fila.LISTAPRE));
          const situacion = estado(actual, centavos(fila.PRECIO));
          porLista[fila.LISTAPRE][contador[situacion]]++;
          if (situacion === 'CONFLICTO') conflictos++;
          else if (situacion === 'IGUAL') iguales++;
          else {
            exportar = true;
            if (situacion === 'NUEVO') altas++;
            else cambios++;
          }
        }
        if (exportar) articulos++;
      }
      function* filas(lista, seleccion) {
        for (const producto of productos) {
          if (seleccion && !seleccion.has(producto.codigo)) continue;
          const precios = porAlfa.get(producto.cod_alfa.toUpperCase());
          for (const fila of filasPorListas([producto])) {
            if (lista && fila.LISTAPRE !== lista) continue;
            const actual = precios.get(Number(fila.LISTAPRE));
            const situacion = estado(actual, centavos(fila.PRECIO));
            if (situacion === 'NUEVO' || situacion === 'CAMBIO') yield fila;
          }
        }
      }
      function consultar({ lista, tipo, estado: filtro, buscar, pagina }) {
        const filasVista = [];
        const contarFiltrados = Boolean(tipo || filtro || buscar);
        const resumenGeneral = { iguales, altas, cambios, conflictos };
        const resumen = contarFiltrados
          ? { iguales: 0, altas: 0, cambios: 0, conflictos: 0 }
          : lista ? porLista[lista] : resumenGeneral;
        let coincidencias = 0;
        for (const producto of productos) {
          const tipoProducto = producto.esSuelto ? 'Suelto' : 'Módulo';
          if (tipo && tipo !== tipoProducto) continue;
          if (buscar && ![producto.codigo, producto.cod_alfa.toUpperCase(), producto.dmodc].some(v => v.includes(buscar))) continue;
          const alfa = producto.cod_alfa.toUpperCase();
          for (const fila of filasPorListas([producto])) {
            if (lista && lista !== fila.LISTAPRE) continue;
            const actual = porAlfa.get(alfa).get(Number(fila.LISTAPRE));
            const esperado = centavos(fila.PRECIO);
            const situacion = estado(actual, esperado);
            if (filtro && filtro !== situacion) continue;
            if (contarFiltrados) resumen[contador[situacion]]++;
            if (coincidencias++ < pagina * 50) continue;
            if (filasVista.length === 50) {
              if (!contarFiltrados) return { filas: filasVista, siguiente: true, resumen };
              continue;
            }
            filasVista.push({ ...producto, tipo: tipoProducto, lista: fila.LISTAPRE, calculado: fila.PRECIO, estado: situacion,
              presea: actual == null ? null : actual / 100,
              diferencia: actual == null ? null : (esperado - actual) / 100,
              contradictorios: [...(contradictorios.get(`${alfa}|${Number(fila.LISTAPRE)}`) || [])].map(n => n / 100) });
          }
        }
        return { filas: filasVista, siguiente: coincidencias > pagina * 50 + filasVista.length, resumen };
      }
      function seleccionar(lista, codigos) {
        const seleccion = new Set(codigos);
        let pendientes = seleccion.size;
        let altas = 0, cambios = 0, iguales = 0, conflictos = 0, articulos = 0;
        for (const producto of productos) {
          if (!seleccion.has(producto.codigo)) continue;
          pendientes--;
          const precios = porAlfa.get(producto.cod_alfa.toUpperCase());
          let exportable = false;
          for (const fila of filasPorListas([producto])) {
            if (lista && fila.LISTAPRE !== lista) continue;
            const situacion = estado(precios.get(Number(fila.LISTAPRE)), centavos(fila.PRECIO));
            if (situacion === 'NUEVO') { altas++; exportable = true; }
            else if (situacion === 'CAMBIO') { cambios++; exportable = true; }
            else if (situacion === 'IGUAL') iguales++;
            else conflictos++;
          }
          if (exportable) articulos++;
          if (!pendientes) break;
        }
        if (pendientes) throw errorExportacion('Hay productos seleccionados que no pertenecen a la comparación. Volvé a seleccionarlos.');
        return { altas, cambios, iguales, conflictos, articulos,
          bloques: () => generarBloquesPreciosNV(filas(lista, seleccion), altas + cambios) };
      }
      return { iguales, altas, cambios, conflictos, articulos, porLista, consultar, seleccionar,
        bloques: lista => {
          const resumen = lista ? porLista[lista] : { altas, cambios };
          return generarBloquesPreciosNV(filas(lista), resumen.altas + resumen.cambios);
        } };
    }
  };
}

async function consultarPreciosMaestro(precios, maestro, sueltos) {
  const base = prepararPreciosMaestro(precios, maestro, sueltos);
  const comparacion = await require('./listaPreseaSQL').compararCopia(compararPreciosMaestro(base.productos));
  return { ...comparacion, registros: comparacion.altas + comparacion.cambios, omitidos: base.omitidos, modelosSinCoincidencia: base.modelosSinCoincidencia };
}

function exportarPreciosMaestro(comparacion, lista, codigos) {
  const seleccion = codigos ? comparacion.seleccionar(lista, codigos) : null;
  const resumen = seleccion || (lista ? comparacion.porLista[lista] : comparacion);
  const registros = resumen.altas + resumen.cambios;
  if (!registros) {
    throw errorExportacion(resumen.conflictos
      ? `No hay cambios exportables. Hay ${resumen.conflictos} precios contradictorios en Presea para revisar.`
      : 'No hay precios nuevos ni cambios para exportar.');
  }
  return { ...comparacion, ...resumen, registros,
    articulos: seleccion ? seleccion.articulos : lista ? registros : comparacion.articulos,
    bloques: seleccion?.bloques || (() => comparacion.bloques(lista)) };
}

module.exports = { consultarPreciosMaestro, exportarPreciosMaestro, compararPreciosMaestro };
