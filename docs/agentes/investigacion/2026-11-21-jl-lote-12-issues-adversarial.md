# JL · Revisión adversarial del lote de 12 issues (R2+)

**Fecha:** 2026-11-21. **Base de código:** main@7200f58f306e0ab0f225d6b6753118a37767d9b0. **PR de investigación:** #935.  
**Cobertura:** #906, #837, #815, #812, #634, #334, #319, #873, #814, #632, #610 y #333.  
**Estado:** DISEÑO / REVISIÓN ADVERSARIAL. No se han ejecutado pruebas ni creado cambios de producto; los hallazgos de código son inspección estática y las posibilidades futuras se señalan como riesgos, no bugs reproducidos.

## 1. Resultado: cambios materiales al plan inicial

1. **#319: DEFECTO ADICIONAL CONFIRMADO POR CÓDIGO.** En POST /api/embarques/[id]/movimientos, el reintento busca por offlineId y devuelve el movimiento existente sin cotejar embarqueId, tipo, producto, cantidad, origen, destino y autorización con la petición actual. Un replay cruzado entre embarques puede devolver un resultado ajeno (sin escribirlo en el segundo embarque). También existe una ventana de carrera entre findUnique y create que podría acabar en error por unicidad. **No resolver #319 solo con z.enum: comprobar el contrato de idempotencia y reportar la brecha adyacente por separado si exige otro alcance.**
2. **#634: riesgo de falsa seguridad ante cobro incierto.** Los pagos recientes remotos se leen asíncronamente con actualizarRecientes, mientras los borradores locales se leen de sessionStorage por actorId. La propuesta de plegar debe mantener errores, estado pendiente y recuperación a la vista. Un cambio de actor con petición antigua en vuelo puede conservar temporalmente respuestas previas. Verificar ese caso; **no afirmar fuga de datos reproducida sin prueba**.
3. **#610: precisión histórica distinta a hora exacta.** src/lib/pago-fecha-correccion.ts crea ocurridoAt al mediodía de Bogotá cuando solo se corrige el DÍA de pago. Ese instante es un marcador técnico, no evidencia de que el cliente pagó a las 12:00. Pago.createdAt sí conserva la hora del registro. No reutilizar como hora de cobro un timestamp cuya precisión es DÍA.
4. **#812: la ausencia de cookies en el host de destino 0.0.0.0 no prueba por sí sola su ausencia en localhost.** El código invoca revocación de sesión y signOut, pero la verificación debe **volver al host de origen** y probar sesión inválida incluso al retroceder o recargar.
5. **#333: proteger solo el check Backlog no impide fusionar código con CI rojo.** main sigue con protected=false (REST branches/main). El plan debe separar regla de trazabilidad Backlog, controles técnicos CI gate, bypass de administradores, reglas de protección y disparo de despliegue. docs/ci/GATES.md contiene instrucciones históricas diferentes: no convertirlas automáticamente en decisión vigente.
6. **#873: reutilizar la investigación del comentario de issue del 19-nov (columna móvil / fila >=sm / print:flex-row), todavía NO aprobada.** No modificar el renderer PDF independiente sin hallazgo; verificar ambos flujos para descartar regresiones.
7. **#837: PR #835 ya no define por sí solo el UX vigente.** #915 y #927 integraron anteriores/parciales en lista general. Auditar el contrato actual y no restaurar una sección histórica sin consentimiento.

## 2. Matriz de pruebas adversariales

**Leyenda:** C = debilidad confirmada por inspección estática; R = escenario de riesgo aún no comprobado; H = evidencia histórica, no ejecución actual. **P0/P1/P2** indican prioridad preventiva sugerida, no severidad verificada en producción.

### #319 · Ledger / custodias / idempotencia

