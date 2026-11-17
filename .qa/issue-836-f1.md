### QA en navegador
> Aún no hay PR de #836. Renombrar a `pr-<N>.md` al abrirlo. Capturas por ruta local, no versionadas.

- Estado: PASÓ (agente en navegador, entorno local) · **QA con personas y QA posdespliegue: PENDIENTES**
- Build/SHA y entorno: rama `ccr-4a43d6aa-x2rdhy` sobre `main` @ 84ef4c5; `next dev` local en `localhost:3001` con `NEXT_PUBLIC_PEDIDOS_V2=true`, PostgreSQL 16 local en `5433`, datos sintéticos. No es preview de Vercel ni producción.
- Herramienta: Playwright (Chromium preinstalado del contenedor) con un script de recorrido propio, más el spec `e2e/pedidos-compromiso-836.spec.ts`.
- Rol y datos: ADMIN real (login por formulario). Pedidos sintéticos: creado hace 3 días para hoy, previsto ayer abierto, futuro, entregado y anulado.
- Viewports: escritorio 1280×900 y móvil 390×844 (touch).
- Recorridos: script 14/14 · spec E2E 10/10 (5 casos × `chromium` y `chromium-mobile`).
- Pasos:
  1. Login → `/pedidos?foco=paraHoy`: 3 filas, cada una con «Para hoy» o «Arrastrado · previsto …»; ningún futuro.
  2. `/pedidos?foco=programados`: 2 filas, todas «Programado · …».
  3. Abrir un arrastrado → «📅 Cambiar fecha prometida…» → avisa «Estaba vencido… queda en el historial» sin bloquear.
  4. Confirmar sin fecha → pide la fecha. Con fecha y motivo → guarda; recarga: sale de «Para hoy» y entra a «Programados».
  5. Adversarial: otra persona cambia la fecha mientras el diálogo está abierto → «Otra persona cambió la fecha…», botón «Ver fecha actual», sin historial nuevo.
  6. Pedido entregado → no aparece el botón.
  7. Móvil: sin desbordamiento horizontal; diálogo usable.
- Esperado / Observado: coincide con la maqueta aprobada (pantallas 1 y 3). Creación y entrega física del pedido intactas tras reprogramar (comprobado en BD).
- Incidencia: ninguna del producto. Hallazgos de entorno: (a) el Hub solo existe con `NEXT_PUBLIC_PEDIDOS_V2=true`; sin la variable la pantalla es la tabla clásica y esta función no aparece. (b) El diálogo «Base de Caja» del inicio de día tapa la pantalla en una base nueva; es ajeno a este cambio.
- Evidencia: capturas locales en `/tmp/claude-0/-home-user-bambu/d7a56a5b-dc93-58d9-afe6-ba317c1274b9/scratchpad/qa/` (`01`–`06`), con datos sintéticos.
- Fuera de este QA: **maquetas F1 «tabs con contadores» y F3 (barrio) no implementadas**; la maqueta 3 «entrega antes de la hora» pertenece a la fase 2.

### Regresión y línea base (entorno local, `main` @ 84ef4c5)
- E2E existentes en la misma pantalla: #841, #797 y #763 → 40 de 44 pasan en total con Embarques; los 4 que fallan son `embarques-nuevo.spec.ts` «flujo normal» y «crear con 0 pedidos», en `chromium` y `chromium-mobile`.
- Esos 4 **fallan igual** con el `filtrar-pedidos.ts` original de `main` (misma firma: `wizard-resultado` no aparece al crear el embarque) → no son regresión de #836. Causa no investigada; este entorno es una base creada con `db push`, no con las migraciones. **Falta confirmarlo contra CI de `main`.**
- Sí pasa «pedido futuro: oculto por defecto, visible con el toggle», que ejercita la regla `clasificarCompromiso` ya usada por Embarques.
- Integración: 12 pruebas fallan igual en `main` y en la rama (`pedidos-consulta-516` ×2, `pedido-origen-canal-independientes` ×5, `embarque-asignar-pedidos-offlineid` ×5) por la falta de `pedido_numero_seq` en la base local.
