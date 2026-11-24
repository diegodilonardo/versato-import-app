-- Ejecutar en FC_VERSATO_APP con una cuenta administradora.
IF OBJECT_ID(N'versato.UbicacionesImagenes') IS NULL
CREATE TABLE versato.UbicacionesImagenes(
 Id uniqueidentifier NOT NULL PRIMARY KEY,
 Nombre nvarchar(120) NOT NULL,
 Ruta nvarchar(1024) NOT NULL,
 Subcarpetas bit NOT NULL DEFAULT 0,
 Activa bit NOT NULL DEFAULT 1,
 Prioridad int NOT NULL DEFAULT 100,
 Revision uniqueidentifier NOT NULL,
 Creado datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 UltimaSincronizacion datetime2(3) NULL,
 Resumen nvarchar(max) NULL
);
IF OBJECT_ID(N'versato.RepositorioImagenes') IS NULL
CREATE TABLE versato.RepositorioImagenes(
 Producto nvarchar(254) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
 UbicacionId uniqueidentifier NOT NULL REFERENCES versato.UbicacionesImagenes(Id),
 Nombre nvarchar(260) NOT NULL,
 RutaRelativa nvarchar(1024) NOT NULL,
 Tipo varchar(30) NOT NULL,
 Huella char(64) NOT NULL,
 Bytes int NOT NULL,
 FechaOrigen datetime2(3) NOT NULL,
 Actualizado datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS(SELECT 1 FROM versato.VersionEsquema WHERE Version=6)
 INSERT versato.VersionEsquema(Version)VALUES(6);
GO
IF USER_ID(N'versato_fc_app') IS NOT NULL
 GRANT SELECT, INSERT, UPDATE ON SCHEMA::versato TO [versato_fc_app];