| ID | Tipo | Caso de falsación | Resultado exigido / evidencia | Prioridad |
|---|---|---|---|---|
| A319-01 | C | origen/destino: valor inventado, espacios, cadena vacía, null, array, minúsculas | 400 sin movimiento creado. Lista canónica CUSTODIAS sin reinterpretación silenciosa | P1 |
| A319-02 | C | Registrar movimiento M en embarque A con offlineId=X. Reenviar X a URL del embarque B | No devolver M de A como si fuera B; rechazar la colisión cruzada con resultado seguro (p.ej. 409) y sin exponer datos ajenos | P0 |
| A319-03 | C/R | Reusar X en el mismo embarque, pero con producto/cantidad/tipo distintos | No responder deduped:true como si fuera una repetición idéntica; comparar huella o contrato existente antes de definir código HTTP | P1 |
| A319-04 | R | Dos POST simultáneos con mismo offlineId | Crear uno solo y resolver ambos sin 500 evitable, sin doble inventario | P1 |
| A319-05 | R | Ajuste autorizado sin origen/destino y transferencia con origen=destino | No bloquear flujos legítimos por validación universal; confirmar reglas por tipo antes de exigir ambos campos | P1 |
| A319-06 | R | ID de embarque inexistente o cerrado, rol ASISTENTE, origen válido | Verificar permisos y estado de negocio en POST vs GET; autorización del endpoint no es prueba de autorización a una entidad específica | P1 |
| A319-07 | R | Error 4xx de custodia durante entrega/reempaque; reintento offline | No persistir movimiento parcial ni alterar saldo físico; conservar referencia de recuperación | P1 |

### #610 · Hora de pago en venta anónima

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A610-01 | R | Venta sin cliente individual, pagada en efectivo; Pedido/Pago/Factura | Localizar la vista exacta; mostrar hora efectiva SOLO cuando hay evidencia del instante | P1 |
| A610-02 | C/R | Pago registrado hoy con corrección de fecha a otro día (ocurridoAt fijado a mediodía) | Mostrar día efectivo sin rotular 12:00 como hora real; hora de registro separada y claramente identificada | P0 |
| A610-03 | R | Venta pagada por dos medios en momentos diferentes / pago digital reportado pendiente | Cada medio conserva su estado y fecha; no sugerir recepción confirmada por el solo registro | P1 |
| A610-04 | R | Venta creada offline y sincronizada al día siguiente, pagos parciales | No confundir fecha/hora del servidor con hora de entrega física o recepción si no existe evidencia | P1 |
| A610-05 | R | Ventas antiguas sin Pago o sin fecha verificable | Mostrar ausencia de dato; no fabricar hora con Pedido.fecha/createdAt, ni reconstruir historial | P1 |
| A610-06 | R | Detalle, listado, factura, historial y exportación del mismo pago | Mismo significado temporal entre consumidores, sin alterar cierre, caja ni fiado-al-corte | P1 |

### #634 · Pagos recientes, locales e inciertos

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A634-01 | C/R | Múltiples cobros confirmados y ninguno pendiente | Historial colapsable con conteo y acceso a resultados y documentos sin ocupar la pantalla | P2 |
| A634-02 | R | Cobro enviado, conexión perdida, respuesta desconocida | Alerta y acción «Ver estado» siempre visibles aunque historial esté cerrado; misma referencia offlineId | P0 |
| A634-03 | R | 409 por deuda cambiada o error al consultar recientes | No convertir error en éxito; botón reintentar y borrador visible | P1 |
| A634-04 | C/R | Cambio de actorId mientras /pagar-fiado?recientes=true está en vuelo | Evitar resultados viejos o borradores de sesión anterior en UI; cancelar/descartar respuesta obsoleta y respetar autorización | P1 |
| A634-05 | R | Pago visible en recientes y borrador pendiente con misma referencia | No presentarlo como dos cobros distintos; confirmación del servidor determina transición | P1 |
| A634-06 | R | Vuelve de detalle, cambia pestaña, recarga y usa teclado/móvil | Mantener estado accesible, foco e indicaciones de expansión; pendiente crítico tiene prioridad al reabrir | P2 |

