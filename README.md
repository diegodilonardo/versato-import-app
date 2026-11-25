# versato-import-app

MVP independiente con Node.js + Express y HTML/CSS/JavaScript sin framework.
Carga un Excel y detecta Packing List, Códigos de Barra o EAN por encabezados.
No usa SQL Server, no procesa productos y no conserva archivos.

## Vista previa de Códigos de Barra

Después de detectar Códigos de Barra se leen todas las filas de la hoja
(hasta 50.000 filas después de los encabezados). Se muestran las primeras 20
filas no vacías, el mapeo y un resumen. Se validan campos obligatorios,
cantidades enteras no negativas por talle, cantidad de talles y suma contra
Total Pares (entero positivo). Las filas vacías se omiten; otras filas como
totales o subtítulos se revisan con las mismas reglas y pueden generar errores.

Invoice se mapea a Factura; el resto del mapeo se puede consultar en pantalla.
Los identificadores se mantienen como texto usando el formato guardado en Excel.
Las fórmulas se leen con su resultado guardado; no se recalculan.

Código de Barra Versato puede repetirse por caja. Código De Barras, cuando
existe, se mapea a CODIGO_CAJA como campo de revisión opcional: si se repite
dentro de una factura, todas las filas involucradas reciben una advertencia.
Una advertencia no invalida la fila. No se genera PRODUCTO ni se guarda información.
Se muestran hasta 200 filas con errores o advertencias, indicando el total real.
EAN y Packing List también tienen vista previa y validación (ver abajo).

La API agrega `vistaPrevia` para los tres formatos, con `mapeo`, `resumen`,
`filas`, `problemas`, `totalProblemas`, `limiteProblemas` y `notas`.

### EAN

Mapeo: Descrição Marca → MARCA, Linha/Ref → STYLE, Cabedal → CABEDAL,
Cor → COR, Numeração Ext → TALLE, Ean 13 → EAN. Estos campos son obligatorios.
Qtd. Pares → PARES es opcional; cuando está presente debe ser entero no negativo.
Se valida longitud de 13 dígitos y dígito de control EAN-13.
La vista conserva las filas originales y agrega una agrupación por
STYLE + CABEDAL + COR + TALLE + EAN. Suma Qtd. Pares de las filas válidas,
conserva marcas y números de fila de origen. Los identificadores se comparan
como texto exacto, sin quitar puntos, ceros ni separadores de talles.

Un mismo EAN asignado a diferentes combinaciones o una combinación con varios
EAN genera un conflicto: todas las filas involucradas se marcan con error y
se excluyen de la agrupación. Las filas con otros errores también se excluyen.
Marcas distintas dentro de un grupo generan advertencia y se muestran juntas.
Si falta alguna cantidad, el total del grupo queda null (incompleto), conservando
la suma conocida; nunca se interpreta una cantidad ausente como cero.

La pantalla permite buscar grupos, muestra hasta 100 coincidencias y descargar
la agrupación completa en JSON con trazabilidad y conflictos. La API devuelve
`vistaPrevia.agrupacion` con `columnasClave`, `grupos`, `conflictos` y `resumen`.
Las repeticiones compatibles dejan de generar advertencias. Esta consolidación
es una vista previa; no guarda ni modifica el archivo original.

### Packing List

Mapeo: STYLE, MATERIAL CODE → MATERIAL_CODE, COLOR CODE → COLOR_CODE,
SIZE RUN → SIZE_RUN, BOXES y PAIRS son obligatorios. SHOP es opcional.
BOXES y PAIRS deben ser enteros positivos. Las columnas numéricas de talles
se leen como TALLE y CANTIDAD; una fila intermedia de talles actualiza los
talles vigentes e incluye columnas adicionales a la primera cabecera y rangos
como 36/37. Se valida suma de cantidades por talle × BOXES = PAIRS.
Si no existen columnas de talles, se informa una advertencia sin verificar suma.

Se omiten encabezados repetidos y filas sin datos en STYLE, MATERIAL CODE,
COLOR CODE, SIZE RUN, BOXES o SHOP y sin cantidades por talle: normalmente
totales aislados y notas. Las filas parcialmente completas con alguno de estos
campos se validan. `filasAuxiliaresOmitidas` informa cuántas filas se excluyeron;
estas reglas están ajustadas al reporte actual y deben revisarse si cambia su diseño.

## Ejecutar localmente

Instalá Node.js 22 o posterior. Abrí una terminal en esta carpeta:

```powershell
cd versato-import-app
npm ci
npm run dev
```

Abrí http://localhost:3000/importaciones. Detené el servidor con Ctrl+C.
Si ya estás dentro de la carpeta, omití el comando `cd`.

`npm run dev` reinicia automáticamente el servidor cuando cambiás su código.
Para ejecutar sin reinicio automático: `npm start`.
Pruebas: `npm test`.
Otro puerto en PowerShell: `$env:PORT=3001` y luego `npm run dev`.
El servidor escucha únicamente en la computadora local (127.0.0.1).

## Reglas de detección

El flujo principal es seleccionar o arrastrar juntos los tres archivos y pulsar
Analizar factura. Reúne las validaciones individuales, EAN agrupados, cruce,
productos, maestro y descarga completa. Revisar un archivo individual queda
como opción secundaria desplegable. La respuesta del cruce agrega `deteccion`
y `vistaPrevia` a cada elemento de `archivos`, sin listas internas de registros.

Se recorren todas las hojas (máximo 100), las primeras 100 filas absolutas
y las primeras 256 columnas (A a IV). Todos los encabezados de una firma
deben estar en una misma fila, en cualquier orden. Las columnas adicionales
son válidas. Se ignoran mayúsculas, acentos, espacios, saltos de línea y
signos de puntuación. El nombre del archivo y de las hojas no decide el tipo.
La extensión solo valida que se haya seleccionado un formato admitido.

| Tipo | Encabezados obligatorios |
| --- | --- |
| Packing List | STYLE, MATERIAL CODE, COLOR CODE, SIZE RUN |
| Códigos de Barra | CAJA MASTER, LINHA, REFERENCIA, CABEDAL, COR, TAMANHO EXTERNO, QUANTIDADE GRADE, TOTAL PARES, LOJAS, INVOICE, CODIGO DE BARRA VERSATO |
| EAN | Descrição Marca, Linha/Ref, Cabedal, Cor, Numeração Ext, Ean 13 |

Para INVOICE también se acepta FACTURA o FATURA. Las firmas están centralizadas
en `src/config/formatos.js`. Packing List es una firma inicial derivada de los
campos mencionados en la conversación anterior; **falta validarla con un archivo
real**. Las otras dos firmas provienen de los encabezados del importador anterior.

Si varias hojas o tipos coinciden, el resultado es AMBIGUO y se enumeran las
coincidencias. Para encabezados repetidos del mismo tipo en la misma hoja se
devuelve la primera fila. Si no hay coincidencia, se devuelve NO_RECONOCIDO
con los mejores candidatos por hoja y sus campos faltantes, cuando existen.
Un formato reconocido sin filas de datos igualmente se detecta: este módulo
solo identifica encabezados, no valida ni importa registros.

## API

### Clasificación de módulos

MOLEKINHA y MOLEKINHO usan CLASIFIC 4, DCLASIFIC MOD.KID.
Si NAME del Packing contiene la palabra BOLSA, RUBROS es 3 y RUBRO ACCESORIOS.
Para los demás productos del flujo actual se mantiene RUBROS 1 CALZADO y,
fuera de esas dos marcas infantiles, tipo 8 MOD.MUJ.
Rubro y tipo se aplican antes de generar COD_ALFA y verificar duplicados.
La temporada permanece fija en 4. La clasificación masculina requiere su regla
de identificación antes de automatizarla.

### MODC propuestos para módulos faltantes

Cada análisis actualiza también `/PRODUCTOS/MAESTROS_VERSATO/Maestro_Modelos.TXT`
(configurable con MAESTRO_MODELOS_FTP_PATH). Dos columnas: último MODC | marca.
Se propone el siguiente número por marca, manteniendo prefijo y ceros, por cada
clave anual NO_ENCONTRADA. Se omiten encontrados y pendientes de control.
Se evitan MODC que ya existan en el maestro de productos o en la propuesta.
No se modifica el FTP ni se reservan números: otra alta puede cambiar la próxima
secuencia. CODIGO queda pendiente de Presea. COD_ALFA reproduce la fórmula de Access: año actual de generación (Buenos Aires) + temporada 1 + rubro 1 + MODC + 8 + SIZE_RUN, completado a 15 caracteres con ceros a la derecha si la base tiene entre 12 y 15. Si la longitud está fuera del rango, queda pendiente de revisión sin truncar. El año de COD_ALFA puede diferir del año de identidad del módulo tomado de la factura. La fecha y los códigos quedan congelados en el análisis para su descarga.
La pantalla y la hoja Modulos MODC propuestos muestran el resultado. El Excel
mantiene la propuesta guardada del análisis, sin recalcular contadores.

### Identidad anual de productos módulo

La coincidencia para preparar altas exige PRODUCTO.SIZE_RUN.AA = COD_ALFAB1,
por igualdad exacta. AA se obtiene del año de Invoice (3833/2026 → 26).
Una clave sin sufijo de año o de un año diferente no evita el alta del módulo
anual. Si la factura no informa un año interpretable, el control queda pendiente.
No se toma el año del reloj ni se reemplaza por el de un registro anterior.
El control de coincidencia, filtros, resumen por marca y Excel usan esta regla.

### Factura como cuarto archivo opcional

La carga conjunta admite los tres archivos habituales y una Factura adicional,
en cualquier orden y hasta 60 MB cada uno. Se detecta por STYLE, MATERIAL CODE,
COLOR CODE, SIZE RUN, BOXES, PAIRS, UNIT y AMOUNT; esa firma tiene prioridad
sobre Packing en la misma fila. La carga individual también admite Factura.

