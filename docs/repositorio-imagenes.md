# Ubicaciones y repositorio de imágenes

En Fotos se pueden configurar carpetas locales absolutas y carpetas UNC de red, con nombre, prioridad, estado activo e inclusión opcional de subcarpetas. Se sincronizan JPG y PNG de hasta 5 MB, con nombres como `1122-806-7286-15745.jpg` o `1122.806.7286.15745.png`. No se deducen fotos de otro color o modelo.

## Persistencia

La migración `sql/006_repositorio_imagenes.sql` crea las tablas `versato.UbicacionesImagenes` y `versato.RepositorioImagenes` en la base de la app. SQL conserva ubicación, producto, nombre original, ruta relativa, tipo, tamaño, fecha de origen y huella SHA-256. Las copias de los archivos se guardan en `data/repositorio-imagenes`, con nombres basados en su huella. Dos productos con contenido idéntico comparten una copia.

El respaldo debe incluir SQL y la carpeta del repositorio. No se guardan credenciales para las carpetas: el proceso de la app utiliza los permisos del usuario de Windows que lo ejecuta.

## Sincronización

La ubicación de menor prioridad numérica se utiliza primero; a igualdad, la primera guardada. Si hay archivos distintos para un mismo producto en esa ubicación, se informa conflicto sin reemplazar la foto anterior. Una copia de mayor prioridad ya disponible se conserva si su carpeta queda desconectada. No se eliminan fotos porque desaparezcan del origen ni cuando se desactiva una ubicación.

Se valida el contenido del archivo, se calcula su huella, se escribe una copia temporal y se publica la copia completa antes de actualizar los metadatos SQL. Las fotos existentes de facturas se mantienen como alternativa. El catálogo Fotos y la exportación de grillas prefieren el repositorio sincronizado; las grillas reutilizan una foto de su plantilla si no hay foto en la app.

La sincronización se ejecuta en segundo plano, una por vez. La interfaz muestra etapa, tiempo, progreso medido por candidatos, totales y hasta 100 observaciones. Los totales finales del proceso se conservan con las ubicaciones en SQL. El proceso activo está en memoria: si la app se reinicia, puede iniciarse otra sincronización sin duplicar las imágenes ya copiadas.

Rutas: GET/POST `/api/fotos/ubicaciones`, POST `/api/fotos/sincronizar`, GET `/api/fotos/sincronizacion/:id`, GET `/api/fotos/imagen/:producto`.