### #812 · Logout y host

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A812-01 | H/C | Salir desde localhost:3001, IP local, dominio HTTPS y los dos controles de logout | URL de /login en el MISMO origin válido, sin redirect a host interno | P1 |
| A812-02 | R | Después del logout, volver al host de origen, recargar, back, abrir nueva pestaña | Acceso a páginas y APIs autenticadas rechazado; validar cookies/token en host original, no solo destino | P0 |
| A812-03 | R | SignOut doble clic, red intermitente, revocación fallida | No mostrar éxito falso; preservar invalidación de sesión y limpieza de caché/push; sin loop | P1 |
| A812-04 | R | Auth.js devuelve URL absoluta externa o de callback no confiable | No incorporar un callbackUrl arbitrario ni redirección abierta | P1 |
| A812-05 | R | PWA / historial de navegación tras logout y múltiples dispositivos | No mostrar datos cacheados a usuario sin sesión; no revocar por accidente sesiones de terceros | P1 |

### #814 · Diferenciar acceso denegado y ruta inexistente

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A814-01 | C/H | Repartidor→/clientes; contador→/admin/usuarios y /produccion | Mensaje 403 legible o pantalla segura; jamás datos de la sección prohibida | P1 |
| A814-02 | R | /ruta-que-no-existe y /clientes/identificador-inventado (ruta bajo prefijo restringido) | Diferenciar 404 de 403 cuando sea posible sin filtrar existencia de recursos protegidos; definir precedencia de manera explícita | P1 |
| A814-03 | C/R | /pagos-confirmar, protegida por usuario designado, no por permiso de rol | NO reemplazar la autorización individual por un mapa general de roles | P0 |
| A814-04 | R | Sin sesión, sesión caducada, usuario desactivado, URL compartida | Login/401 cuando corresponda; 403 reservado para usuario autenticado sin permiso; sin bucles | P1 |
| A814-05 | R | PWA offline, botón «volver», enlaces del menú, reader de pantalla | Acción de recuperación clara; no capturar API/health/realtime como páginas 403 | P2 |

### #815 · Contacto y nombres truncados

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A815-01 | C | Input con icono y sin icono, placeholder largo, 320/390px, zoom 200% | +57 y dígitos sin solape, sin desplazamiento oculto | P2 |
| A815-02 | R | Pegar 310…, +57 310…, 57310…, editar, borrar y autofill | Canonización y valor emitido preservados; no repetir 57 ni perder dígitos | P1 |
| A815-03 | C/R | Nombre/apellido/contacto/nombre negocio truncado | Nombre completo accesible en táctil, teclado y lector de pantalla; el atributo HTML title por sí solo no basta en móvil | P2 |
| A815-04 | R | Nombres extensos y coincidencias de búsqueda en filas | No tapar botones ni generar scroll horizontal; no cambiar navegación a ficha ni prefetch | P2 |

### #873 · Resumen consolidado en móvil

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A873-01 | C/H | 320, 390, 640, 1280px; nombre y dirección de empresa largos | Sin intersección de logo, datos, número, título y período; no overflow | P2 |
| A873-02 | R | Impresión PDF navegador A4 y páginas múltiples | Fila de impresión preservada con print:flex-row, sin recortes ni salto indebido del encabezado | P1 |
| A873-03 | C/R | PDF compartido por WhatsApp generado con @react-pdf/renderer, separado del HTML | No cambiarlo por accidente; contrastar composición e importes para verificar consistencia semántica | P2 |
| A873-04 | R | Imagen de logo no carga, zoom 200%, fuente grande | Texto y acciones legibles sin depender de la imagen | P2 |

