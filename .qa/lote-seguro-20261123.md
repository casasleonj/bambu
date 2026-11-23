# Lote de PR independientes sobre main (2026-11-23)

Base SHA: `d08922e442583835f8780f5ddae63f41a1f07bc4`.

## Procedencia exacta (sin reconstruir código ni reglas)

- PR #937 (issue #813, hint de login): `2573b9cb40691e774ee4c8893fd089929f065021`.
- PR #951 (issue #748, base diaria del Dashboard): `1aadc9570be325b10331879e3ab88fa33d169eb3`.
- PR #947 (issue #812, logout mismo origen y limpieza cache no bloqueante): `cabbe3b4bde80ff92729ee751f55f2f6a5a03574`.

Las 11 rutas se copiaron por identidad SHA desde los PR originales. Sus rutas modificadas no se solapan entre sí. Los archivos productivos afectados fueron comparados entre la base original de cada PR y `main@d08922e442583835f8780f5ddae63f41a1f07bc4` y sus SHAs coincidieron, preservando la evolución posterior de main en los demás archivos.

## Contratos adversariales a validar en el nuevo CI

1. Login: hint de modo desarrollo no usa roles ni estilo de error; al fallar credenciales aparece error real y no el hint.
2. Logout: Auth.js confirma salida antes de navegar a /login relativo al origen; error o timeout de CacheStorage no detiene cierre; caché autenticada se purga si responde; sin respuesta válida de Auth.js NO se declara salida exitosa.
3. Dashboard: base del día sin configurar no se hereda del global; no se escriben bases, cobros o cierres; base configurada hoy e histórica se respeta.
4. Integración cruzada: login/logout y Dashboard funcionan juntos en móvil/escritorio; transiciones de sesión no provocan datos previos en la siguiente cuenta.
5. Ningún cambio a esquemas, migraciones, escrituras financieras, producción, inventario, workflows CI ni dependencias.

## Estado de entrega

Originales: en sus SHAs tenían CI gate y E2E 8/8 + Hub + integración en verde. Eso NO certifica este árbol compuesto. Solo fusionar tras CI gate, pruebas de integración, E2E Hub y shards y revisiones aplicables en el SHA actual; no omitir branch protection. Si falla cualquiera, diagnosticar y corregir antes del merge.

## Sin pérdidas de trazabilidad

Cuando el lote esté fusionado y el código esté realmente en main, los PR originales deben cerrarse como supersedidos por esta integración, nunca fusionarse dos veces. En caso de que la integración fracase, conservar originales abiertos.
