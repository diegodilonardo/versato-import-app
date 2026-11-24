IF OBJECT_ID(N'versato.MaestroPreciosPresea', N'U') IS NULL
BEGIN
    CREATE TABLE versato.MaestroPreciosPresea (
        Id tinyint NOT NULL PRIMARY KEY CHECK (Id = 1),
        Actualizado datetime2(3) NOT NULL,
        Huella char(64) NOT NULL,
        Bytes int NOT NULL,
        Registros int NOT NULL,
        ContenidoGzip varbinary(max) NOT NULL
    );
END;
