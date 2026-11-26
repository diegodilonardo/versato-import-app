# Usuarios y permisos

La activación se hace después de actualizar los archivos y preparar SQL. Los cron siguen ejecutándose dentro del servicio, sin sesión de navegador. No se crean usuarios ni contraseñas por defecto. No se modifican las programaciones existentes.

## Instalación en el servidor

1. Actualizar con `scripts/actualizar-produccion.ps1` usando el servicio `ProcesosVersatoFC`. La actualización conserva `.env`; todavía no activa el login.
2. En `FC_VERSATO_APP`, ejecutar `sql/008_usuarios_y_sesiones.sql` con una cuenta administradora. El script concede permisos al usuario SQL `versato_fc_app`; si se utiliza otro login, el DBA debe conceder a su usuario las mismas autorizaciones específicas.
3. Desde `C:\versato-import-app`, ejecutar ` .\scripts\crear-primer-admin.ps1`. Solicita el usuario, nombre y contraseña sin mostrarla. Solo permite crear el primer usuario cuando la tabla está vacía.
4. Publicar la app por HTTPS (certificado y proxy inverso del servidor). En `.env` configurar:

   ```dotenv
   AUTH_ENABLED=true
   AUTH_COOKIE_SECURE=true
   ```

   Si HTTPS termina en un proxy, configurar `AUTH_PROXY_IP` con la IP exacta del proxy (por ejemplo `127.0.0.1`). No usar `true` ni comodines: solo proxies bajo control del administrador. El proxy debe conservar el encabezado Host público y establecer X-Forwarded-Proto=https; restringir el acceso directo al puerto de Node para evitar eludir HTTPS.

   La URL actual `http://192.168.106.34:3300` no cifra contraseñas ni cookies. Si el responsable decide realizar una transición temporal en esa red, puede establecer **explícitamente** `AUTH_COOKIE_SECURE=false`. Esto permite HTTP pero no protege credenciales ni sesiones en tránsito. La configuración predeterminada exige HTTPS para iniciar sesión.

5. Reiniciar `ProcesosVersatoFC`, abrir `/login` y entrar con el administrador. En **Usuarios** crear las cuentas personales. Conservar el acceso a la consola del servidor durante la activación.

Si faltan tablas o un administrador activo con AUTH_ENABLED=true, el servidor no inicia. Corregir SQL o crear el administrador antes de reiniciar. No hay alta pública, enlace de registro ni contraseña de emergencia.

## Perfiles iniciales

| Perfil | Permisos |
| --- | --- |
| Administrador | Todos, incluyendo usuarios, auditoría, cancelar facturas y programar/publicar grillas. |
| Operador COMEX | Facturas, NV, cambio de cliente, precios, FTP, maestro de clientes y fotos. |
| Comercial | Stock, descargar grillas, guardar vistas, consultar precios, clientes y fotos. |
| COMEX + Comercial | Unión de ambos perfiles. |
| Consulta | Lectura de facturas, precios, stock, clientes y fotos. |

El administrador puede ajustar permisos por usuario, incluyendo cancelar facturas o programar/publicar grillas. Una vista con programación activa solo puede modificarse o eliminarse con el permiso de programar grillas; esto evita cambiar indirectamente una publicación automática. Solo los administradores gestionan cuentas y auditoría. No se permite desactivar o degradar al último administrador activo. La administración no elimina usuarios; se desactivan para conservar trazabilidad.

Las cuentas nuevas y las contraseñas restablecidas exigen cambio al ingresar. Cada cambio de permisos, perfil o estado invalida las sesiones previas. La contraseña propia se cambia en **Mi cuenta** y también invalida todas las sesiones. Para restablecer la de otra persona, editar su usuario e ingresar una nueva contraseña inicial.

## Sesiones y trazabilidad

- Contraseñas con scrypt, sal aleatoria individual; nunca texto plano.
- Sesiones de 8 horas absolutas, token aleatorio de 256 bits en cookie HttpOnly y SameSite=Strict. SQL conserva solamente la huella del token.
- Validación de origen y token CSRF en acciones con sesión, incluyendo formularios de descarga DBI.
- Límite de intentos por IP y bloqueo temporal de cuenta tras 5 contraseñas incorrectas. Reiniciar la app no borra el bloqueo de cuenta guardado en SQL.
- Permisos verificados en el servidor, también al llamar directamente a la API. Ocultar controles es una ayuda visual, no el control de acceso.
- Auditoría SQL con usuario, fecha, ruta sin query, estado y referencia para relacionar inicio/resultado. No registra contraseñas, cuerpos ni contenidos de archivos. Las ejecuciones de cron conservan su historial propio y no requieren un usuario conectado.
- Si no puede registrarse el inicio de una acción mutadora, la acción no continúa. La respuesta final se registra al finalizar; un cierre abrupto puede dejar una acción con estado INICIADA.
- Los backups de SQL incluyen cuentas, auditoría y sesiones. Los registros de auditoría no se purgan automáticamente.

Fuentes de diseño: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Node.js crypto](https://nodejs.org/api/crypto.html).
