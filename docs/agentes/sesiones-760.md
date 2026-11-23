# Sesiones: contrato técnico y verificación de #760

Estado de este documento: describe la implementación candidata de [#760](https://github.com/casasleonj/bambu/issues/760). La evidencia de liberación y el SHA definitivo corresponden al PR y a su registro QA; este documento no certifica por sí mismo un despliegue.

## Política conservada

La referencia técnica anterior es `5418ba9172b0866bb494342c062fe4437e419f4f`. No se encontró una decisión verificable que sustituya los límites por rol por «dos para todos» ni LRU por FIFO.

| Rol habilitado | Sesiones simultáneas | Ventana renovable |
| --- | ---: | --- |
| ADMIN, ASISTENTE | 2 | 30 minutos |
| CONTADOR, SELLADOR | 1 | 30 minutos |
| REPARTIDOR | 1 | 6 horas |

`SESSION_LIMITS_JSON` permite overrides enteros positivos. La sesión menos recientemente activa se expulsa al superar la capacidad. El polling técnico cuenta como actividad: estas ventanas no son una medición de inactividad humana. La cookie tiene una envoltura máxima de seis horas; la fila vigente en PostgreSQL determina el acceso y la ventana efectiva de cada rol.

## Tres resultados diferentes

- **Válida:** fila propia, vigente y cuenta habilitada; los privilegios se leen del usuario actual. La renovación usa el reloj de PostgreSQL y no recrea filas revocadas. Se limitan las escrituras ordinarias a una por minuto.
- **Inválida:** faltan la asociación o la fila, venció, fue revocada o la cuenta no puede acceder. No se devuelven privilegios y el cliente verifica antes de ir al login.
- **Indisponible:** no se puede verificar el almacén, incluso si falta su tabla. Se impide acceder a datos con 503 y se ofrece reintento; se conserva la credencial privada para comprobarla cuando vuelva el servicio. No equivale a autorización ni a revocación.

Las excepciones transitorias se propagan fuera de los callbacks de refresco de Auth.js: en `@auth/core` instalado, arrojar una excepción dentro del callback JWT elimina las cookies. Un fallo de registro inicial impide emitir una sesión utilizable.

Desactivar una cuenta mediante PUT o DELETE revoca sus sesiones dentro de la misma transacción. Reactivarla requiere un nuevo login. Un cambio de rol se comprueba en la siguiente petición y reconcilia capacidad y duración sin conservar privilegios del rol anterior.

## Cliente, cookies y cierre

Existe un único `SessionProvider`, hidratado por el layout protegido. Se conserva el SDK, su polling y su sincronización; un 403 de permisos no expulsa al usuario. Un 401 solicita una comprobación actual antes de decidir si corresponde salir.

Las respuestas normales del proxy no rotan cookies de sesión. Las consultas del SDK a `/api/auth/session`, el login y el logout comparten un Web Lock por origen. Una transición espera la respuesta completa anterior para que una respuesta tardía de A no sobrescriba el acceso posterior de B. El transporte y la espera del lock tienen plazos acotados; una espera agotada no permite iniciar un segundo escritor.

**Límite real:** la coordinación entre pestañas requiere Web Locks en un contexto seguro, como HTTPS o localhost. Sin esa API solo se serializa dentro de la pestaña. No se garantiza exclusión entre pestañas en navegadores antiguos o HTTP inseguro. No se guardan credenciales en este mecanismo.

El cierre explícito confirma primero la revocación remota, conserva la limpieza existente de push/caché y luego solicita el cierre al SDK. Ante error se muestra «No se pudo confirmar el cierre», con reintento. El aviso de cierre confirmado solo aparece tras el regreso al login.

## Validación reproducible

- Unitarias: callbacks, límites, transporte/cuerpo incompleto, exclusión, cookies, guards, 401/403 y limpieza de logout.
- PostgreSQL: `session-store.test.ts` y `session-verification-760.test.ts`, con base exclusivamente local. Incluyen renovación, fila ausente, tabla temporalmente ausente, cuenta ajena, cambio de rol, desactivación y revocación concurrente.
- Navegador: `npx playwright test --config=playwright.sessions.config.ts --project=chromium`. Este servidor separado usa los límites reales. La suite general usa 50 sesiones para sus fixtures; por eso no acredita la política por defecto. CI ejecuta la suite dedicada después del Hub y conserva ambos reportes.
- QA de usuario: login por formulario, recarga, fallo y recuperación, revocación, logout con error/reintento, otra pestaña, cambio de identidad y vista móvil. Registrar evidencia efectiva en `.qa/pr-<N>.md` antes de liberar.

La base local necesita `prisma db push` y las migraciones de `scripts/migraciones-sql-crudas.txt`, como CI. No ejecutar las pruebas destructivas contra producción ni compartir cookies, contraseñas o tokens en reportes.

## Alcance pendiente separado

- [#323](https://github.com/casasleonj/bambu/issues/323): propiedad y aislamiento de operaciones offline entre cuentas. #760 no certifica que una cola antigua pueda reenviarse de forma segura con otro usuario.
- [#988](https://github.com/casasleonj/bambu/issues/988): formulario de cambio obligatorio de contraseña y su contrato con el backend.
- La reproducción técnica identifica mecanismos de fallo; no demuestra que todos los cierres históricos reportados tengan la misma causa ni modifica registros de producción.

Fuentes de biblioteca verificadas: `next-auth@5.0.0-beta.31`, `@auth/core` instalado (`lib/actions/session`, `lib/actions/signout`), Next.js 16.2.4 y [Web Locks API de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). La investigación previa, sus límites y la aprobación de la fase quedan trazados en #760 y en el PR.
