---
name: qa-navegador
description: "QA de usuario en navegador real (agent-browser) antes de producción. Úsalo tras implementar un issue: recorre la app como persona, en PC y móvil, y reporta PASÓ/FALLÓ con evidencia."
metadata:
  display_name: "QA en navegador"
  version: "1.0.0"
---

# QA en navegador · recorrido real antes de producción

Extiende `jl/references/verification-release.md` (paso 3, QA preproducción) y
`jl/references/browser-tools.md` con un procedimiento ejecutable y repetible.
No sustituye la suite Playwright: la **complementa**. Un spec verde no prueba que
una persona pueda completar la tarea, y un recorrido manual no acredita aserciones.

## Cuándo se activa, sin ambigüedad

- Tras implementar un issue o una corrección que toca interfaz, interacción o
  flujo de usuario: **antes** de pedir merge.
- Antes de cualquier acción que despliegue a producción (merge a `main` despliega
  en Vercel de inmediato).
- `NO APLICA` solo si el cambio no tiene efecto observable: documentación, deuda
  interna o backend puro. En ese caso, decirlo explícitamente y no emitir avisos
  de inicio/cierre de navegador.

Si el cambio toca finanzas, cierres, pedidos, fiados o permisos, el recorrido es
**obligatorio** aunque el diff parezca pequeño: son los módulos donde un cambio
local rompe un cálculo transversal.

## Preflight (obligatorio, antes de abrir el navegador)

1. **Entorno autorizado.** Orden de preferencia:
   - local con datos sintéticos (`npm run dev` en `localhost:3001`, Postgres de
     `docker-compose.yml` en `127.0.0.1:5433`);
   - preview de Vercel del PR, si existe y tiene base de pruebas;
   - producción **solo lectura**, y solo si no hay alternativa: no guardar, no
     pagar, no entregar, no cerrar caja, no generar procesos.
2. **Herramienta realmente disponible.** `command -v agent-browser` +
   `agent-browser --version` y una navegación de prueba. Si arranca pero no
   navega, está **no operativa**: decirlo, no fingir el recorrido.
3. **Rol y credenciales de prueba.** Usuarios del seed local:
   `admin/admin123`, `asistente/asist123`, `sellador/sell123`,
   `repartidor/rep123`, `contador/cont123`. En un entorno real, usar solo cuentas
   de prueba autorizadas; nunca las del PO.
4. **Alcance narrado.** Enumerar los recorridos (N) por función y rol antes de
   empezar. Si solo se planificó, no informar que ya inició la prueba.

## Recorrido mínimo por issue

Para cada issue implementado, cubrir la tarea completa de una persona, no solo la
pantalla del cambio:

1. Entrar por la ruta real (login con el rol del caso, no atajo por API).
2. Ejecutar la acción que el issue describe.
3. Verificar el efecto **en la pantalla siguiente**: que la operación posterior
   use realmente lo que se guardó.
4. Recargar y comprobar persistencia.
5. Probar el camino adversarial relevante: cancelar, volver atrás, filtro
   cambiado, rol sin permiso, dato vacío.
6. Repetir en `chromium` (escritorio) y en viewport móvil (~390×844) cuando el
   cambio afecte layout, overlays o botones.

## Comandos (agent-browser, flujo abrir → snapshot → actuar → re-observar)

```sh
agent-browser open http://localhost:3001/login
agent-browser snapshot -i          # refs reales @eN; nunca inventarlos
agent-browser click @e3            # tras cada acción, volver a snapshot
agent-browser screenshot qa-<issue>-<paso>.png
agent-browser close
```

Reglas de uso:

- Releer el snapshot después de cada cambio de estado: los `@eN` caducan.
- Texto visible se comprueba en el snapshot; lo visual (clipping, solapamiento,
  contraste, responsive) **solo** con `screenshot` + inspección de la imagen.
- No reutilizar una sesión con datos operativos como sandbox.
- No publicar capturas sin revisarlas antes: pueden contener nombres de clientes,
  teléfonos, direcciones o importes reales.

## Entrega al PO antes del merge: link + qué mirar

El QA del agente no es la aprobación. Antes de pedir el merge hay que entregar al
PO un **link navegable** donde esté la solución completa, y decirle en lenguaje
llano qué buscar. Sin eso, el PO no puede aprobar: no sabe qué mirar.

Formato del mensaje de entrega (breve, sin jerga):

```
🔗 Pruébalo aquí: <URL del preview del PR>

Qué cambió
- <en qué pantalla> ahora <qué hace distinto> (antes: <qué pasaba>)

Qué se arregló
- <el error que ya no ocurre, en palabras de quien usa la app>

Qué se agregó
- <cosa nueva y dónde está>

Qué NO cambió
- <lo que se preserva, para que no lo busque o tema que se perdió>

Cómo comprobarlo en 1 minuto
1. Entra con <rol>.
2. <acción concreta>.
3. Deberías ver <resultado observable>.
```

Reglas:

- **El link debe abrirse desde cualquier navegador, no solo en el equipo del PO.**
  Se usa el preview público de Vercel del PR (`https://<proyecto>-git-<rama>-<hash>-<scope>.vercel.app`),
  no `localhost` ni una IP de la LAN. Si Vercel tiene deployment protection activa
  y el PO no puede entrar sin login de Vercel, decirlo explícitamente y dar la
  alternativa (añadirlo como viewer, o un túnel). No inventar una URL: si no
  existe preview, el estado es `NO EJECUTADO` y no hay aprobación posible.
- Nada de nombres de archivo, tablas, endpoints ni hashes. Si el PO pide detalle
  técnico, entonces sí.
- Un ejemplo cotidiano con números o nombres reconocibles del negocio (pedido,
  fiado, cierre) vale más que tres párrafos de explicación.
- Nunca decir «ya funciona» si el estado del QA es `FALLÓ` o `NO EJECUTADO`.
- El link se acompaña del estado real del QA, no lo sustituye.

## Salida obligatoria (bloque por issue)

```md
### QA en navegador
- Estado: PASÓ | FALLÓ | NO EJECUTADO | NO APLICA
- Build/SHA y entorno: ...
- Herramienta: agent-browser <versión> | Playwright <proyecto>
- Rol y datos: ...
- Viewports: escritorio + móvil (o el afectado)
- Recorridos: j/N
- Pasos: 1. ... 2. ...
- Esperado / Observado: ...
- Incidencia: ... (issue nuevo con /hallazgo si es defecto distinto)
- Evidencia: capturas sanitizadas o descripción; decir si no hay
```

`FALLÓ` bloquea el merge. Un defecto encontrado se registra como issue con
`/hallazgo` antes de seguir, y se vuelve al ciclo de corrección; no se arregla
"de paso" dentro del mismo PR sin issue que lo respalde.

## Avisos en el chat

- Inicio: `🧭 QA EN NAVEGADOR INICIADO: agent-browser vX, <entorno>, rol, 3 recorridos`.
- Progreso: solo en hitos o cambios materiales, no por clic.
- Cierre: `✅ ... FINALIZADO: 3/3, 0 fallos` o `⚠️ ... CON FALLOS: 2/3, bloqueo <defecto>`.
- Nunca decir «probado como usuario» si no se abrió el navegador; y nunca llamar
  «persona real» a un recorrido de agente.
