### QA en navegador (fase 2a de #836: horario de atención por negocio)
- Estado: **PASÓ con un defecto de diseño móvil corregido durante el QA**. QA con personas y QA sobre la vista previa de Vercel: **NO EJECUTADOS**.
- Entorno: rama `ccr-4a43d6aa-x2rdhy` (sobre `845416c`, más el arreglo móvil de esta ronda). App local `next dev` en `localhost:3001`, `NEXT_PUBLIC_PEDIDOS_V2=true`, PostgreSQL 16 local, datos sintéticos. No es preview ni producción.
- Herramienta: `agent-browser 0.43.0`; complementa el spec `e2e/negocio-horario-836.spec.ts` (6/6 local, escritorio y móvil).
- Roles: ADMIN (navegador) y CONTADOR (login real; PUT a la API → 403).
- Recorridos:
  1. Ficha del negocio con horario: «Lun–Vie 06:00–12:00 y 14:00–20:00 / Sáb–Dom cerrado»; el negocio sin horario no muestra sección.
  2. Editor con un tramo que termina antes de empezar: error en vivo «Lunes: el tramo 14:00–13:00 termina antes de empezar…», «Actualizar» no guarda (10 filas intactas).
  3. Se corrige, se abre el domingo 08:00–12:00 y se guarda: en la base queda 0|08:00|12:00; tras recargar la ficha muestra «Dom 08:00–12:00».
  4. Pedidos: un pedido para sábado de un negocio que cierra ese día muestra «Negocio cerrado ese día» y sigue visible; el pedido del negocio sin horario no muestra aviso.
  5. «Cambiar fecha»: sábado → avisa «no atiende los sábados… confirma para continuar»; martes → sin aviso; confirmar con aviso funcionó y quedó el historial (21→24 nov).
  6. Móvil 390×844: sin desborde horizontal; ficha correcta.
- Defecto encontrado y corregido: en móvil el botón «＋ Tramo» se superponía a las horas y el campo «hasta» se cortaba. Se movió el botón junto a los tramos, el día pasa a su propia línea en pantallas pequeñas y los campos de hora son más anchos. Verificado de nuevo con captura.
- Observaciones: el campo de hora usa el selector nativo (AM/PM según el navegador). El botón «＋ Tramo» mide ~30 px de alto en móvil (cumple AA 24 px, no los 44 px recomendados).
- Hallazgo ajeno al cambio (existente en `main`): cuando el API devuelve un error con objeto `{message}` (p. ej. 409 «modificado por otro admin»), `negocio-form.tsx` lo pasa a `setFormError` como objeto y la pantalla falla con «Objects are not valid as a React child». Pendiente de registrar con `/hallazgo`.
- Límites de la herramienta: el aviso «Base de Caja» se cerró con «Ahora no»; los valores de hora se asignaron por eventos; los datos se sembraron por SQL (con `updatedAt` truncado a milisegundos, para no provocar un 409 artificial del bloqueo optimista).
- Evidencia: capturas locales en `/tmp/claude-0/-home-user-bambu/d7a56a5b-dc93-58d9-afe6-ba317c1274b9/scratchpad/qa/f2/`; no versionadas.
