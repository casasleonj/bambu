# Instrucciones locales · componentes, UX y accesibilidad

**Ámbito:** `src/components/`. Complementa `AGENTS.md` raíz.

- **Aprobación UI/UX del PO obligatoria antes de implementar cambios perceptibles:** maqueta **escritorio y móvil** con los estados aplicables de **confirmación, carga y error**; aprobación explícita independiente del backend y de la autorización de merge.
- Minimizar alteraciones visuales no necesarias. Reutilizar diseño/componentes existentes y comprobar coherencia de textos, botones, filtros, orden de operaciones y estados vacíos. No inventar reglas comerciales a partir de una pantalla.
- Todo valor compartido (saldo a favor, comisiones, fiados, stock) debe exhibir su significado correcto, misma fuente, periodo y filtros donde corresponda; no parchear discrepancias con cálculos particulares de cada pantalla.
- Considerar usuario real, rol, conectividad débil, zoom, teclado móvil, focus, solapamiento, feedback de offline, error/reintento y pantalla tras volver a abrir.
- Probar recorrido posterior: crear → consultar → modificar → cerrar/revertir → consultar histórico. La maqueta o el test de componente no sustituyen QA previo a producción cuando el efecto es visible.
- Para cambios en contacto, direcciones, pedido o pagos consultar contratos y decisiones actuales antes de modificar componentes compartidos.

Ver [protocolo y aprobación](../../docs/agentes/protocolo-investigacion.md) y [flujo de entrega](../../docs/agentes/flujo-entrega.md).
