-- Ejecutar en FC_VERSATO_APP con una cuenta administradora.
-- Contiene documentos JSON de vistas/programación y la copia completa del maestro de clientes.
IF OBJECT_ID(N'versato.DocumentosApp') IS NULL
CREATE TABLE versato.DocumentosApp(
 Clave varchar(60) NOT NULL PRIMARY KEY,
 Contenido nvarchar(max) NOT NULL CHECK(ISJSON(Contenido)=1),
 Actualizado datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS(SELECT 1 FROM versato.VersionEsquema WHERE Version=7)
 INSERT versato.VersionEsquema(Version)VALUES(7);
IF USER_ID(N'versato_fc_app') IS NOT NULL
 GRANT SELECT,INSERT,UPDATE ON OBJECT::versato.DocumentosApp TO [versato_fc_app];
