const { Readable } = require('node:stream');
const { createGunzip, gzip } = require('node:zlib');
const { createInterface } = require('node:readline');
const { promisify } = require('node:util');
const { conectar, sql } = require('./sqlServer');
const { camposPrecio, verificarMaestroPrecios } = require('./maestroPrecios');

async function leerCopia(incluirContenido = false) {
  const pool = await conectar();
  try {
    const campos = 'Actualizado AS fecha, Huella AS huella, Bytes AS bytes, Registros AS registros';
    const r = await pool.request().query(`SELECT ${campos}${incluirContenido ? ', ContenidoGzip AS contenido' : ''} FROM versato.MaestroPreciosPresea WHERE Id = 1`);
    return r.recordset[0] || null;
  } catch (error) {
    if (error.number === 208) throw Object.assign(new Error('Falta aplicar la migración 004 del maestro de precios de Presea.'), { status: 503 });
    throw error;
  }
}

async function actualizarCopia() {
  await leerCopia();
  const bloques = [];
  let registros = 0;
  const origen = await verificarMaestroPrecios(null, {
    capturar: bloque => bloques.push(bloque),
    comparador: {
      linea(linea) { if (camposPrecio(linea)) registros++; },
      resultado() {
        if (!registros) throw new Error('Maestro vacío.');
        return { registros };
      }
    }
  });
  if (!origen.disponible) throw Object.assign(new Error('No se pudo descargar o validar la lista de Presea. La copia guardada sigue disponible.'), { status: 502 });
  const contenido = await promisify(gzip)(Buffer.concat(bloques, origen.bytes));
  const pool = await conectar();
  const fecha = new Date(origen.fecha);
  await pool.request().input('fecha', sql.DateTime2(3), fecha).input('huella', sql.Char(64), origen.huella)
    .input('bytes', sql.Int, origen.bytes).input('registros', sql.Int, registros).input('contenido', sql.VarBinary(sql.MAX), contenido)
    .query(`MERGE versato.MaestroPreciosPresea WITH (HOLDLOCK) AS destino
      USING (SELECT 1 AS Id) AS fuente ON destino.Id = fuente.Id
      WHEN MATCHED AND destino.Actualizado <= @fecha THEN UPDATE SET Actualizado=@fecha, Huella=@huella, Bytes=@bytes, Registros=@registros, ContenidoGzip=@contenido
      WHEN NOT MATCHED THEN INSERT (Id, Actualizado, Huella, Bytes, Registros, ContenidoGzip) VALUES (1,@fecha,@huella,@bytes,@registros,@contenido);`);
  return leerCopia();
}

async function compararCopia(comparador) {
  const copia = await leerCopia(true);
  if (!copia) throw Object.assign(new Error('Primero usá Actualizar lista desde Presea para guardar una copia en la base.'), { status: 422 });
  const flujo = createGunzip().setEncoding('latin1');
  const lineas = createInterface({ input: flujo, crlfDelay: Infinity });
  Readable.from([copia.contenido]).pipe(flujo);
  try {
    for await (const linea of lineas) comparador.linea(linea);
    return { ...comparador.resultado(), fecha: copia.fecha, huella: copia.huella };
  } finally { flujo.destroy(); }
}

module.exports = { leerCopia, actualizarCopia, compararCopia };