### #632 · Lenguaje de cierre

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A632-01 | C | El cierre actual ya usa «Resumen del dinero del día» y AyudaTermino | No restaurar títulos antiguos ni rehacer un diseño previamente aprobado (#601/#646) | P2 |
| A632-02 | R | Cobro de deuda anterior vs venta de hoy; efectivo vs Nequi | Etiquetas y ayudas distinguen eventos; un mismo importe no se representa como venta nueva | P1 |
| A632-03 | R | Cierre guardado histórico, diferencia arqueo antigua, dato sin precisión | Simplificar textos SIN tocar cifras, fecha de corte, snapshots ni semántica de deuda | P0 |
| A632-04 | R | El personal usa tooltip en móvil sin hover, teclado, zoom y modo lectura | Ayuda accesible desde «?», con cierre, foco y vocabulario comprensible | P2 |
| A632-05 | R | 0, negativo, sin datos, ajustes posteriores y duda «¿qué debo hacer?» | Acción clara, estados vacíos reales y explicación sin afirmar una reconciliación ficticia | P1 |

### #334 · Summary de specs E2E

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A334-01 | C/R | Playwright falla ANTES de escribir JSON (timeout, build, OOM, seed) | Summary dice «sin resultados estructurados», NO «0 fallos» | P1 |
| A334-02 | R | 8 shards + Hub V2 con reporteros HTML/JSON concurrentes | Nombres de archivo únicos y upload; no romper el exit code original de Playwright | P1 |
| A334-03 | R | Test reintentado, flaky, omitido o interrumpido | Resultado por proyecto/test + intento; no confundir pasó al reintento con pasó de primera | P1 |
| A334-04 | R | PR y main difieren en SHA, flags, navegador o tipo de suite; baseline caducado | «NO COMPARABLE / NO DISPONIBLE» cuando corresponda, no inventar regresión/ausencia | P1 |
| A334-05 | R | Paths movidos, mismo nombre de test en varios proyectos, specs duplicados en Hub | Normalizar identidad sin comparar únicamente basename o shard | P2 |
| A334-06 | R | Mensajes de error con datos personales/secretos, summary Markdown malicioso | Sanitizar salida y acotar longitud; summary informativo no bypass de gate | P1 |

### #906 · E2E intermitente #779

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A906-01 | C/H | Consultas legítimas iniciadas antes del marcador tras reload | Instrumentar inicio, fin, cancelación y origen; no confundir in-flight con bucle | P1 |
| A906-02 | R | Bucle real continuo de /api/pedidos/consulta que aparece después de 2 s | La aserción aún debe detectarlo; no «arreglar» flake aumentando umbral indiscriminadamente | P0 |
| A906-03 | R | ADMIN/ASISTENTE, red normal/lenta, cambio de pestaña, offline/reconexión | Estado, filtros y selección coherentes; ausencia de bucle y error React 185 | P1 |
| A906-04 | R | Reintentos CI pasan, primeras ejecuciones siguen fallando | Resultado FLAKY hasta estabilizar; evidencia de varias corridas reales antes de cierre | P1 |
| A906-05 | R | Pestañas simultáneas y sesiones caducadas durante reconexión | No filtrar datos entre usuarios, ni convertir error 401 en refetch infinito | P1 |

### #837 · Auditoría posterior del PR #835 y código evolucionado

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A837-01 | C/H | #915/#927 cambiaron lista separada por universo integrado | Auditar el flujo VIGENTE; el PR #835 es evidencia histórica y su QA no certifica main actual | P1 |
| A837-02 | R | Ayer/anteayer, pendiente/parcial/entregado hoy, duplicados, estado NO_ENTREGADO | 1 pedido = 1 fila operativa; fecha original intacta, movimiento físico de hoy reflejado sin duplicación | P1 |
| A837-03 | R | Filtro barrio/cliente/origen/pago, fecha histórica, reprogramación futura, >5 anteriores | Sin desapariciones, cruces de filtros ni importes del día incorrectos | P1 |
| A837-04 | R | ADMIN vs CONTADOR, móvil vs escritorio, lectura vs acciones | La capacidad de consultar no otorga permiso de entregar/cobrar | P1 |
| A837-05 | R | QA en producción solicitando crear pedido o registrar entrega | Prohibidas mutaciones en producción: usar preview/base sintética y producción solo lectura | P0 |
| A837-06 | H/R | Auditoría hecha por familia distinta, pero sin run/CI/despliegue verificados | Registrar «auditoría estática parcial», no cerrar #837 como QA completa | P1 |

### #333 · Protecciones de main

| ID | Tipo | Caso | Resultado exigido | Prioridad |
|---|---|---|---|---|
| A333-01 | C | main protected:false; PR sin issue, check Backlog rojo | La regla debe bloquear el merge realmente, no solo mostrar estado | P0 |
| A333-02 | R | Backlog verde pero CI gate rojo | El merge también debe detenerse si la política vigente exige CI; decidir required checks separados y estables | P0 |
| A333-03 | R | Check context renombrado o omitido en PR docs-only; job matricial E2E omitido | No exigir E2E(n/8) individual con ejecución condicional; comprobar nombre exacto real | P1 |
| A333-04 | R | Merge por admin, token, bypass o push directo a main | Definir bypass autorizado; impedir que protección exista solo en apariencia | P0 |
| A333-05 | R | Falla gate de auditoría por cadena-agentes, rama sin checks | Resolver política explícita del gate, no contar comentario como sustituto de verificación independiente | P1 |
| A333-06 | R | Vercel se despliega en push a main antes de validación | La protección del PR debe ser preventiva; smoke post-release no compensa un merge inseguro | P0 |

## 3. Interacciones entre issues: contrapruebas transversales

- **#319 ↔ inventario y embarques:** validar movimiento no garantiza stock correcto. Probar lectura ledger → conteo físico → cierre/ajuste, y respuestas de error sin efectos parciales. **No modificar reglas de inventario dentro de #319 sin decisión explícita.**
- **#634 ↔ #610 ↔ #632:** un cobro incierto no es un cobro confirmado, un pago registrado no necesariamente equivale a recepción efectiva, y una fecha retroactiva sin hora verificable no permite afirmar hora exacta. Pruebas de un mismo caso en Fiados, Pedido, Cartera y Cierre.
- **#812 ↔ #814:** logout, token caducado, rol denegado, ruta inexistente y offline deben conducir a respuestas distintas y seguras, sin leaks de datos ni redirect loops.
- **#906 ↔ #334 ↔ #837:** #334 debe comparar primera ejecución/reintentos/baseline, #906 no ocultar consultas en bucle, #837 validar el Hub real después de integraciones #915/#927. No usar CI verde para asumir QA humana.
- **#815 ↔ #873:** estilos adaptativos no deben convertirse en cambios globales que afecten impresión, scroll o accesibilidad en otras pantallas.
- **#333 ↔ todos:** un PR docs-only con diff correcto no demuestra que main esté protegido. GitHub puede fusionar con checks rojos mientras la protección no esté configurada.

## 4. Priorización y corrección al plan inicial

**Bloqueantes de seguridad/integridad para cualquier entrega relacionada:** A319-02/A319-03, A610-02, A634-02, A814-03, A632-03, A333-01/A333-02. Esto no significa que exista exploit demostrado; significa que el diseño propuesto no puede ignorarlos.

**Orden recomendado:** (1) anclar contrato/evidencia de seguridad #319; (2) configurar controles de rama #333 (acción de administrador); (3) implementar reporte E2E #334 para observar #906; (4) auditar #837 sobre main y ejecutar QA; (5) evaluar/someter a aprobación UI #812/#814/#815/#873/#634/#632; (6) reproducir #610 antes de decidir código y maqueta definitiva. Las fases independientes pueden investigarse en paralelo sin apilar PRs de código no integrados.

### Gates que siguen faltando
- [x] Inspección estática y falsación de diseño de los 12 issues.
- [x] Registro de escenarios adversariales, incluidos hallazgos no previstos por el primer plan.
- [ ] Aprobación explícita del PO del plan corregido y de maquetas afectadas.
- [ ] Código modificado, unit/integration/CI, runs reales con salida y SHA, QA navegador, revisión de terceros.
- [ ] Pruebas de negocio y end-to-end de casos P0/P1, reintentos/offline/dos roles.
- [ ] Regla de protección real aplicada y prueba negativa sin issue (#333).
- [ ] Merge aprobado y verificación post-merge.

**Conclusión adversarial:** convergencia de diseño **CONDICIONADA**. No se justifica declarar 12/12 resueltos, ni ejecutar merges, ni cerrar #837/#906/#610 por inspección estática. La revisión del plan mejora seguridad, pero todavía faltan pruebas que puedan refutarla.
