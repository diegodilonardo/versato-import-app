const { conectar, sql } = require('./sqlServer');

async function leerConsolidado() {
  const pool = await conectar();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.REPEATABLE_READ);
  try {
    const { recordsets } = await new sql.Request(tx).query(`
      SELECT Metadatos FROM versato.ConsolidadoFOB WHERE Id = 1;
      SELECT Modelo, FOBMaximo, Detalle FROM versato.ConsolidadoFOBModelo ORDER BY Posicion;
    `);
    await tx.commit();
    if (!recordsets[0].length) return null;
    return {
      ...JSON.parse(recordsets[0][0].Metadatos),
      filas: recordsets[1].map(({ Modelo, FOBMaximo, Detalle }) => ({ ...JSON.parse(Detalle), modelo: Modelo, fobMaximo: FOBMaximo }))
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

async function guardarConsolidado(catalogo, soloInicial = false) {
  const { filas, ...metadatos } = catalogo;
  const pool = await conectar();
  await pool.request().input('metadatos', sql.NVarChar(sql.MAX), JSON.stringify(metadatos))
    .input('filas', sql.NVarChar(sql.MAX), JSON.stringify(filas)).input('soloInicial', sql.Bit, soloInicial)
    .execute('versato.GuardarConsolidadoFOB');
}

module.exports = { leerConsolidado, guardarConsolidado };
