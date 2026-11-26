-- Ejecutar con una cuenta administradora en FC_VERSATO_APP.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'versato.Usuarios') IS NULL
CREATE TABLE versato.Usuarios(
 Id uniqueidentifier NOT NULL PRIMARY KEY,
 Usuario varchar(64) NOT NULL UNIQUE,
 Nombre nvarchar(100) NOT NULL,
 Perfil varchar(30) NOT NULL,
 Permisos nvarchar(max) NOT NULL CHECK(ISJSON(Permisos)=1),
 ClaveHash varchar(300) NOT NULL,
 Activo bit NOT NULL DEFAULT 1,
 ForzarCambio bit NOT NULL DEFAULT 1,
 Version uniqueidentifier NOT NULL,
 Intentos int NOT NULL DEFAULT 0,
 BloqueadoHasta datetime2(3) NULL,
 Creado datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'versato.Sesiones') IS NULL
CREATE TABLE versato.Sesiones(
 TokenHash char(64) NOT NULL PRIMARY KEY,
 UsuarioId uniqueidentifier NOT NULL REFERENCES versato.Usuarios(Id),
 VersionUsuario uniqueidentifier NOT NULL,
 CsrfHash char(64) NOT NULL,
 Vence datetime2(3) NOT NULL,
 Creado datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'versato.AuditoriaAccesos') IS NULL
CREATE TABLE versato.AuditoriaAccesos(
 Id bigint IDENTITY PRIMARY KEY,
 Fecha datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 Usuario varchar(64) NOT NULL,
 Accion nvarchar(300) NOT NULL,
 Resultado varchar(30) NOT NULL,
 Referencia uniqueidentifier NULL
);
IF NOT EXISTS(SELECT 1 FROM versato.VersionEsquema WHERE Version=8)
 INSERT versato.VersionEsquema(Version)VALUES(8);
IF USER_ID(N'versato_fc_app') IS NOT NULL BEGIN
 GRANT SELECT,INSERT,UPDATE ON OBJECT::versato.Usuarios TO [versato_fc_app];
 GRANT SELECT,INSERT,UPDATE,DELETE ON OBJECT::versato.Sesiones TO [versato_fc_app];
 GRANT SELECT,INSERT ON OBJECT::versato.AuditoriaAccesos TO [versato_fc_app];
END;
COMMIT;
