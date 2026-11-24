IF SCHEMA_ID(N'versato') IS NULL EXEC(N'CREATE SCHEMA versato');
IF OBJECT_ID(N'versato.VersionEsquema') IS NULL CREATE TABLE versato.VersionEsquema(Version int NOT NULL PRIMARY KEY, Aplicada datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID(N'versato.Analisis') IS NULL CREATE TABLE versato.Analisis(
 Id uniqueidentifier NOT NULL PRIMARY KEY,Creado datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),Factura nvarchar(100) NULL,Estado nvarchar(30) NOT NULL,Resumen nvarchar(max) NOT NULL,Resultado varbinary(max) NOT NULL,VersionReglas int NOT NULL DEFAULT 1);
IF OBJECT_ID(N'versato.ArchivosOrigen') IS NULL CREATE TABLE versato.ArchivosOrigen(
 AnalisisId uniqueidentifier NOT NULL REFERENCES versato.Analisis(Id),Tipo nvarchar(40) NOT NULL,Nombre nvarchar(260) NOT NULL,Hoja nvarchar(260) NULL,Bytes bigint NOT NULL,Huella char(64) NOT NULL,PRIMARY KEY(AnalisisId,Tipo));
IF OBJECT_ID(N'versato.MaestrosAnalisis') IS NULL CREATE TABLE versato.MaestrosAnalisis(
 AnalisisId uniqueidentifier NOT NULL REFERENCES versato.Analisis(Id),Tipo nvarchar(40) NOT NULL,Nombre nvarchar(260) NULL,Huella char(64) NULL,Actualizado nvarchar(40) NULL,Disponible bit NOT NULL,PRIMARY KEY(AnalisisId,Tipo));
IF OBJECT_ID(N'versato.Lotes') IS NULL CREATE TABLE versato.Lotes(
 Id uniqueidentifier NOT NULL PRIMARY KEY,AnalisisId uniqueidentifier NOT NULL UNIQUE REFERENCES versato.Analisis(Id),Creado datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID(N'versato.ArchivosGenerados') IS NULL CREATE TABLE versato.ArchivosGenerados(
 LoteId uniqueidentifier NOT NULL REFERENCES versato.Lotes(Id),Nombre nvarchar(100) NOT NULL,Registros int NOT NULL,Bytes bigint NOT NULL,Huella char(64) NOT NULL,Contenido varbinary(max) NOT NULL,PRIMARY KEY(LoteId,Nombre));
IF OBJECT_ID(N'versato.EnviosFTP') IS NULL CREATE TABLE versato.EnviosFTP(
 Id uniqueidentifier NOT NULL PRIMARY KEY,AnalisisId uniqueidentifier NOT NULL REFERENCES versato.Analisis(Id),Inicio datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),Fin datetime2 NULL,Estado nvarchar(30) NOT NULL,Destino nvarchar(260) NOT NULL,Detalle nvarchar(max) NULL);
IF OBJECT_ID(N'versato.ReservasMODC') IS NULL CREATE TABLE versato.ReservasMODC(
 Id bigint IDENTITY NOT NULL PRIMARY KEY,ClaveFuente nvarchar(254) COLLATE Latin1_General_100_BIN2 NOT NULL,Anio char(2) NOT NULL,Marca nvarchar(100) NOT NULL,MODC varchar(32) NOT NULL UNIQUE,Creado datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),CONSTRAINT UQ_ReservaFuente UNIQUE(ClaveFuente));
IF OBJECT_ID(N'versato.AnalisisReservas') IS NULL CREATE TABLE versato.AnalisisReservas(
 AnalisisId uniqueidentifier NOT NULL REFERENCES versato.Analisis(Id),ReservaId bigint NOT NULL REFERENCES versato.ReservasMODC(Id),PRIMARY KEY(AnalisisId,ReservaId));
IF NOT EXISTS(SELECT 1 FROM versato.VersionEsquema WHERE Version=1) INSERT versato.VersionEsquema(Version)VALUES(1);