Controla campos requeridos, cajas y pares enteros positivos e importes no
negativos, y PAIRS × UNIT = AMOUNT con tolerancia de un centavo. Compara sumas
de líneas válidas con la fila TOTAL, y número de factura de cabecera contra
Invoice de Códigos. Si no se detecta cabecera o total, queda No verificable.
Los importes no infieren moneda y no se calculan impuestos ni cargos adicionales.

`controlFactura` compara pares y cajas por producto contra los otros orígenes;
no compara talles ni grades de la Factura en esta etapa. La pantalla detalla
diferencias, y el Excel incorpora Control Factura y Totales Factura completos.
Las filas inválidas se muestran en la validación individual y no se suman.
La coincidencia de cantidades no sustituye la revisión de número y totales.

### Resumen para preparar en Presea

El cuadro de productos consolida marca, descripciones disponibles de Packing,
talles, grades, cajas de Packing y Códigos, pares de cada origen, códigos internos
y MODC. Las cajas se suman una vez por fila válida, no por talle. Se conservan
distintas descripciones y marcas sin elegir una arbitrariamente.
Situaciones: ENCONTRADO, SIN_COINCIDENCIA, COINCIDENCIA_PARCIAL o REVISAR.
Los filtros de situación y búsqueda se combinan con el filtro de no coincidentes.
El Excel completo incluye Preparacion Presea. No es un archivo de alta de Presea:
sin coincidencia significa evaluar, y las reglas de generación todavía faltan.

### Maestro local

Al comenzar cada análisis la app descarga el maestro del FTP y valida su
contenido antes de reemplazar `data/Maestro_Versato.TXT`. Trabaja con esa copia
descargada, sin reutilizar una copia vieja cuando falla la conexión. La pantalla
muestra origen FTP y fecha de descarga, no la fecha de modificación remota.
Las variables de conexión se configuran en `.env` local (ver `.env.example`),
fuera del código y excluido del ZIP y de Git. No se envían al navegador.
Timeout de conexión 20 segundos, límite total 60 segundos y tamaño 50 MB.
Si falla la conexión o la validación, se comparan cantidades pero las claves
quedan PENDIENTE de maestro, nunca NO_ENCONTRADO para evaluar un alta.
La revisión individual de archivos no necesita descargar el maestro.

Cada análisis guarda su resultado en memoria por una hora (máximo cinco).
El Excel se obtiene con GET `/api/importaciones/analisis/:id/excel` y utiliza
exactamente ese resultado, sin FTP ni nueva lectura del archivo local. La hoja
Origen maestro incluye fecha, ruta remota, SHA256 e identificador del análisis.
Si vence, se supera el límite o se reinicia el servidor, devuelve HTTP 410 y
se debe volver a analizar. El antiguo POST `/cruzar/excel` devuelve 409 para
evitar regenerar inadvertidamente con otro maestro.
Formato: 28 campos delimitados por |, según esquema Maestro_Versato.

La búsqueda compara PRODUCTO.SIZE_RUN.AA con COD_ALFAB1 por igualdad exacta. No acepta claves sin año.
AA se toma del año
de factura. Copia CODIGO, MODC y
COD_ALFA, y calcula PRODUCTO.SIZE_RUN.COD_AÑO si hay una coincidencia única.
Repeticiones con el mismo CODIGO, MODC, COD_ALFA y COD_AÑO se aceptan; asignaciones distintas son ambiguas.
Las claves incompletas se excluyen y se enumeran en Estado maestro del Excel.
Filas con cantidad de columnas inválida dejan el maestro no disponible.
CODIGO_SUELTO sigue pendiente de su regla. Los faltantes no se dan de alta.
Asignaciones maestro detalla cada grade; el código a nivel producto solo se
rellena si todas sus grades coinciden y tienen el mismo código.

### Productos propuestos

El cruce agrega `productos` con `listado`, `talles`, `resumen` y `notas`.
PRODUCTO = STYLE.MATERIAL.COLOR; Códigos usa LINHA.REFERENCIA como STYLE,
y EAN usa CABEDAL y COR. Se consolidan talles y pares por producto sobre las
filas comparadas. Se conservan SIZE RUN de Packing y códigos Versato del archivo.
No se asignan códigos nuevos ni se infiere AA del código existente.
AA depende del maestro de productos aún no conectado; CODIGO, CODIGO_SUELTO
y MODC quedan vacíos hasta recuperar sus reglas. El estado PENDIENTE_MAESTRO
no significa que el producto esté listo para dar de alta. Diferencias del cruce
o colisiones de PRODUCTO se marcan REVISAR. Un cruce parcial conserva su alcance
parcial. El Excel agrega Productos propuestos, Productos por talle y Reglas de
productos. No se guarda información ni se modifica ningún archivo de origen.

### Cruce de tres archivos

En la sección Comparar archivos seleccioná exactamente tres libros de la misma
factura: uno de cada formato, en cualquier orden. Máximo 60 MB por archivo.
`POST /api/importaciones/cruzar`, multipart/form-data, tres archivos en `archivos`.
No hay persistencia: cada comparación analiza de nuevo los tres archivos.

Se cruza por STYLE + MATERIAL/CABEDAL + COLOR/COR + TALLE, comparando texto
exacto. Para Códigos, STYLE es LINHA.REFERENCIA. Packing suma cantidades por
talle × BOXES; Códigos suma cada fila de caja; EAN suma pares de sus filas válidas.
Los talles combinados como 36/37 se conservan sin dividir. No se adivinan ceros.
Las cantidades cero de las grades de Packing y Códigos no generan combinaciones.

Se informa presencia en cada origen, cantidades, diferencias, EAN y filas fuente.
Las filas inválidas, conflictos EAN y cantidades no disponibles se excluyen y
se enumeran: el estado pasa a PARCIAL. Los totales son de las filas comparadas,
no de las excluidas. No se infiere la factura de EAN/Packing: el usuario debe
seleccionar un mismo lote. Códigos con varias facturas se rechaza.
La pantalla permite buscar, filtrar diferencias y descargar el JSON completo.
También permite descargar `cruce-completo.xlsx`, sin aplicar filtros ni límites
de pantalla, con hojas Resumen, Cruce completo, Diferencias, Filas excluidas y
Origen de filas. Los identificadores son texto, las cantidades son números y
los orígenes ausentes quedan vacíos. La exportación usa el resultado guardado
del análisis, sin volver a leer archivos ni actualizar el maestro.
API: `GET /api/importaciones/analisis/:id/excel`; devuelve un XLSX como descarga.
Se muestran hasta 100 combinaciones y 200 exclusiones en pantalla.

Respuesta: `estado`, `archivos`, `facturas`, `resumen`, `filas`, `omitidas`, `notas`.
Un origen ausente devuelve null, distinto de una cantidad cero conocida.

`POST /api/importaciones/detectar`, multipart/form-data, un archivo en el campo
`archivo`. Máximo 60 MB. Admite .xls, .xlsx y .xlsm. Lee el contenido con SheetJS;
no ejecuta macros ni Excel. Admite reportes HTML con tablas guardados como .xls,
incluyendo documentos con varias tablas; cada tabla se examina por encabezados.
También acepta el alias Lin/Ref para Linha/Ref. Conserva los identificadores
HTML como texto, reconoce UTF-8, UTF-16 con BOM y Windows-1252, e ignora scripts
y estilos sin ejecutarlos ni descargar imágenes o enlaces externos. El mismo
lector se usa para detección, vista previa, cruce y exportación.
No admite CSV renombrados a Excel ni libros
protegidos con contraseña. Los archivos se mantienen solo en memoria durante
la petición.

Ejemplo desde PowerShell (usar curl.exe):

```powershell
curl.exe -F "archivo=@C:\archivos\reporte.xlsx" http://localhost:3000/api/importaciones/detectar
```

Respuesta HTTP 200:

```json
{
  "archivo": "reporte.xlsx",
  "estado": "DETECTADO",
  "tipo": "PACKING_LIST",
  "nombre": "Packing List",
  "hoja": "Detalle",
  "filaEncabezados": 3,
  "encabezados": [
    { "columna": "A", "texto": "STYLE", "normalizado": "STYLE" },
    { "columna": "B", "texto": "MATERIAL CODE", "normalizado": "MATERIALCODE" },
    { "columna": "C", "texto": "COLOR CODE", "normalizado": "COLORCODE" },
    { "columna": "D", "texto": "SIZE RUN", "normalizado": "SIZERUN" }
  ],
  "faltantes": [],
  "limites": { "filas": 100, "columnas": 256, "hojas": 100 }
}
```

NO_RECONOCIDO y AMBIGUO también devuelven HTTP 200, con tipo y hoja null,
coincidencias, diagnóstico y mensaje. Errores: 400 carga incorrecta, 413 tamaño
excedido, 415 extensión no admitida, 422 contenido ilegible o límite de hojas,
500 error interno. El cuerpo de error es `{ "error": "mensaje" }`.

## Archivos

```text
src/app.js                       Express, upload, rutas y errores
src/server.js                    Inicio del servidor local
src/config/formatos.js           Firmas y alias
src/services/detectarArchivo.js  Lectura, normalización y detección
public/index.html               Pantalla Importaciones
public/styles.css               Estilos adaptables
public/app.js                   Carga, resultados y respuesta JSON
test/importaciones.test.js      Detección y API con Excel generado
package.json / package-lock.json Dependencias y comandos
```

