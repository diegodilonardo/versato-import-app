-- Cada análisis es una versión. Elegir uno para no sumar cargas repetidas.
USE FC_VERSATO_APP;
DECLARE @AnalisisId uniqueidentifier=(SELECT TOP(1) AnalisisId FROM versato.ConjuntosDatos ORDER BY Creado DESC);
SELECT * FROM versato.vw_PackingList WHERE AnalisisId=@AnalisisId;
SELECT * FROM versato.vw_CodigosBarra WHERE AnalisisId=@AnalisisId;
SELECT * FROM versato.vw_Eans WHERE AnalisisId=@AnalisisId;
SELECT * FROM versato.vw_Facturas WHERE AnalisisId=@AnalisisId;
-- Totales de lectura: excluir filas que no superaron la validación.
SELECT MARCA,SUM(BOXES) Cajas,SUM(PAIRS) Pares FROM versato.vw_PackingList WHERE AnalisisId=@AnalisisId AND EsValida=1 GROUP BY MARCA;
SELECT SUM(AMOUNT) ImporteFactura FROM versato.vw_Facturas WHERE AnalisisId=@AnalisisId AND EsValida=1;
-- Cantidades por talle y diferencias del cruce.
SELECT * FROM versato.vw_TallesPacking WHERE AnalisisId=@AnalisisId;
SELECT * FROM versato.vw_CruceCantidades WHERE AnalisisId=@AnalisisId AND Estado<>N'COINCIDE';
SELECT * FROM versato.vw_TrazabilidadCruce WHERE AnalisisId=@AnalisisId ORDER BY Posicion,Tipo,FilaExcel;
-- Vista para elegir la última carga de cada factura (sin duplicar versiones).
SELECT * FROM versato.vw_UltimoAnalisisFactura;
