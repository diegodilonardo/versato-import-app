# Grillas de stock para vendedores

La descarga actualiza una copia de src/config/plantillas/Grilla Versato Stock - Vendedores.xlsx. Conserva las doce solapas, nombres, orden, visibilidad, encabezados, estilos, tema, anchos, alturas, impresión y protecciones originales. Las marcas sin existencias positivas en la selección se omiten; el resumen y los nombres locales se ajustan a las solapas conservadas. No se agregan marcas ajenas a la plantilla.

Una lista y un depósito (o depósitos sumados) producen un XLSX. Varias listas o depósitos separados producen un ZIP con un XLSX por combinación, sin renombrar ni duplicar solapas.

Stock del FTP y precios de la copia SQL de Presea versión 1, cruzados por código interno y COD_ALFA. Precio por par = precio de la unidad / pares por unidad. Público = precio por par × 2. PEDIDO queda en cero, editable con la protección original. Las fotos originales se reutilizan por producto y color exactos; para productos nuevos se usa el catálogo SQL. Sin coincidencia se muestra la leyenda original No Existe la Imagen.

Se adaptan los rangos de tablas y CONSOLIDADO a las filas actuales sin superponer marcas. PEDIDO conserva FILTER con salida vacía cuando no hay pedidos. Excel recalcula al abrir. No se ejecutan consultas externas durante la generación ni se envían pedidos a Presea.

## Motor

scripts/plantilla-grilla.py usa Python y Pillow del runtime instalado para actualizar OOXML, conservando funciones nativas que se perdían al reexportar el libro completo. STOCK_EXCEL_PYTHON permite configurar otro ejecutable Python 3; por defecto se usa el runtime local. No requiere openpyxl para generar archivos ni almacena contraseñas de texto. La interfaz muestra el tiempo de preparación. Una exportación se ejecuta por vez y se eliminan los archivos temporales propios al finalizar.


Las imágenes del Excel se optimizan en memoria: máximo 600 píxeles por lado, JPEG calidad 82 para fotos opacas y PNG para transparencia. Se comparte una sola copia por contenido y se eliminan medios sin referencias. Los archivos originales del repositorio y de la plantilla no se modifican.

