# #930 · Orden vial desde GPS (sin mapa) · fase backend

**Estado:** implementación en rama, **apagada por defecto**. Requiere validación de CI, permiso para habilitar servicio externo y QA de recorridos reales antes de UX/producción.

## Qué hace y qué no hace

- Recibe desde una sesión autenticada un **conjunto explícito** de 1–25 IDs de pedidos y origen GPS.
- Vuelve a leer los pedidos y los exigibles en transacción de PostgreSQL (aislamiento `RepeatableRead`) y valida destino efectivo `Pedido > Negocio > Cliente`, entregas parciales, regalos y cobro exigible.
- Incluye **entregas físicas pendientes**, **fiados de pedidos ya entregados** y gestiones mixtas. Excluye entregados y pagados, anulados, ventas en punto sin cobro exigible y programados para otro día. Rechaza pedidos ya asignados a embarques de otro flujo.
- Llama a Google Route Optimization API, **motor vial**: origen GPS, un solo vehículo en perfil `DRIVING` provisional, **fin libre** y coste por hora conducida. No usa Haversine, no dibuja mapas, no envía polilíneas ni calcula rutas geodésicas.
- Valida retorno de Google: **todos los IDs** de la selección deben aparecer una sola vez, sin entregas omitidas. Resultado de solo lectura con `ordenPedidoIds`, no reasigna, no embarca, no cobra.
- No infiere que la velocidad ni restricciones de Google `DRIVING` describan perfectamente la **motocarga de tres ruedas**. Antes de uso operativo, contrastar en Codazzi recorridos reales anonimizados.
- No integra todavía el botón de la lista General, los filtros globales, selección superior a 25, ni el orden `1,2,3` en tarjetas. Esa fase UI exige maquetas aprobadas escritorio/móvil y pruebas de navegación.
- No garantiza ventanas horarias: `entregaNoAntesDe` es una preferencia de la interfaz actual (#836), no una restricción dura aprobada. El resultado devuelve advertencias para revisar; no promete puntualidad. No valida carga/capacidad, avisado en respuesta.
- Un pedido anterior que *solo* tiene fiado puede ser una parada de cobro sin cargar producto. No convertir esta sugerencia en cobro automático.

## Contrato HTTP

`POST /api/pedidos/recorrido-vial` con usuario autenticado y permiso `view:pedidos`, `Content-Type: application/json`, body:

```json
{
  "pedidoIds": ["pedido-uuid-A", "pedido-uuid-B"],
  "origen": { "lat": 10.034, "lng": -73.237 }
}
```

Las coordenadas son **ficticias**. Se responden solo IDs en orden sugerido y avisos operativos. Nunca se envían secretos ni coordenadas en URL; cache-control privado y no-store. Un estado no configurado se devuelve como `503`, sin fallback engañoso por Haversine.

## Configuración externa segura (imprescindible antes de activar)

1. Crear proyecto Google Cloud con facturación administrada, habilitar **Route Optimization API**, cuenta de servicio con permiso `routeoptimization.locations.use` y autenticar por OAuth 2.0 (servidor a servidor).
2. **Configurar un límite real de cuota** en Google Cloud Console > Google Maps Platform > Quotas **antes** de introducir `GOOGLE_ROUTE_OPTIMIZATION_QUOTA_CONFIRMED=true`. Al principio se recomienda máximo cuatro solicitudes diarias y hasta 25 envíos cada una (escalón conservador para pruebas). Ajustar con evidencia operativa y tarifas vigentes. Si Google no ofrece esa dimensión de cuota, buscar el límite de cuota disponible más protector y no activar hasta demostrar el control efectivo.
3. Configurar **Cloud Billing Budget + alerts** como vigilancia adicional. **Los presupuestos alertan, no detienen la facturación.** El límite real de uso debe ser la cuota.
4. Variables **solo servidor**, en Vercel/gestor de secretos, no Git:
   - `GOOGLE_ROUTE_OPTIMIZATION_ENABLED=false` de inicio.
   - `GOOGLE_ROUTE_OPTIMIZATION_QUOTA_CONFIRMED=false` hasta comprobar la cuota en consola.
   - `GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID` = ID del proyecto.
   - `GOOGLE_ROUTE_OPTIMIZATION_CLIENT_EMAIL` = email cuenta de servicio.
   - `GOOGLE_ROUTE_OPTIMIZATION_PRIVATE_KEY` = PEM privado (puede representarse con `\n` escapados), nunca publicarlo.
5. Finalmente, tras QA y comprobación de cuota/permiso, pasar los dos flags a `true`. Actualizar límites y rotación de credenciales en el gestor de secretos. **Ninguna consulta facturable se produce desde este código antes de esa activación explícita.**

## Limitaciones y riesgos

- El endpoint actual no infiere una salida de todos los resultados filtrados; espera una selección. **No tomar solo la primera página de la lista General**: diseñar y aprobar selección global antes de usar la experiencia.
- La consulta es de **un vehículo** sin modelar capacidades, recargas ni ventanas estrictas de comercios; requiere fase ulterior de Planificador/Embarques antes de afirmar optimización operativa integral.
- Posible concurrencia: pedido puede cambiar después del snapshot. Revalidar versión/estado antes de despacho; el endpoint actual no despacha. Nunca facturar o cobrar en el cálculo.
- Asegurar prevención de spam/costos mediante permisos, cuotas Google verificadas y política de recálculo explícito. Un budget no es hard cap; la app no es fuente de facturación.
- No enviar referencias personales; el proveedor recibe solo coordenadas y etiquetas de IDs técnicos. Verificar política de privacidad/tratamiento de datos antes de activar.

## QA solicitado

- Vitest: origen externo, carretera vs recta, ID 0 proto3 omitido, paradas omitidas/duplicadas, >25, cancelados/entregados/fiados, regalos, coordenadas inválidas.
- Integración PostgreSQL: multiusuario, fiados exigibles de parciales, pagos abonados, estado terminal, fila de otro embarque, negocio vs cliente, fecha futura, autorización.
- E2E: desde vista General filtros combinados, paginación >25, GPS denegado, error 429/503, recálculo explícito, botón exclusivo Recorrido/Cercanía, modo móvil, sin mapa.
- Validación real: comparar propuestas viales con secuencias conocidas y limitaciones de motocarga en Agustín Codazzi, sin publicar datos personales.

## Documentación oficial verificada (noviembre 2026)

- https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects.locations/optimizeTours
- https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/ShipmentModel
- https://developers.google.com/maps/documentation/route-optimization/interpret-response
- https://developers.google.com/maps/documentation/route-optimization/usage-and-billing
- https://developers.google.com/identity/protocols/oauth2/service-account
- https://developers.google.com/maps/billing-and-pricing/manage-costs


## Prueba gratuita con HeiGIT / VROOM · 21 de noviembre de 2026

**PROPUESTA EN EVALUACIÓN, NO CAMBIO DE DECISIÓN DE PROVEEDOR:** se implementa el adaptador compatible con el mismo `ordenPedidoIds` del PR #934 para comparar HeiGIT vs Google sin alterar la lista de Pedidos ni requerir mapa. El PO respondió «Ok» a la propuesta de **probar primero** la alternativa gratuita sin sustituir silenciosamente Google.

### Hechos comprobados en fuentes oficiales
- Endpoint vigente: `POST https://api.heigit.org/vroom/v0`; el antiguo `api.openrouteservice.org/optimization` quedó deprecado/retirado en 2026.
- VROOM requiere vehículos y `jobs`. Las coordenadas son **`[lng,lat]`**, no `[lat,lng]`. Al omitir `vehicles[].end`, termina en la última visita elegida.
- `routes[].steps` aporta tareas `type=job`, identificadas por su ID numérico. `unassigned` y `summary.unassigned` permiten detectar si faltó una visita.
- La API HeiGIT utiliza clave mediante header `Authorization`. El plan Standard permite uso comercial sujeto a sus términos, licencia de resultados y atribución a HeiGIT/OpenStreetMap. **La cuota exacta** y el tratamiento de datos deben verificarse en `https://account.heigit.org/info/plans` y en la cuenta concreta.
- La optimización se basa en tiempos de carretera sobre OpenStreetMap; **no ofrece promesa de tráfico en tiempo real ni perfil homologado para la motocarga de tres ruedas**.

Fuentes:
- https://playground.heigit.org/
- https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
- https://heigit.org/changes-in-the-openrouteservice-universe/
- https://ask.openrouteservice.org/t/free-plan-in-an-app-with-a-paid-tier-license-cc-by-sa-4-0-personal-data-and-attribution-questions/8079
- https://account.heigit.org/info/plans

### Contrato / seguridad
- `RECORRIDO_VIAL_PROVIDER=heigit` elige HeiGIT; `google` mantiene el adaptador original. No hay fallback automático entre proveedores. Si HeiGIT no responde o llega al límite, la app deja el modo de ruta indisponible, **nunca dispara una consulta facturable de Google por sorpresa**.
- En ambos casos, `POST /api/pedidos/recorrido-vial` conserva contratos de autorización, elegibilidad, identidad y pedidos completos. La respuesta sigue siendo `ordenPedidoIds[]` y `proveedor`.
- HeiGIT recibe solo coordenadas anónimas y **IDs numéricos efímeros** (`1..N`); la correspondencia con pedidos reales no sale del servidor. **Una coordenada puede seguir siendo dato personal según contexto**, por lo que revisar términos y privacidad antes de habilitar.
- Variables apagadas por defecto: `HEIGIT_VROOM_ENABLED=false`, `HEIGIT_VROOM_QUOTA_CONFIRMED=false`. Configurar `HEIGIT_VROOM_API_KEY` únicamente en secretos del servidor. La confirmación de cuota debe corresponder a límites externos verificados, no al simple booleano de la app.
- No se envían nombres, UUID, direcciones textuales, teléfonos ni pedidos con importes a HeiGIT; tampoco se solicita geometría, polilínea, navegación ni mapa.
- Sin temporizadores de reintento: 403/429/500 devuelven error de proveedor. La optimización nunca muta pagos, ventas, inventario ni embarques.

### Qué es prueba y qué falta
- **Pruebas agregadas al repositorio:** constructor de solicitud, orden por pasos, IDs repetidos/omitidos, `unassigned`, geometría ausente, cabecera API mockeada, bandera apagada y error por cuota. **No equivalen a ejecución aprobada**.
- **No se ha hecho llamada a HeiGIT real:** sin clave y registro de cuota no hay prueba vial medida. Los datos de ejemplo en tests son sintéticos, no clientes reales.
- **No se ha unido al botón Cercanía ni a las listas paginadas**: UI necesita su aprobación y QA.
- Para converger, realizar prueba piloto con puntos públicos/anonimizados verificando circulación real en Agustín Codazzi (sentidos, giros, cierres, acceso motocarga), comparar orden y tiempos frente a Google y recorrido operativo; no inventar una mejora porcentual sin datos.
- Resultado esperado en UI: una secuencia de visitas de reparto/cobro, sin mapa, igual bajo ambos proveedores.


## Decisión posterior del PO · #959 (21 nov 2026)

En el **modo Cercanía de Pedidos** solo aparecen visitas con **mercancía todavía por entregar**. Se excluyen pedidos con entrega completada aunque quede saldo fiado, las ventas de punto, cancelados/anulados y pedidos sin remanente físico. Las entregas parciales y regalos pendientes sí cuentan. Esta decisión reemplaza **solo para Cercanía** la inclusión de paradas de COBRO puro descrita arriba; no elimina el concepto de COBRO del clasificador genérico, ni modifica Cartera, fiados o pagos.

La UI filtra con remanentes por producto y preserva selección entre páginas, pero invalida seleccionados cuya entrega se completa cuando llega el estado actualizado. El POST de recorrido vial también exige unidades pendientes, con rechazo 409 ante una selección obsoleta, sin introducir datos/llamadas de proveedor. Otros contratos vigentes de GPS, disponibilidad, privacidad y optimización no cambian. Pruebas y CI documentados en PR vinculado a #959.
