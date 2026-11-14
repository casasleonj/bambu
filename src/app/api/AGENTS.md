# Instrucciones locales · APIs y mutaciones

**Ámbito:** archivos bajo `src/app/api/`. Se **suman** al `AGENTS.md` raíz; no autorizan cambios de producto ni sustituyen una decisión del PO. Contratos originales: AGENTS histórico líneas 110–166 y 214–236, contrastados con `main` actual.

- **Autorización:** autenticar y verificar roles/propiedad en el servidor para cada acceso y cambio sensible. Un control visual no protege el endpoint. Preservar la compatibilidad de códigos HTTP y contratos de error; no exponer datos personales ni secretos en logs.
- **Idempotencia:** antes de modificar creación, anulación, entrega o cobros, verificar la clave y ámbito idempotente de ese endpoint. Para pedidos, la clave `offlineId` está asociada al **borrador**, no a cada reintento. Evitar duplicar pago, pedido, embarque o producción si se recibe el mismo reintento.
- **Cobros/fiados:** si afecta `pagar-fiado`, entregas parciales o deudas, recuperar el contrato comercial aprobado, `docs/fiados/656-658-entrega.md`, `leerExigibles`, FIFO, fecha de entrega y restricciones del cobro de un pedido concreto. No sustituir deuda exigible por saldo comercial sin evidencia.
- **Offline y concurrencia:** 4xx/5xx representan errores de aplicación, no deben convertirse automáticamente en éxito offline; comprobar transacciones, locks/versiones, duplicados y operaciones posteriores.
- **Middleware/proxy:** verificar el comportamiento real de `src/proxy.ts`, excepciones cron/health/realtime y autenticación antes de limitar tasa. Una descripción histórica no reemplaza pruebas actuales.
- **Revisión transversal:** búsqueda/creación/entrega/pago/anulación → caja, dashboard, inventario, historial y exportaciones. Aplicar JL ESC/XMOD/REUSE, actualizar pruebas de API, integración y escenarios adversariales.

Leer únicamente cuando aplique la [guía técnica](../../../docs/agentes/contratos-tecnicos.md) y el [historial íntegro](../../../docs/agentes/fuente-original/01-arquitectura-tecnica.md). Si hay contradicción con Contexto Maestro/Plan Maestro, registrar brecha, no inventar política.
