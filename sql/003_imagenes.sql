IF OBJECT_ID(N'versato.ImagenesProducto') IS NULL
CREATE TABLE versato.ImagenesProducto(
 AnalisisId uniqueidentifier NOT NULL REFERENCES versato.Analisis(Id),
 Producto nvarchar(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
 Nombre nvarchar(260) NOT NULL, Tipo varchar(30) NOT NULL,
 Huella char(64) NOT NULL, Bytes int NOT NULL, Contenido varbinary(max) NOT NULL,
 PRIMARY KEY(AnalisisId,Producto)
);
IF NOT EXISTS(SELECT 1 FROM versato.VersionEsquema WHERE Version=3)
 INSERT versato.VersionEsquema(Version)VALUES(3);
