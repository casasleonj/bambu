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
