/*
  Limpieza de datos de FC_VERSATO_APP.
  Conserva tablas, vistas, usuarios, permisos y VersionEsquema.
  Elimina análisis, originales, filas importadas, DBI, envíos y reservas MODC.

  1. Detener la app (Ctrl+C en la consola de npm run dev).
  2. Tener una copia de seguridad si se necesita recuperar los datos.
  3. Ejecutar en SSMS con una cuenta administradora.
  4. Primero revisar el listado; cambiar @Confirmar a 1 para vaciar los datos.

  No ejecutar desde el inicializador de migraciones.
  No borra archivos del FTP, archivos locales ni productos de Presea.
  Al borrar reservas, la próxima generación volverá a basarse en los maestros.
  Actualizar previamente esos maestros si ya se dieron de alta productos.
*/
USE [FC_VERSATO_APP];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET LOCK_TIMEOUT 15000;

DECLARE @Confirmar bit = 0; -- Cambiar a 1 únicamente para ejecutar la limpieza.

IF DB_NAME() <> N'FC_VERSATO_APP'
    THROW 51000, N'La limpieza solo puede ejecutarse en FC_VERSATO_APP.', 1;
IF @@TRANCOUNT <> 0
    THROW 51001, N'Ejecutar fuera de otra transacción.', 1;

SELECT s.name AS Esquema, t.name AS Tabla, SUM(p.rows) AS FilasAntes
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE s.name = N'versato' AND t.name <> N'VersionEsquema'
GROUP BY s.name, t.name
ORDER BY t.name;

IF @Confirmar = 0
BEGIN
    PRINT N'Solo revisión: no se eliminó ningún dato. Cambiar @Confirmar a 1 para ejecutar.';
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Hijos antes que padres; se mantienen activas las claves foráneas.
    IF OBJECT_ID(N'versato.ImagenesProducto') IS NOT NULL DELETE FROM versato.ImagenesProducto;
    DELETE FROM versato.CruceOrigen;
    DELETE FROM versato.CrucesCantidades;
    DELETE FROM versato.TallesOrigen;
    DELETE FROM versato.PackingListDatos;
    DELETE FROM versato.CodigosBarraDatos;
    DELETE FROM versato.EansDatos;
    DELETE FROM versato.FacturasDatos;
    DELETE FROM versato.FilasOrigen;
    DELETE FROM versato.ContenidoOrigen;
    DELETE FROM versato.ConjuntosDatos;
    DELETE FROM versato.AnalisisReservas;
    DELETE FROM versato.ArchivosGenerados;
    DELETE FROM versato.EnviosFTP;
    DELETE FROM versato.MaestrosAnalisis;
    DELETE FROM versato.ArchivosOrigen;
    DELETE FROM versato.Lotes;
    DELETE FROM versato.Analisis;
    DELETE FROM versato.ReservasMODC;

    -- Reinicio de identidades internas, sin afectar códigos de Presea.
    DBCC CHECKIDENT (N'versato.FilasOrigen', RESEED, 0) WITH NO_INFOMSGS;
    DBCC CHECKIDENT (N'versato.ReservasMODC', RESEED, 0) WITH NO_INFOMSGS;

    COMMIT TRANSACTION;
    PRINT N'Limpieza completada. Se conservaron el esquema y sus versiones.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT N'Analisis' AS Tabla, COUNT_BIG(*) AS FilasRestantes FROM versato.Analisis
UNION ALL SELECT N'FilasOrigen', COUNT_BIG(*) FROM versato.FilasOrigen
UNION ALL SELECT N'ReservasMODC', COUNT_BIG(*) FROM versato.ReservasMODC
UNION ALL SELECT N'VersionEsquema (conservada)', COUNT_BIG(*) FROM versato.VersionEsquema;
