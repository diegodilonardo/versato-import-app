IF OBJECT_ID(N'versato.ConsolidadoFOB', N'U') IS NULL
    CREATE TABLE versato.ConsolidadoFOB (
        Id tinyint NOT NULL PRIMARY KEY CHECK (Id = 1),
        Metadatos nvarchar(max) NOT NULL CHECK (ISJSON(Metadatos) = 1)
    );
IF OBJECT_ID(N'versato.ConsolidadoFOBModelo', N'U') IS NULL
    CREATE TABLE versato.ConsolidadoFOBModelo (
        Modelo varchar(180) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
        Posicion int NOT NULL UNIQUE,
        FOBMaximo float NOT NULL CHECK (FOBMaximo > 0),
        Detalle nvarchar(max) NOT NULL CHECK (ISJSON(Detalle) = 1)
    );
GO
CREATE OR ALTER PROCEDURE versato.GuardarConsolidadoFOB
    @metadatos nvarchar(max), @filas nvarchar(max), @soloInicial bit
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM versato.ConsolidadoFOB WITH (UPDLOCK,HOLDLOCK) WHERE Id = 1)
    BEGIN
        IF @soloInicial = 1
        BEGIN
            COMMIT;
            RETURN;
        END;
        UPDATE versato.ConsolidadoFOB SET Metadatos = @metadatos WHERE Id = 1;
    END
    ELSE INSERT versato.ConsolidadoFOB VALUES (1, @metadatos);

    DELETE FROM versato.ConsolidadoFOBModelo;
    INSERT versato.ConsolidadoFOBModelo (Modelo, Posicion, FOBMaximo, Detalle)
    SELECT JSON_VALUE(value, '$.modelo'), CONVERT(int, [key]), CONVERT(float, JSON_VALUE(value, '$.fobMaximo')), value
    FROM OPENJSON(@filas);
    IF @@ROWCOUNT = 0 THROW 51000, N'El consolidado FOB está vacío.', 1;
    COMMIT;
END;
GO
IF USER_ID(N'versato_fc_app') IS NOT NULL
    GRANT EXECUTE ON OBJECT::versato.GuardarConsolidadoFOB TO versato_fc_app;
