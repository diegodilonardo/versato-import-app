const { camposPrecio } = require('./maestroPrecios');
const { compararCopia } = require('./listaPreseaSQL');

const clave = (codigo, alfa, lista, version) => [codigo, alfa.toUpperCase(), Number(lista), Number(version)].join('|');
const centavos = importe => Math.round((Number(importe) + Number.EPSILON) * 100);

async function controlarPreciosFactura(precios) {
  const buscados = new Map(precios.filas.map(fila => [clave(fila.codigo, fila.cod_alfa, fila.LISTAPRE, fila.VERSION), new Set()]));
  const control = await compararCopia({
    linea(linea) {
      const campos = camposPrecio(linea);
      if (!campos) return;
      const [, , codigo, alfa, lista, version, precio] = campos;
      buscados.get(clave(codigo.replace(/^0+(?=\d)/, ''), alfa, lista, version))?.add(centavos(precio));
    },
    resultado() {
      const resumen = { iguales: 0, faltantes: 0, distintos: 0, conflictos: 0 };
      const filas = precios.filas.map(fila => {
        const importes = [...buscados.get(clave(fila.codigo, fila.cod_alfa, fila.LISTAPRE, fila.VERSION))];
        let estado;
        if (importes.length > 1) { estado = 'CONFLICTO'; resumen.conflictos++; }
        else if (!importes.length || importes[0] <= 0) { estado = 'FALTANTE'; resumen.faltantes++; }
        else if (importes[0] === centavos(fila.PRECIO)) { estado = 'IGUAL'; resumen.iguales++; }
        else { estado = 'DISTINTO'; resumen.distintos++; }
        return { ...fila, estado, presea: importes.map(importe => importe / 100) };
      });
      return { filas, resumen, pendientes: resumen.faltantes + resumen.distintos };
    }
  });
  return { ...control, criterio: 'PRECIOS_FACTURA', disponible: true };
}

module.exports = { controlarPreciosFactura };