Dependencias: [Express](https://expressjs.com/),
[Multer](https://expressjs.com/en/resources/middleware/multer/) y
[SheetJS 0.20.3](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/),
desde su distribución oficial. `npm ci` necesita acceso a npm y cdn.sheetjs.com.
Sin recursos externos en el frontend ni compilación. Las pruebas generan libros
sintéticos de los tres formatos; no sustituyen la validación con archivos reales.
Este MVP es para uso local; publicar un servidor compartido requiere revisar
autenticación, límites de recursos y aislamiento del análisis de archivos.

### Exportación de módulos para Presea
El análisis incluye Descargar módulos para Presea: genera una sola hoja Hoja1 con las 35 columnas de la plantilla, solo claves anuales no encontradas y completas. CODIGO queda vacío para su asignación en Presea. Se excluyen propuestas incompletas y códigos duplicados; diferencias del cruce o maestros no disponibles bloquean la descarga. El archivo conserva la fecha y las propuestas del análisis (sin volver a consultar FTP). No reserva MODC ni da de alta productos. La aceptación final debe comprobarse mediante una importación de prueba en Presea.


### Sueltos para Presea
En cada análisis se actualiza desde FTP Maestro_Versato_sueltos.txt (16 campos, límite de 120 MB). Busca el EAN contra COD_ALFABA o COD_ALFABA1. Una coincidencia conserva el registro original; varias coincidencias se agrupan por EAN tomando el máximo de cada campo, sin generar una nueva alta. Se conservan todas en Coincidencias sueltos del Excel completo. Sin maestro actualizado no se proponen altas.
Los nuevos usan nivel 900, temporada 1 / IN, clasificación 1 PRIMERA, PARES 1, PAIS 4 y CODIGO vacío para Presea. COD_ALFABA lleva el EAN y COD_ALFAB1 queda vacío. Talles compartidos usan el primero: 36/37 → 36. MODC se reutiliza tomando el máximo del mismo producto entre maestros y módulos asociados. RUBRO_FACT se busca por marca, rubro y SUELTOS. COD_ALFA sigue la consulta de Access con temporada 1: AA + 1 + 1 + MODC + 1 + 00 + talle (15 caracteres). El 1 de rubro dentro de esta fórmula reproduce la consulta proporcionada. Rechaza duplicados y talles incompatibles; no trunca ni rellena códigos. Descargar sueltos para Presea conserva el análisis y solo incluye nuevos válidos, sin usar filtros de pantalla. No reserva MODC ni carga productos en Presea.


### Guía de lógicas y controles
El navbar incluye Lógicas y controles (/logicas), que abre en otra pestaña para conservar el análisis. La guía reúne detección, cantidades y EAN, Factura y totales, maestros, módulos, sueltos y descargas. Las ayudas de reglas no aparecen en los resultados; los errores, avisos del análisis y controles permanecen en Importaciones. Si se modifica una regla funcional, actualizar también public/logicas.html.


### Archivo único para Presea
El botón Descargar productos para Presea reemplaza las dos descargas separadas de altas. GET /api/importaciones/analisis/:id/presea-completo genera productos-presea.xlsx, con una sola Hoja1 y las mismas 35 columnas. Ordena cada módulo nuevo seguido de los sueltos nuevos del mismo PRODUCTO y MODC, sin repetir hijos cuando hay varias grades. Incluye también sueltos nuevos de módulos existentes. No exporta productos ya encontrados, hijos de módulos nuevos rechazados ni propuestas inválidas. Comprueba duplicados de COD_ALFA entre ambos tipos y conserva el análisis sin consultar FTP. CODIGO permanece vacío. Las rutas anteriores se conservan por compatibilidad; la interfaz ofrece una sola descarga de altas.


Los módulos mantienen identidad anual exacta PRODUCTO.SIZE_RUN.AA (ejemplo 1122.806.7286.29452.99.26) y temporada 1 / AN. Los sueltos nuevos usan temporada 1 / IN en sus campos y COD_ALFA. Los EAN encontrados conservan los datos del maestro y no se generan como altas.

### Fórmulas y relaciones DBI
Botones PRODUCTOS_RELFORMU.DBI y PRODUCTOS_RELACION.DBI después de analizar. GET /api/importaciones/analisis/:id/dbi/relformu o /relacion reutiliza el snapshot; no consulta FTP. Formato dBase III binario, con los descriptores exactos de las referencias en src/config/dbi: campos C de 254 (DEPO_PROXI 10), N de 20 con 5 decimales, idioma 0 y terminador 1A. Textos Windows-1252, sin truncar. ARTICULO/INSUMO vacíos para resolución interna en Presea por CA_ARTICUL/CA_INSUMO, según el flujo acordado. Debe validarse con una importación real.
Solo módulos nuevos válidos, con familia completa de sueltos nuevos y existentes. RELFORMU: EMBALAJE MODULO, PROVEEDOR 80005, DEPO_PROXI S, AUTOMATICA FALSO, DESARME .T. RELACION: cantidades por módulo, medidas 07, controles 0 y referencias por COD_ALFA. Una familia incompleta o suma diferente de PARES se excluye completa de ambos archivos. Los motivos aparecen en pantalla. Referencias originales: PRODUCTOS_RELFORMU.DBI y PRODUCTOS_RELACION.DBI proporcionados por el usuario.


### Alta de productos en DBI
La descarga única de altas ahora es PRODUCTOS_VERSATO.DBI (sustituye el Excel de altas). La ruta /api/importaciones/analisis/:id/presea-completo responde application/octet-stream. Es dBase III binario con los primeros 33 campos, tipos y longitudes de PRODUCTOS_VERSATO.DBF de referencia, más PAIS N(20,5) y NOMB_ART C(254). FECHA_ALTA conserva tipo C(254) y formato dd/mm/aaaa. CODIGO numérico queda vacío para asignación en Presea. Conserva módulos y sus familias de sueltos, orden y reglas del análisis. Windows-1252, sin truncar; una longitud incompatible bloquea la descarga con mensaje. Los DBI de fórmulas y relaciones se importan después del alta de productos. El Excel del cruce sigue disponible como control.


### Modelos y STOCKADI
Nuevas descargas /api/importaciones/analisis/:id/dbi/modelos y /stockadi, sobre el mismo snapshot. MODELOS_VERSATO.DBI conserva NRO, DESCR, LINEA y ABREVIADO C(254): MODC, DMODC, NAME y primera letra de MODC. Solo modelos de módulos nuevos válidos.
PRODUCTOS_VERSATO_STOCKADI.DBI conserva sus nueve campos de referencia y agrega COD_ALFA C(100), autorizado por el usuario. CODIGO se deja vacío para resolverlo en Presea después de dar de alta los productos. Una fila única por cada COD_ALFA nuevo, módulos y sueltos, del archivo de altas. BR_CODCOLO/CODMATE/COLOR/MATERIA/STYLE/NAME vienen de los archivos; BR_SIZERUN y DET_CURVA son SIZE_RUN y curva para módulos, vacío y talle para sueltos. Las descripciones deben ser únicas y estar completas; no se elige la primera entre valores diferentes. No modifica ni reserva maestros. La pantalla informa registros excluidos. El importador de STOCKADI debe mapear el nuevo campo COD_ALFA para resolver CODIGO.


### Envío del lote al FTP
Botón Enviar los 5 DBI al FTP. POST /api/importaciones/analisis/:id/enviar-ftp genera/valida los cinco binarios del snapshot y los envía a /ALTAS_PRODUCTOS/VERSATO con las credenciales MAESTRO_FTP existentes. No vuelve a descargar maestros ni inicia importaciones de Presea. Requiere lote completo sin exclusiones. Los nombres finales son MODELOS_VERSATO.DBI, PRODUCTOS_VERSATO.DBI, PRODUCTOS_VERSATO_STOCKADI.DBI, PRODUCTOS_RELFORMU.DBI y PRODUCTOS_RELACION.DBI.
Carga nombres temporales con UUID, verifica tamaños y publica por rename, reemplazando archivos homónimos. No es una transacción para los cinco archivos: una falla al publicar puede dejar un lote parcial y la UI informa ENVIADO/NO_ENVIADO/NO_CONFIRMADO. Se intenta borrar solo los temporales del envío. Se bloquean envíos simultáneos, se limita el tiempo total a 120 segundos y no se exponen mensajes FTP ni credenciales. Rechaza Origin de otro sitio. Las pruebas de transporte usan un cliente simulado; no publican archivos reales.


### Criterio vigente de existencia de módulos
La clave es el valor completo de Código de Barra Versato del archivo de códigos, comparado exactamente con COD_ALFAB1 del maestro. No se reconstruye como PRODUCTO.SIZE_RUN.AA, ni se agrega, quita o reemplaza el año según la factura. Si existe no se crea otro módulo, aunque COD_AÑO o el año de factura sean distintos. Una coincidencia ambigua/incompleta queda para revisión, sin otra alta. Si no existe se prepara el módulo conservando el mismo código fuente en COD_ALFAB1. Los códigos se asocian a las grades de Packing; repeticiones por caja cuentan una vez. Sin código o sin asociación a la grade queda pendiente, no como alta nueva. El año para campos de alta proviene del sufijo explícito del código si lo tiene y, en su ausencia, de factura; no determina existencia. Esta regla sustituye las referencias anteriores a identidad anual reconstruida. Sueltos continúan buscándose por EAN.


## SQL Server e historial persistente
SQL Server SQLEXPRESS local, acceso TCP 127.0.0.1:1433, base FC_VERSATO_APP. Con SQL_ENABLED=true, la app exige conexión al iniciar; no cambia a memoria silenciosamente si falla. Las credenciales se guardan solo en .env (excluido del ZIP y Git). El usuario de ejecución versato_fc_app tiene SELECT, INSERT y UPDATE en el esquema versato; no es sysadmin ni puede crear tablas. sa se usa solo durante la preparación inicial. npm run db:check verifica la conexión. npm run db:init aplica sql/001_inicial.sql con credenciales administrativas, crea base/esquema si faltan y configura un usuario propio con contraseña aleatoria en .env, sin imprimirla. No rota un usuario existente.
El esquema conserva Analisis (resultado JSON comprimido), ArchivosOrigen (nombres/huellas/tamaños, sin el contenido original), MaestrosAnalisis (metadatos y huellas), Lotes, ArchivosGenerados (los cinco binarios cuando son válidos, SHA256 y registros), EnviosFTP y ReservasMODC/AnalisisReservas. Guardar un análisis y sus archivos es transaccional. Historial lista los últimos 100 análisis y permite abrirlos y descargar los mismos DBI guardados incluso tras reiniciar. Las reglas nuevas no modifican los DBI de un análisis ya persistido.
Reserva de modelos: SQL obtiene un bloqueo transaccional para asignar MODC por marca por encima de los ya utilizados y reservados. ClaveFuente es el código Versato exacto, sin reconstruir año. Cada clave conserva su reserva y año de generación original; un nuevo análisis la reutiliza. Los modelos reservados no se liberan automáticamente si un lote no se importa. El FTP y Presea siguen siendo las fuentes de maestros y códigos internos.
Los envíos se registran como EN_CURSO antes de transferir y luego COMPLETO, PARCIAL o ERROR con detalle de archivos. Un registro EN_CURSO sin cierre requiere comprobar el FTP antes de reintentar. Los análisis y DBI anteriores a habilitar SQL, conservados únicamente en memoria, no se migran automáticamente. Con SQL_ENABLED=false solo se permite la vista previa; guardar requiere SQL.
La prueba de integración guardó la factura 3833/2026, recuperó sus cinco DBI en otro proceso y comprobó reservas concurrentes sin duplicar MODC. El registro de envíos se probó en una transacción revertida; no se hizo un envío real al FTP.


## Filas de origen y consultas (esquema SQL 2)
La migración sql/002_datos_archivos.sql agrega ContenidoOrigen (original GZIP), FilasOrigen (fila, valores/formulas originales, normalizados, errores y advertencias), PackingListDatos, CodigosBarraDatos, EansDatos, FacturasDatos, TallesOrigen, CrucesCantidades y CruceOrigen. ConjuntosDatos marca los análisis que disponen de este detalle. Todo se guarda en la misma transacción que el análisis; un error revierte también los datos de origen. La captura de filas viaja solo internamente, no agranda el JSON de respuesta. Se insertan bloques de 500 registros mediante parámetros SQL y OPENJSON.
Los identificadores se guardan como texto, preservando ceros; las cantidades/importes consultables son decimal(28,8). El valor original se conserva además por celda y en el archivo binario. Los valores ausentes no se convierten en cero. Se conservan las filas inválidas reconocidas por los lectores; encabezados y filas auxiliares permanecen en el original. EsValida significa validación de lectura, no coincidencia del cruce.
Vistas: versato.vw_PackingList, vw_CodigosBarra, vw_Eans, vw_Facturas, vw_TallesPacking, vw_TallesCodigos, vw_CruceCantidades, vw_TrazabilidadCruce y vw_UltimoAnalisisFactura. Las cargas no se sobrescriben; filtrar AnalisisId o usar la última versión para no sumar una factura repetida. Ver sql/consultas_ejemplos.sql.
Consultas (/consultas) permite elegir análisis/tipo/producto, paginar de a 100 filas, ver valores originales y descargar el archivo original. La API usa vistas permitidas y filtros parametrizados, sin SQL libre. Historial muestra Consultar datos cuando están disponibles. Los análisis anteriores al esquema 2 conservan sus resultados y DBI, pero hay que volver a cargar los archivos para registrar originales y filas; no se reconstruyen con datos potencialmente diferentes.
El usuario de ejecución ya tiene permisos sobre el esquema versato. Para un servidor nuevo db:init aplica todas las migraciones numeradas. No se incluye contraseña en los scripts. Validación real: 3833/2026 registró 621 filas Packing + 621 Códigos + 839 EAN + 140 Factura = 2221, conservó 651 combinaciones y cuadró 7452 pares en todas las fuentes y 58378,44 de importe; el original recuperado fue idéntico byte por byte.


## Aceptación antes de registrar datos
Analizar no escribe en SQL ni reserva MODC. Se conserva una vista previa en memoria durante 30 minutos (hasta tres vistas previas recientes por servidor); se elimina al vencer o reiniciar. El botón **Aceptar y guardar análisis** registra originales, filas, controles, DBI y reservas en una única transacción. Solo entonces se habilitan descargas y envío FTP. La asignación definitiva de MODC puede ajustar las propuestas de la vista previa si otra aceptación reservó modelos mientras tanto. Un fallo revierte también las reservas. Los clics repetidos o simultáneos sobre la misma vista previa recuperan el mismo análisis, sin duplicar el guardado. Se bloquean cargas cuya factura o cualquiera de sus archivos ya esté guardado. La factura compara número/año normalizados y los archivos su SHA256, aunque se renombren. Se comprueba al analizar y otra vez al guardar bajo bloqueo transaccional para evitar duplicados simultáneos. Las vistas previas sin aceptar no cuentan como cargas registradas. No se realiza ningún envío FTP al guardar.

## Fotos de productos
Al cargar los Excel se pueden agregar hasta 300 JPG/JPEG, PNG o WebP, con 5 MB por foto y 150 MB en total. El nombre 1122-828-7286-15745.jpg se cruza exactamente con PRODUCTO 1122.828.7286.15745, preservando ceros. Una foto se comparte entre los SIZE_RUN, módulos y talles del producto; no depende del año. Se informa qué archivos no coinciden y cuántos productos carecen de foto. Dos fotos diferentes para la misma clave se rechazan; copias idénticas se consolidan.
Las fotos válidas asociadas permanecen en memoria con la vista previa. Solo al aceptar se guardan sus binarios y metadatos en versato.ImagenesProducto, dentro de la misma transacción que el análisis. Se recuperan desde Historial y no se envían al FTP ni cambian los DBI. Las fotos sin coincidencia no se almacenan. Las miniaturas se amplían en un visor y se muestran en las tablas que identifican PRODUCTO.
La migración sql/003_imagenes.sql agrega el almacenamiento sin modificar los datos existentes. Para una instalación anterior, ejecutar esa migración con una cuenta administradora antes de reiniciar la app. El usuario de aplicación conserva sus permisos sobre el esquema. El script de limpieza también contempla las fotos.

También se pueden agregar fotos faltantes desde un análisis existente abierto en Historial, mediante **Aceptar y guardar fotos**. Esta operación no vuelve a cargar la factura, no reserva modelos ni modifica los DBI. Reutiliza las fotos existentes, sin reemplazarlas ni guardar otros binarios, y agrega únicamente las faltantes en una transacción; no permite adjuntar fotos a productos fuera de ese análisis.

Las fotos guardadas se reutilizan entre facturas por PRODUCTO exacto, sin depender de SIZE_RUN ni año. El catálogo se consulta al analizar, guardar y recuperar desde Historial. Las nuevas referencias apuntan a la imagen original; no se copia el binario a cada análisis. La comprobación de existencia y la inserción comparten el bloqueo transaccional de cargas para evitar duplicados simultáneos. Al seleccionar nuevamente fotos de productos ya disponibles se informa la omisión, conservando las existentes.

## Salidas COMEX
Se generan SALIDA PEDIDOS APP COMEX.XLSX (hoja SALIDA_PEDIDOS_APP_COMEX, 5 columnas) y SALIDA MASTER DATA APP COMEX.XLSX (hoja SALIDA_MASTER_DATA_APP_COMEX, 23 columnas), respetando el orden y los nombres de los ejemplos. Incluyen todos los módulos de la factura, existentes y nuevos, sin sueltos ni filtros de pantalla.
Pedidos: cod_alfa y descripcion del módulo; price = UNIT de Factura × PARES del módulo, redondeado a 2 decimales; quantity = cajas de Packing por PRODUCTO + SIZE_RUN, contrastadas con los códigos físicos; po = número de factura. Si existen varias claves Versato para la misma grade, las cajas se distribuyen por clave exacta del archivo de códigos y se verifica su suma contra Packing. Se preserva la separación de grades aunque Factura las agrupe. Un UNIT ambiguo, cajas/pares discrepantes o un control pendiente bloquea la salida; no se omiten módulos silenciosamente. Sin Factura, Master Data puede prepararse, pero Pedidos queda pendiente de precios.
Master Data: proveedor PB0061, nombre BEIRA RIO, deporte NO APLICA y pais BRASIL. Datos existentes desde la coincidencia exacta del maestro COD_ALFAB1; datos nuevos desde la propuesta ya reservada al aceptar el análisis. modelo=MODC, cod_mod=DMODC, codigo_curva=SIZE_RUN, curva y composicion_curva=DTALLC, modulo=PARES. Se preservan el año y la temporada del registro existente; las altas nuevas usan la temporada 1/IN definida para los productos. MOLEKINHA: grupo_genero KIDS, genero FEM; MOLEKINHO: grupo_genero KIDS, genero MAS. Ambas MOD.KID. Resto: ADULTO y sexo del producto (FEM cuando no se define otro). Los códigos internos nuevos quedan vacíos con aviso, sin asignar códigos ficticios.
Los COMEX disponibles se guardan con sus binarios en ArchivosGenerados en la misma transacción del análisis. Descargarlos no consulta FTP ni modifica la base. Desde un análisis guardado, Preparar/Actualizar datos COMEX reconstruye las salidas con las filas originales conservadas en SQL y una actualización explícita del maestro del FTP; permite recuperar códigos internos después del alta en Presea. Solo actualiza COMEX; conserva los DBI para Presea. Esta acción también habilita COMEX en análisis anteriores, sin volver a cargar la factura. Las descargas comprueban el estado actual para evitar entregar un COMEX anterior si la nueva preparación queda bloqueada.
Los dos Excel son descargas independientes y no se agregan al envío de los cinco DBI al FTP. Historial sigue contando únicamente los DBI en su indicador correspondiente. Prueba con 3833/2026: 138 módulos por salida, de los cuales los 25 registros presentes en las referencias coinciden en todos los campos comparados.

## Correo informativo de factura
Desde un análisis aceptado se puede preparar un informe con tres cuadros: cajas y pares por marca, por cliente y por cliente/marca, con total general en cada uno. Cajas/módulos representa cantidades físicas de Packing, no productos diferentes; los pares provienen de PAIRS, sin asumir que todas las cajas traen 12. Se contrasta cada agrupación cliente/marca con LOJAS y los pares del archivo de códigos. Se bloquea el borrador si existen diferencias, filas inválidas, varias facturas o nombres sin coincidencia única.
Preparar/Actualizar informe descarga /PRODUCTOS/MAESTROS_VERSATO/Clientes_Versato.TXT mediante el acceso FTP configurado. Cruza SHOP/LOJAS exactamente con el primer campo del maestro y usa el segundo como nombre. El tercer campo es una referencia que no se usa para inferir otro cliente. Se consolidan repeticiones con el mismo código y nombre; nombres diferentes para el mismo código quedan ambiguos. Las filas sin nombre no aportan una coincidencia. Como excepción funcional indicada por el usuario, 131600 se identifica como ADMINISTRACIÓN si no está en el maestro. El correo utiliza los valores predeterminados configurados por el usuario, siempre editables.
El informe conciliado y la huella del maestro se conservan en el JSON del análisis, sin duplicar filas de origen ni alterar COMEX/DBI. Destinatarios, copia, asunto, depósito, observaciones y firma se precargan desde src/config/correoFactura.js y permanecen editables en pantalla; los cambios de un borrador no se guardan automáticamente en SQL. Vista previa y descarga usan el informe guardado, sin consultar FTP. Se ofrece copiar el cuerpo con formato o descargar un .eml marcado como borrador (X-Unsent), con alternativas HTML/texto y asunto UTF-8. No hay SMTP ni envío automático. Se adjunta automáticamente el Excel de depósito generado desde el análisis. Los otros adjuntos del correo de referencia (Notas de Venta y Orden de Compra) no se agregan automáticamente. El correo original se usó únicamente como ejemplo de estructura; no se reutilizan automáticamente sus destinatarios ni su firma.

### Valores predeterminados del correo
Para: ingresos@atomik.com.ar; ivelazquez@atomik.com.ar; nestor.febles@atomik.com.ar. CC: marlene.lopresto@versato.com.ar; gaspar.galeano@icloud.com; agustin.desantis@versato.com.ar; vanina.zorrilla@atomik.com.ar; ndiaz@atomik.com.ar; leila.yeffal@versato.com.ar; tony@atomik.com.ar. Se respetan como direcciones separadas, también Gaspar y Agustín.
La factura exclusiva del cliente 131600 se considera STOCK para precargar depósito 203. Las de otros clientes precargan 105. Una factura mixta (Administración y otros clientes) deja el depósito sin completar y muestra una observación para revisión. La observación precargada es Factura correspondiente a Pedidos de Clientes para clientes y Factura correspondiente a Pedidos de Stock para stock. La firma permanece vacía y el asunto conserva el número de factura. Vaciar un destinatario o editar un campo se respeta al generar el borrador; no se vuelve a imponer el valor por defecto.
Los tres cuadros del correo usan encabezados, datos y totales centrados; las columnas de cajas y pares mantienen el mismo ancho y posición en los tres cuadros. El cuerpo limita su ancho a 760 píxeles, con tipografía y espaciados explícitos para Outlook y filas compactas. Para ver cambios de diseño se debe descargar un nuevo EML; los archivos ya descargados no se actualizan. Los destinatarios precargados solo se usan para preparar el borrador: no existe envío automático.

## Excel de depósito adjunto al correo
Al preparar o actualizar el informe del correo se genera Salida archivo Deposito - NUMERO-AÑO.xlsx desde las filas originales de Packing. Respeta la plantilla actualizada y contiene PRODUCTOS (MARCA, MODELO, CAJAS, PARES); PRODUCTOS POR COLOR (MARCA, MODELO, PRODUCTO, CODIGO COLOR, COLOR, CAJAS, PARES); PRODUCTOS POR COLOR Y CURVA (MARCA, MODELO, CODIGO COLOR, COLOR, CURVA, COMPOSICION CURVA, CAJAS, PARES).
MODELO = STYLE con guiones + MATERIAL CODE; PRODUCTO = STYLE.MATERIAL_CODE.COLOR_CODE; código y descripción de color desde Packing. CURVA es SIZE_RUN; composición = talle:cantidad por caja, con espacios, conservando talles compartidos y excluyendo cantidades cero. Se comprueba que suma de cantidades por talle × BOXES = PAIRS. Las agrupaciones mantienen distintas composiciones de una misma curva como filas diferentes para no ocultar variaciones físicas.
Las cuatro hojas incluyen un total con fórmulas SUM y autofiltros sobre el detalle. Deben conciliar con las cajas y pares del informe; un error bloquea el adjunto. El Excel y su metadato se guardan en la misma transacción que el informe, sin duplicar originales. Los análisis con un informe anterior requieren Actualizar informe una vez para generar este archivo.
El .eml es multipart/mixed: contiene el cuerpo en HTML/texto y el Excel como adjunto binario base64. La descarga utiliza el binario guardado; también se ofrece descargar el Excel por separado. Copiar el cuerpo con formato no copia archivos, por lo que en ese caso se debe adjuntar el Excel manualmente. No se envía correo automáticamente ni se agregan estos archivos al lote FTP de Presea.

### Actualizar facturas guardadas contra maestros

El botón Actualizar contra maestros descarga los cinco maestros del FTP y vuelve a comprobar módulos y sueltos desde los archivos originales guardados. Conserva el ID de análisis, fotos, correo, reservas MODC e historial de envíos. Recalcula Presea y COMEX y registra fecha, huellas y resumen antes/después. Los archivos que ya no corresponden quedan inactivos para descarga. Si falta un maestro o falla el proceso, la transacción conserva el análisis anterior. No envía archivos al FTP ni crea productos en Presea. Abrir el historial por sí solo no actualiza los maestros.

### Control de clientes

Se agrupan los códigos SHOP del Packing y LOJAS de Códigos de Barra, con búsqueda textual exacta en Clientes_Versato.TXT del FTP. Se muestran nombre, cajas y pares por fuente y estados encontrado, no encontrado, ambiguo, sin código o pendiente de maestro. Se mantiene la equivalencia configurada 131600 = ADMINISTRACIÓN. Los nuevos análisis incluyen el control; los guardados pueden usar Actualizar control de clientes (actualiza también el informe del correo y su Excel de depósito) o Actualizar contra maestros. Abrir un histórico no consulta el FTP automáticamente.

### Corregir un cliente de una factura

En Control de clientes, Corregir cliente permite elegir un código cargado en los documentos, buscar un destino único en el maestro FTP y registrar un motivo. Revisar corrección muestra las cajas y pares afectados; Confirmar corrección y actualizar guarda una reasignación de todas las cajas de ese código dentro de esa factura. Esta opción no divide cajas entre clientes. Se conserva el original y el historial de cambios en el JSON del análisis. Se regeneran control, informe del correo y Excel de depósito. Las correcciones se reaplican desde los originales al actualizar maestros. Una versión de factura o huella del maestro diferente exige revisar nuevamente. No cambia el maestro ni envía correos o archivos.

La cuarta hoja CODIGOS_ALFA agrega MARCA, CODIGO INTERNO, CODIGO ALFA, DETALLE, MODELO, CODIGO COLOR, COLOR, CURVA, COMPOSICION CURVA, CAJAS y PARES. Mantiene las mismas cantidades de PRODUCTOS POR COLOR Y CURVA y usa las asignaciones exactas del análisis y los datos COMEX/propuestos. El código interno de altas nuevas queda vacío hasta actualizar maestros después del alta. Si no hay un código alfa único, se deja vacío y se registra una advertencia, sin adivinar correspondencias. Las descargas y adjuntos se reconstruyen con las cuatro hojas también para snapshots anteriores que ya conservan el archivo de depósito.

MODELOS_VERSATO.DBI incluye SIZE_RUN como quinto campo de texto (254 caracteres), con el código de curva del módulo. Conserva ceros iniciales. Las descargas y envíos regeneran este archivo desde el análisis para incorporar el campo también en facturas guardadas.

El envío FTP valida primero todos los temporales y luego sobrescribe cada archivo final mediante STOR, conservando el nombre. Comprueba el tamaño final antes de marcar ENVIADO. No utiliza RNTO para reemplazar archivos existentes. Ante un fallo, distingue archivos enviados, no confirmados y todavía no enviados; no garantiza atomicidad del lote completo.

DETALLE de módulos se genera como DMODC + espacio + COLOR + " - SZ: " + SIZE_RUN (ejemplo: 1122-806-7286 BEIGE - SZ: 99), sin separadores verticales entre esos componentes. Se aplica también a las descargas de propuestas guardadas. No modifica el detalle de módulos existentes del maestro ni cambia el separador de los TXT del FTP.

Al actualizar maestros son obligatorios los seis archivos: productos, modelos, marcas, rubros, sueltos y clientes. Si falta uno o no puede validarse, se muestra su nombre y no se modifica el análisis guardado.

### Notas de Venta de clientes
En una factura guardada, **Preparar y guardar NV de clientes** consulta los maestros una vez y conserva el resultado, sus fechas y domicilios en SQL junto con la factura. Las NV aparecen automáticamente al recuperar el análisis. Administración (131600) se excluye. Cada selección se confirma con **Guardar domicilio**. La descarga usa la versión guardada sin FTP y conserva las fechas originales. **Actualizar NV desde maestros** recalcula explícitamente con los maestros actuales, preservando las selecciones que sigan siendo válidas. Si cambió la asignación de clientes, requiere actualizar antes de descargar. Una actualización fallida conserva las NV anteriores. No requiere tablas nuevas.

### Organización de la pantalla de análisis
La factura se presenta en siete pestañas: Resumen, Controles, Productos, Presea, COMEX y NV, Correo y Fotos. Los indicadores generales, la aceptación de la vista previa y la actualización de maestros quedan visibles sobre las pestañas. La carga de archivos se pliega al terminar el análisis. Las pestañas conservan sus filtros al alternar entre ellas y admiten navegación con flechas, Inicio y Fin.

### Envío de NV al FTP
En COMEX y NV, cada cliente disponible tiene **Enviar NV al FTP**. **Enviar todas las NV disponibles al FTP** envía únicamente los clientes listos; informa los excluidos por revisión. Destino fijo: /NOTAS_VENTA/VERSATO. Usa las NV persistidas, sus fechas y domicilios, sin volver a consultar maestros. Reemplaza nv_cliente_CODIGO.dbi si existe. Cada envío queda en EnviosFTP con tipo NV, revisión de las NV, archivos y resultado. No se envían Administración ni domicilios pendientes; las versiones anteriores a correcciones de clientes requieren actualización. Se comprueban tamaños y se indican resultados parciales. La importación en Presea se realiza por separado.

### Listas de precios
La sección **Precios** consolida los Excel de la carpeta precios (configurable con PRECIOS_DIR). Detecta Linha, Ref., Cab. y FOB U$ por encabezados. Agrupa por Linha.Ref.Cab. y toma el FOB máximo numérico, conservando todos los orígenes empatados. Las hojas de público/mayorista se informan y excluyen de la consolidación FOB. Las filas inválidas y modelos asociados a varias marcas requieren revisión.
Las fórmulas de mayorista y público y sus parámetros se configuran explícitamente; no se precargan tipos de cambio ni factores. Admite operaciones + - * /, paréntesis y variables numéricas. Público puede usar PRECIO_MAYORISTA sin redondear. Ambos precios se redondean comercialmente al final. Catálogo y fórmulas se guardan de forma atómica en data/precios-consolidado.json y data/precios-formulas.json. La exportación respeta las cuatro columnas MARCA, MODELO, PRECIO_PUBLICO, PRECIO_MAYORISTA y una hoja por marca del ejemplo. No modifica los precios de las NV ni envía precios a Presea.

### Precios por marca y vigencia
El cálculo activo usa Mayorista = FOB máximo × (1 − quita/100) × multiplicador; Público = mayorista sin redondear × 2. Cada resultado se redondea comercialmente a dos decimales. La quita inicial del formulario es 33,6%; el multiplicador debe completarse explícitamente. Cada marca tiene un historial inmutable de inicios de vigencia. Para una fecha se selecciona el inicio más reciente que no la supere; una regla rige hasta el día anterior a la siguiente. No se permiten dos registros de una marca con el mismo inicio. El historial se guarda en data/precios-vigencias.json; la configuración genérica anterior se conserva en su archivo y ya no determina los precios. La fecha de consulta se utiliza también en la descarga y su nombre. Las marcas sin vigencia impiden exportar el consolidado.

### Incorporar nuevas listas FOB
En Precios, abrir **Incorporar nuevas listas FOB**, seleccionar hasta 10 archivos .xls/.xlsx/.xlsm y presionar **Incorporar listas y actualizar**. Hasta 60 MB por archivo y 150 MB por lote. Se validan todos los archivos antes de guardar; solo se admiten filas con modelo y FOB válidos. Las copias con el mismo contenido se omiten aunque cambie el nombre. Un nombre ocupado con contenido distinto se rechaza para conservar el original. El lote válido se guarda y el catálogo se recalcula; si el proceso falla, se retiran únicamente los archivos nuevos de ese lote. El historial de vigencias se conserva. La descarga Excel queda visible y señala las marcas o errores pendientes. Salida: MARCA, MODELO con guiones, PRECIO_PUBLICO, PRECIO_MAYORISTA; hojas por marca compatibles con el archivo de referencia.
La selección **Marcas a exportar** permite descargar únicamente las marcas elegidas con vigencia válida. Las marcas sin configuración no se omiten automáticamente: el usuario debe configurarlas o desmarcarlas explícitamente. La fecha de cálculo consultada determina los precios y el nombre del archivo.

### Quita o agregado
Cada nueva vigencia permite elegir Tipo de ajuste: QUITA o AGREGADO. Quita aplica FOB × (1 − porcentaje/100); Agregado aplica FOB × (1 + porcentaje/100). Luego se multiplica por el multiplicador y Público duplica el resultado sin redondear. Quita admite 0–100%; Agregado admite cualquier porcentaje no negativo. Las vigencias anteriores sin tipoAjuste se interpretan como QUITA, conservando exactamente su cálculo. Historial y tabla de vigentes muestran tipo y porcentaje.

### Correcciones de una vigencia existente
Se permite editar una marca y fecha ya registradas. Cada cambio crea una nueva versión con referencia a la anterior; se aplica la última versión de ese mismo inicio de vigencia. Guardar exactamente los mismos valores no crea otra versión. El formulario recupera tipo de ajuste, porcentaje y multiplicador guardados al seleccionar marca y fecha. Las correcciones conservan todas las versiones anteriores en el historial.

### Lógica activa: Coeficientes_Real
El régimen activo reemplaza quita/agregado por Mayorista = FOB máximo × coeficiente_1 × coeficiente_2 × Importe. Público = mayorista sin redondear × 2. Los precios se redondean al final a dos decimales. Se gestionan coeficiente_1, coeficiente_2 e Importe por marca y fecha, con versiones históricas. La configuración activa se guarda en data/precios-coeficientes.json. El historial anterior de quita/agregado se conserva en data/precios-vigencias.json y aparece como solo consulta; no interviene en este régimen. Datos iniciales indicados por el usuario: vigencia 11/06/2026, coeficiente_1 1.1 e Importe 1500 para las ocho marcas; coeficiente_2 2.3 para VIZZANO y 2.1 para las demás.
El markup mayorista es otro multiplicador directo, independiente de coeficiente_2 y editable por marca y vigencia. Cálculo final activo: Mayorista = FOB máximo × coeficiente_1 × coeficiente_2 × Importe × markupMayorista; Público = mayorista sin redondear × 2. El usuario indicó markup inicial 2; 1 es neutro y se admiten decimales positivos. El archivo de coeficientes conserva este valor junto con cada versión.

### Corrección de fórmula mayorista (regla activa)
El cálculo mayorista definitivo es únicamente FOB máximo × coeficiente_1 × coeficiente_2 × Importe. No aplica markup adicional, aunque figure en configuraciones históricas. Se retiró ese campo del formulario y de la tabla activa; el historial conserva el valor anterior como dato no aplicado. Público sigue siendo mayorista sin redondear × 2. Pantalla y Excel usan esta misma función. Regresión verificada: ACTVITTA 4202.200.17607, FOB 9.32, coeficientes 1.1 y 2.1 e importe 1500: mayorista 32293.80 y público 64587.60.

### PRECIOS_NV.DBI por factura
En COMEX y NV, **Generar y guardar precios NV** toma todos los módulos y sueltos de la factura, existentes y nuevos. Lee los maestros vigentes del FTP, aplica el catálogo mayorista con los coeficientes vigentes hoy y guarda el resultado en el análisis SQL. Suelto = mayorista por par × 1. Módulo = mayorista por par × pares por módulo, comprobados con Packing y maestro. Los productos internos compartidos se deduplican; los sueltos se resuelven por EAN con los máximos por campo del proceso vigente. Listas 03 y 980 iguales; lista 04 = ese precio × 1.05, redondeado a dos decimales. VERSION es 1. Salida dBase III Windows-1252: LISTAPRE, VERSION, codigo, cod_alfa, PRECIO. No se exportan subconjuntos si hay códigos, precios o pares pendientes. La descarga usa el resultado guardado y no recalcula; el botón de actualización genera una nueva versión con la fecha del día. La importación se hace desde Presea y no modifica las NV guardadas.

### Catálogo global de fotos
La sección Fotos permite consultar todas las imágenes persistidas en SQL, independientemente de la factura. La búsqueda se actualiza automáticamente 300 ms después de escribir; Enter y Buscar consultan inmediatamente. Al cambiar el texto se cancela la consulta anterior y se vuelve a la primera página. Vaciar el campo muestra todas las fotos. Buscar 1122.800.7286 o 1122-800-7286 produce la misma clave. La búsqueda por modelo devuelve sus variantes de color y también permite consultar un producto completo de cuatro componentes. Se conservan ceros iniciales. Se muestra una foto por producto, usando la aparición guardada más reciente si existen varias, con paginación de 40 y ampliación. Las fotos aún no aceptadas o no asociadas a un producto de un análisis no forman parte del catálogo persistido. Es una consulta de solo lectura y no requiere tablas nuevas.

### Control informativo de pedidos
En Controles de una factura guardada se pueden incorporar hasta 20 pedidos ZIP/CSV (60 MB por archivo y 60 MB descomprimidos en conjunto). Se detectan los encabezados del CSV delimitado por punto y coma; los nombres de archivos no identifican los productos. Se comparan cliente + PRODUCTO + Grade/SIZE_RUN contra el Packing List guardado, incluyendo Administración, cajas, pares y distribución por talle (curva × cajas). Las filas inconsistentes quedan aparte y no se ajustan automáticamente. Se distinguen totales declarados y válidos. CSV idénticos se cuentan una sola vez por huella. Primero se revisa sin guardar; Aceptar y guardar control registra archivos, huellas, filas originales normalizadas y resultados en el análisis SQL. Reemplazar un control conserva la versión anterior en su historial. No requiere migración y no cambia NV, productos ni exportaciones. Si cambian las correcciones de clientes, se indica que debe revisarse nuevamente. Las diferencias nunca bloquean el flujo.

### Descuento comercial vigente
El cálculo activo incorpora Descuento comercial (%) por marca y vigencia, entre 0 y 100. FOB neto = FOB máximo × (1 − descuentoComercial / 100). Mayorista = FOB neto × coeficiente_1 × coeficiente_2 × Importe; público = mayorista sin redondear × 2. Se redondean ambos al final a dos decimales. Las versiones anteriores sin descuento se interpretan como 0 %, sin reescribir el historial. Cambiar solo el descuento también crea una nueva versión de la misma fecha. Consulta y Excel usan la misma función; PRECIOS_NV aplica el descuento al volver a generar su archivo, conservando los archivos guardados hasta actualizar explícitamente. El Excel conserva sus cuatro columnas originales.

### Precios antes del envío de NV
PRECIOS_NV.DBI se envía a /PRECIOS/VERSATO mediante un botón propio, con reemplazo del archivo y auditoría en EnviosFTP. El flujo conserva revisión y SHA-256 del DBI enviado. Enviar al FTP no confirma la importación: el usuario debe importar el archivo en Presea y marcar explícitamente la confirmación en la app. Sin esa confirmación, los endpoints individuales y de lote de NV rechazan el envío antes de conectarse al FTP. Se comprueba además que cada código interno + COD_ALFA de la NV tenga precios confirmados. Regenerar precios o reenviarlos invalida la confirmación previa. El sistema no comprueba la base de Presea directamente: hasta disponer de un maestro de precios, la comprobación de importación es una declaración explícita del usuario. No modifica el PRECIO de las NV ni envía archivos automáticamente.

### Verificación automática de precios en Presea (reemplaza confirmación manual)
La fuente es /PRECIOS/VERSATO/MAESTRO_PRECIOS_VERSATO.TXT, sin encabezado, campos rubro|marca|codigo|COD_ALFA|lista|version|precio. Se procesa por flujo, hasta 250 MB, sin cargar el archivo completo en memoria. Se compara COD_ALFA + lista + versión y el importe a dos decimales contra cada registro de PRECIOS_NV. Faltantes, precios diferentes o duplicados contradictorios bloquean el envío. No se usan copias anteriores ante errores FTP. El botón Verificar precios en Presea guarda fecha, SHA-256 del maestro y resultados por revisión del DBI; se vuelve a descargar antes de cada envío individual o lote de NV. La confirmación manual fue retirada y no habilita envíos. Precios ya existentes y correctos permiten verificar sin reenviarlos.

PRECIOS_NV.DBI exporta exactamente CODIGO, LISTAPRE, PRECIO, VERSION, OBSERVACIO, COD_ALFA. OBSERVACIO siempre vacío. Los análisis guardados se adaptan al descargar, sin recalcular precios. El cambio de formato invalida las huellas anteriores; antes de enviar NV debe verificarse nuevamente el maestro.

Regla vigente de control NV: los precios de salida provienen del FOB máximo con descuento comercial y coeficientes vigentes al generarlos. El TXT solo comprueba existencia de un precio positivo por COD_ALFA + lista + versión para los módulos presentes en NV disponibles (excluye Administración y sueltos ajenos a esas NV). No exige igualdad de importe ni sustituye el calculado. Las verificaciones anteriores por importe no habilitan envíos hasta consultar nuevamente.

### Control de NV importadas
El botón Verificar NV importadas en Presea descarga /NOTAS_VENTA/VERSATO/Detalle_NV.TXT y guarda el control en el análisis. Archivo sin encabezado: se leen fecha (2), factura (3), número NV (4), cliente (5), nombre (6), código interno (7), COD_ALFA (8), precio (10), cantidad de módulos (11) y pares por módulo (24), posiciones desde 1. Se filtra por factura exacta y se comparan cliente + COD_ALFA, código interno y suma de cantidades. Administración no se espera. Se muestran NV, precios, faltantes, adicionales y diferencias. No envía ni importa archivos. Las revisiones de NV o correcciones de clientes posteriores invalidan visualmente la consulta anterior.

### Preparación de NV después del impacto en Presea
Actualizar NV desde maestros descarga productos y clientes, comprueba los módulos por el Código de Barra Versato exacto contra COD_ALFAB1, y consulta MAESTRO_PRECIOS_VERSATO.TXT para listas 03/04/980 versión 1. Cada NV conserva fecha y huella del maestro de productos, y sus productos encontrados o pendientes de impacto. Un módulo ausente bloquea el archivo de su cliente (no se exportan NV parciales). Repetir la actualización después de que Presea exporte el maestro vuelve a comprobar las claves y permite generar el archivo si está completo. Ambigüedades se distinguen de ausencia. Las descargas fallidas de productos, clientes o precios conservan las NV anteriores y reportan el error. La falta de precio no se confunde con falta de producto: se informa en el control previo y el envío conserva su control de precios independiente. No hay sondeo automático ni envíos automáticos en esta etapa.

Las tarjetas de NV por cliente muestran Ya existe en Presea cuando el control guardado corresponde a la revisión actual y todos sus productos están importados sin diferencias. Muestran todos los números de NV asignados por Presea a ese cliente (puede haber varios). Importaciones parciales se indican para revisar; los números de controles desactualizados se conservan identificados como última consulta, sin confirmar existencia actual. Verificar NV actualiza las tarjetas sin perder cambios de domicilio no guardados.

### Evitar reenvíos de NV ya importadas
Las tarjetas deshabilitan Enviar NV al FTP para clientes con NV detectadas en Presea, manteniendo Descargar NV (DBI). El servidor vuelve a consultar Detalle_NV.TXT antes de cada intento: rechaza el individual con 409 y excluye del lote las NV ya importadas. Importaciones parciales también se excluyen para evitar duplicación de líneas. Si falla la consulta, no se envía. La descarga local no consulta el FTP ni se bloquea por existencia en Presea.

### Circuito vigente: envío conjunto de precios y NV
Los botones Enviar precios + NV al FTP y Enviar precios y NV pendientes al FTP construyen ambos tipos de DBI antes de conectarse. Un único envío, protegido por el bloqueo FTP común, carga todos los temporales, publica primero /PRECIOS/VERSATO/PRECIOS_NV.DBI y después las NV en /NOTAS_VENTA/VERSATO. Si los precios no se publican correctamente, ninguna NV se publica. El archivo de precios calculado debe cubrir todos los productos de las NV seleccionadas; no se requiere existencia previa en el maestro de precios. Presea importa primero precios, luego NV, y exporta Detalle_NV.TXT y el maestro de precios para consultar los resultados en la app. La comprobación de NV ya existentes se mantiene antes del envío para impedir duplicados. Se registra cada destino y estado, revisión de NV y revisión/huella del DBI de precios. La consulta de precios es informativa para este circuito. Las descargas locales se conservan.

### Excel de NV adjunto al correo
Cuando existen NV preparadas, el EML y Abrir en mi correo incorporan además Detalle NV - factura.xlsx. Una fila por cliente y COD_ALFA, con columnas COD_ALFA, DETALLE, CODIGO_CLIENTE, DETALLE_CLIENTE, DETALLE_MARCA, DETALLE_MODELO, DETALLE_COLOR, SIZE_RUN, DETALLE_CURVA y CANTIDAD_MODULOS; total por fórmula al pie. Usa las cantidades de las NV guardadas y sus códigos internos/alfa, enriquecidos por coincidencia exacta con Master Data COMEX guardado. Códigos y curvas se conservan como texto. Si falta información o existe ambigüedad, no se genera un adjunto parcial y se solicita actualizar COMEX/NV. El Excel puede descargarse desde Correo. No reemplaza el archivo de depósito ni envía el correo automáticamente.

El Excel de NV incorpora NUMERO_NV y FECHA_NV al inicio, tomados de Detalle_NV.TXT verificado, y TOTAL_PARES al final (módulos por pares por módulo). Si el mismo producto figura en varias NV, se separa cada documento con su cantidad real para no duplicar totales. Antes de importar, número y fecha Presea quedan vacíos. Controles históricos sin fechas requieren volver a Verificar NV importadas. Totaliza módulos y pares al pie.

### Productos nuevos dados de alta en Presea
Historial distingue Nuevos dados de alta de Pendientes de alta y permite abrir el detalle en Productos. El registro conserva los COD_ALFA propuestos inicialmente (módulos y sueltos); solo confirma el alta si ese mismo alfa figura en los maestros, con su código interno actual. La existencia de otro suelto con el mismo EAN no confirma el alfa propuesto. Para análisis anteriores se recuperan las filas del PRODUCTOS_VERSATO.DBI conservado en SQL, incluso si ya no está activo para descarga. Las actualizaciones preservan el registro histórico antes de reemplazar propuestas o archivos generados. No se vuelven a generar productos ni se envían archivos por esta consulta.

Correo mixto: si incluye Administración 131600 y otros clientes, Observaciones indica Pedidos de Clientes y Pedidos de Stock y Depósito muestra 105 (Clientes) / 203 (Stock). Ambos campos siguen siendo editables.

### Organización de COMEX y NV
La pestaña COMEX y NV incluye cuatro vistas internas: Notas de Venta, Precios de NV, Control en Presea y Archivos COMEX. Cada una muestra su estado y conserva sus controles/eventos al alternar. Se recuerda la vista interna por factura durante el trabajo. El control de importación tiene mensajes propios para que el progreso sea visible en su vista. Navegación por teclado con flechas/Inicio/Fin. Distribución adaptable con tarjetas compactas de clientes.

### Actualización automática de precios al enviar NV
El envío individual o conjunto primero comprueba NV existentes; si quedan pendientes, regenera y guarda PRECIOS_NV con FOB máximos del consolidado y coeficientes/descuento vigentes a la fecha actual, además de códigos de maestros recién descargados. Valida cobertura y publica precios antes de NV. Si no puede calcular precios completos no envía. Ya no exige un archivo previo ni consulta previa de precios. La actualización manual y la descarga del último cálculo se conservan. La vista Precios agrupa acciones pequeñas en una barra y recibe el nuevo cálculo después del envío. No recalcula al abrir un histórico ni reenvía NV ya importadas.

Generar NV prepara y guarda una sola vez. Cuando ya hay NV, el botón queda deshabilitado como NV generadas. Revisar pendientes desde maestros aparece solo si quedan NV bloqueadas o correcciones de clientes por aplicar; conserva las NV previamente listas si no cambiaron las correcciones. El servidor también devuelve las NV existentes sin regenerarlas cuando ya están listas, incluso por la ruta actualizar. Se mantienen descargas, controles y envíos como acciones separadas.

El domicilio de entrega queda fijado al completar la NV. El selector se deshabilita y se oculta Guardar domicilio para NV listas o ya detectadas en Presea. Solo se puede elegir un domicilio mientras requiereDomicilio está pendiente. El servidor rechaza posteriores cambios con 409, conservando el domicilio guardado.

### Configuración del correo
Guardar configuración del mail conserva Para, CC, firma y plantilla de asunto en data/configuracion-correo.json de la app. El número de factura se reemplaza por {factura} al guardar y se aplica el de la factura actual al abrir otro correo. Depósito y observaciones se conservan por separado para CLIENTES, STOCK y MIXTO. La configuración se valida antes de escribir y se guarda atómicamente; aplica también a borradores EML y Abrir en mi correo desde Historial. Guardar no envía correo. La configuración es compartida por quienes usen esta instalación, independiente del navegador. El archivo data no se incluye en el ZIP de distribución.

### Selección de listas FOB por archivo
Gestionar listas FOB incluidas muestra archivos de la carpeta, fecha inferida del sufijo año_mes_día y pertenencia a la base activa. Según el formato solicitado, tabela_de_precos_50_23_02_25 corresponde a 2023-02-25; las fechas inválidas o desconocidas no se inventan ni impiden seleccionar el archivo. Ver selección calcula máximos entre los archivos elegidos para vista y Excel sin guardar el consolidado activo. Usar selección para NV consolida y guarda explícitamente esos archivos como base activa para futuros precios; no modifica DBI históricos. Consolidar e incorporar archivos conservan esa selección activa; archivos nuevos quedan disponibles para seleccionar. Solo se admiten nombres presentes en la carpeta, sin rutas externas; una selección vacía se rechaza. La exportación conserva sus cuatro columnas por marca. Cambios de casillas sin aplicar deshabilitan la descarga para evitar exportar una selección anterior.

Corrección de fecha en nombres de listas: el formato definitivo es día_mes_año. tabela_de_precos_50_23_02_25.xlsx corresponde a 23/02/2025. Solo cambia la fecha informativa; las selecciones y los valores FOB se conservan.

### Vigencias activas e inactivas
Historial de configuraciones permite desactivar/reactivar una fecha por marca sin borrar sus versiones. El cambio aplica a todas las revisiones de esa marca/fecha para evitar que reaparezca una versión anterior del mismo día. El cálculo escoge la última fecha activa no posterior a la fecha de cálculo y su última revisión. Sin configuración activa válida, el precio queda pendiente y no se exporta. Se conserva auditoría de cambios de estado y control de revisión concurrente. Configuraciones antiguas sin activo se consideran activas; una nueva configuración se crea activa. Las fechas inactivas no aparecen en el selector de vigencias guardadas; permanecen en Historial para reactivarlas. Los archivos ya guardados/enviados no se modifican por el cambio; los futuros recálculos usan el nuevo estado.

### Comparación de FOB por lista
En Modelos consolidados, Ver todas las listas consulta la carpeta y muestra todas las apariciones del modelo, incluidas las fuentes fuera de la selección. Muestra archivo, fecha, hoja/fila, FOB propio de cada lista, inclusión en vista y uso activo para NV. Destaca los orígenes del máximo entre las fuentes incluidas; no confunde el máximo con otros precios. No modifica selecciones ni recalcula la base activa al consultar.

La grilla de modelos muestra FOB analizados agrupados por valor, con la cantidad de listas distintas. El máximo utilizado se destaca. Pulsar un FOB consulta y despliega solo los archivos correspondientes a ese valor; los nombres largos no se muestran en la grilla principal. El detalle puede cerrarse sin alterar el cálculo.

## Publicación por Git y actualización del servidor

Repositorio previsto: https://github.com/diegodilonardo/versato-import-app.git
Rama: apps/facturas-versato. Crear el repositorio privado y vacío antes de publicar.
Este es el mismo circuito de App Productos: desarrollo publica en GitHub y el
servidor descarga desde GitHub. No requiere conexión entre servidor y notebook.

En desarrollo, configurar origin una sola vez:

```powershell
git remote set-url origin https://github.com/diegodilonardo/versato-import-app.git
git push --set-upstream origin apps/facturas-versato
```

Para publicar cambios posteriores:

```powershell
.\scripts\publicar-dev.ps1 -Mensaje "Descripcion del cambio"
```

El script muestra los archivos, ejecuta las pruebas y pide SI antes de commit/push.
Excluye .env, data (vistas, programación, fotos), listas originales y salidas.
Incluye la plantilla de vendedores. Mantener respaldos separados de .env, data y SQL.

Primera instalación Git en el servidor: clonar en una carpeta NUEVA para conservar
la instalación existente intacta:

```powershell
git clone --branch apps/facturas-versato --single-branch https://github.com/diegodilonardo/versato-import-app.git C:\versato-import-app-nueva
```

Luego preparar .env, data, dependencias y servicio antes de reemplazar la instalación.
Configurar STOCK_EXCEL_PYTHON con el python.exe del servidor con Pillow instalado.
Para un repositorio privado, Git debe estar autenticado tanto en desarrollo como en
el servidor. No guardar tokens ni contraseñas en scripts o URLs.

Actualizaciones posteriores, desde el servidor y como administrador, cuando la
instalación Git ya esté en C:\versato-import-app:

```powershell
.\scripts\actualizar-produccion.ps1 -Servicio VersatoImportApp -Python C:\Python\python.exe
```

Ajustar el nombre real del servicio, Python y -UrlComprobacion si no usa puerto 3100.
El script exige avance lineal y ausencia de cambios locales; conserva .env y data,
instala dependencias, reinicia el servicio y comprueba HTTP. No crea el servicio,
no hace migraciones SQL ni reset forzado. Ante fallas informa la versión anterior.

### Configuración de grillas y maestro de clientes en SQL (migración 007)

Antes de actualizar a esta versión, ejecutar `sql/007_configuracion_y_clientes.sql`
en FC_VERSATO_APP con una cuenta administradora. La app no crea tablas automáticamente.
Luego `node scripts/migrar-configuracion-sql.js` importa los archivos locales que
falten en SQL. No sobrescribe documentos ya guardados o restaurados.

Para recuperar las vistas de OTRA instalación, antes de la primera importación:

```powershell
node scripts/exportar-configuracion-sql.js C:\Respaldo\configuracion-versato.sql C:\versato-import-app\data
```

Ejecutar ese SQL en el servidor de destino con una cuenta administradora. Incluye
estructura y datos locales disponibles, sin eliminar nada ni reemplazar claves
existentes. El archivo contiene datos de clientes y rutas internas: conservarlo
como respaldo privado, nunca publicarlo en Git. Revisar los destinos y programaciones
antes de iniciar el servicio en el nuevo servidor.

Se guardan en `versato.DocumentosApp`: vistas y programación, estado de ejecuciones
y copia completa del maestro de clientes con domicilios/ambigüedades originales.
Los clientes se consultan desde SQL; el botón de actualizar sigue descargando del
FTP y reemplaza la copia SQL solo después de validar la descarga.
Los flujos que exigen comprobar maestros actualizados desde FTP mantienen ese control.
Un backup SQL incluye estos documentos. Las imágenes físicas, listas FOB originales
y `.env` todavía necesitan su respaldo de archivos separado.

### Backup completo del servidor

`scripts/backup-completo.ps1` reúne SQL + `.env` + `data` (incluido el repositorio
de imágenes) + listas FOB de PRECIOS_DIR + plantilla de vendedores.
Ejecutarlo como administrador. Usa autenticación Windows de sqlcmd, no la contraseña
de la app. Esa cuenta debe tener permisos de BACKUP DATABASE y RESTORE VERIFYONLY.

```powershell
.\scripts\backup-completo.ps1 -Servicio ProcesosVersatoFC -DirectorioSql "RUTA_ACCESIBLE_POR_SQL_Y_POWERSHELL"
```

`-DirectorioSql` debe ser una carpeta existente donde la cuenta del servicio SQL
pueda escribir y la cuenta de PowerShell pueda leer. SQL interpreta el destino en
SU servidor. Si SQL está en otro equipo, usar un recurso compartido autorizado,
accesible desde ambos. No pasar una ruta C: de otro equipo como si fuera local.
`-Instancia` permite cambiar el servidor SQL; si no se indica, lee SQL_SERVER/SQL_PORT
del .env sin imprimir credenciales. La base predeterminada es FC_VERSATO_APP.

La carpeta final queda en C:\Backups\Versato\Versato_FECHA_ID (cambiable con -Destino).
Su acceso queda limitado a administradores y SYSTEM porque incluye .env.
El servicio se detiene durante la copia y se reinicia en finally. SQL se respalda
con COPY_ONLY y CHECKSUM y se comprueba con RESTORE VERIFYONLY; no altera la base
para diferenciales existentes. Se comparan hashes de los archivos copiados.

Solo una carpeta con COMPLETO.txt representa una ejecución terminada correctamente.
Incluye manifiesto.json con versión Git, tamaños y SHA256; si falla, queda ERROR.txt.
No elimina respaldos anteriores ni configura horarios o recursos compartidos.
Guardar una segunda copia en la ubicación de backups corporativa autorizada.

Restauración: detener la app, restaurar el .bak con SSMS, recuperar .env, data y
precios (en PRECIOS_DIR si era externo), y usar la versión Git indicada en el
manifiesto. Ajustar rutas/credenciales de la nueva máquina antes de iniciar el servicio.
RESTORE VERIFYONLY y los hashes no reemplazan una prueba periódica de restauración.

### Coeficientes y vigencias en SQL

Los coeficientes se guardan en versato.DocumentosApp, clave precios-coeficientes;
el historial previo de la etapa anterior se conserva como precios-vigencias-anteriores.
Requiere la migración 007 ya aplicada. No hay una tabla adicional ni se necesitan
permisos DDL para importar. Incluye revisión, historial completo, estados activos/
inactivos, vigencias futuras y eventos de cambio de estado.

Al consultar por primera vez, se importa data/precios-coeficientes.json únicamente
si la clave no existe en SQL. Una configuración SQL restaurada prevalece sobre los
archivos locales. No se recurre silenciosamente al JSON cuando falla SQL.

Si la instalación ya había creado una configuración SQL vacía, con el archivo de
coeficientes recuperado en data, ejecutar una sola vez:

```powershell
node scripts/migrar-coeficientes-sql.js
```

También acepta la ruta al JSON como primer argumento. Importa únicamente si SQL no
contiene vigencias; nunca reemplaza un historial no vacío. Muestra el número de
vigencias persistidas sin imprimir valores. Para comprobar luego la copia completa:

```powershell
node scripts/migrar-configuracion-sql.js
```

El backup de FC_VERSATO_APP incluye ahora estos coeficientes y sus estados.
Generar un nuevo backup después de migrar. El archivo de Excel original, imágenes
y .env mantienen su respaldo separado.
