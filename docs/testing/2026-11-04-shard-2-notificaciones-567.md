# Shard 2: preparación determinista del aviso de notificaciones

Refs #567, #349. Autorización: PO, «Corrige y Soluciona el shard 2» (2026-11-04).
Alcance: pruebas; la interfaz y sus decisiones de producto no cambian.

## Evidencia y autoridad

- Estado técnico de partida: `main` `b5afead2b5a74bc45448ef7a7e73725f1a53a1b6`.
- [CI de partida, run 41873316269](https://github.com/casasleonj/bambu/actions/runs/41873316269): shard 2 con cinco fallos de `opt-in-toast.spec.ts`, 233 pasadas y 24 omitidas. Rutas falla por separado en escritorio y móvil (shards 4 y 8).
- Contrato actual: `src/hooks/use-push-opt-in.ts` muestra el aviso únicamente con permiso `default`, rol autorizado y dispositivo compatible. «Más tarde» dura esta sesión; «Cerrar» guarda el descarte permanente.
- Playwright 1.59.1, Chromium headless shell 147.0.7727.15/v1217: una página localhost en contexto seguro devuelve `Notification.permission = denied`; en ese shell, conceder o limpiar permisos no produce `default`.
- Reproducción local sobre build de producción: al preparar `default`, un clic real de «Más tarde» encuentra el aviso, pero el overlay **Base de Caja** intercepta los eventos. El aviso expira a los 8 s y el clic agota su tiempo. El snapshot contiene `#base-dia-input`, «Base de Caja» y «Ahora no».
- #595 y su rama visual son trabajo separado. Este cambio no aprueba ni integra ese diseño. #567 mantiene el pendiente de Rutas.

## Investigación y solución mínima

1. **Permiso implícito:** contrastar CI, contrato y [navegadores Playwright](https://playwright.dev/docs/browsers#chromium-headless-shell). Cambiar el navegador global afecta toda la suite; conceder permisos no representa una decisión pendiente; omitir las pruebas elimina cobertura. Reutilizar la simulación explícita ya existente en `permission-flow.spec.ts` conserva el escenario correcto.
2. **Aviso visible, clic bloqueado:** contrastar el trace local con [actionability](https://playwright.dev/docs/actionability) y `base-caja-modal.tsx`. No forzar clics ni aumentar esperas: preparar la base con `skipBaseCaja(page)` antes de navegar, igual que otros specs. La cobertura del modal permanece en `admin-base-caja.spec.ts`.
3. **Casos adversariales:** comprobar `default`, `denied`, `granted`, iOS sin standalone, recarga y diferencias entre almacenamiento de sesión y permanente. Las aserciones de ausencia requieren una comprobación positiva del estado montado, evitando pasar antes de hidratar.

Se extrae el helper a `e2e/notificaciones/browser-permissions.ts`; ambos specs lo consumen. No modifica suscripciones, entrega push ni permisos reales. [Playwright documenta](https://playwright.dev/docs/mock-browser-apis) la preparación de APIs antes de cargar scripts. Se conserva el login real y el aislamiento por contexto. No cambia configuración global, dependencias ni código de aplicación.

## Criterios de aceptación y entrega

- Los cinco escenarios originales pasan con clics normales, sin nuevos skips, sleeps ni reintentos.
- Permisos concedidos/bloqueados no muestran el aviso; iOS sin standalone tampoco lo muestra con permiso pendiente.
- «Más tarde» conserva solo el descarte de sesión; «Cerrar» conserva el permanente.
- Tipos, lint, unit y E2E focalizados verdes. CI ejecuta el shard 2 completo; comparar todos los fallos finales con el baseline antes del merge.
- Una rama/PR desde `main`; integración y comprobación posterior conforme a `AGENTS.md`. No cerrar #567 mientras quede su alcance de Rutas.

## Resultados

- Build de producción local correcto; flags del Hub V2 apagados, como en el shard general de CI.
- E2E focalizados contra Chromium headless shell v1217, sin reintentos: **17 pasadas, 5 omisiones preexistentes de los casos positivos en iOS sin standalone** (34,4 s). El caso negativo iOS con permiso pendiente se ejecuta en `permission-flow.spec.ts`.
- Los cinco casos positivos repetidos tres veces en escritorio: **15 pasadas**, sin reintentos (28,7 s).
- `--list --shard=2/8`: **262 pruebas / 38 archivos**, sin cambios de cantidad ni de configuración global.
- Tipos y lint completos: correctos. Unit: **4.570 pasadas / 466 archivos** (296,08 s).
- Entorno local: Node 24.19.0; CI utiliza Node 22. Pendiente el CI en su entorno antes del merge.
- No considerar esta fase integrada sin enlazar el PR y las ejecuciones verificadas.

## Reconciliación del 2026-11-05

- [PR #643](https://github.com/casasleonj/bambu/pull/643), primer CI [41879362201](https://github.com/casasleonj/bambu/actions/runs/41879362201): shard 2 **238 pasadas**, sin fallos ni intermitencias; tipos, lint, 4.570 unitarias y 885 de integración correctas. Solo quedaron los dos fallos finales de Rutas del baseline. Se deben comparar también las intermitencias de la ejecución posterior.
- La ejecución local ampliada de ayer se interrumpió al reiniciar el entorno, en la prueba 155/262, sin fallos registrados hasta allí. No se presenta como ejecución completa aprobada.
- `main` avanzó a `470be7fffb17d9b389bfa164f4881aae985b60c4`. La rama se reconcilió sin conflictos; su diferencia sigue limitada a estos cuatro archivos de pruebas/documentación. Se repiten los controles tras actualizar el esquema **solo en la base local de pruebas**.
- Nueva referencia para comparar CI: [42105167325](https://github.com/casasleonj/bambu/actions/runs/42105167325), sobre ese `main`. Validación posterior al rebase pendiente antes de integrar.

## Reconciliación del 2026-11-06

- `main` volvió a avanzar: base `707952acd5d4775eeb55f66683a3f2b37b6c4915`. Segundo rebase sin conflictos; se mantienen los mismos cuatro archivos del alcance.
- Baseline completo de esa base: [42141750933](https://github.com/casasleonj/bambu/actions/runs/42141750933), siete fallos finales (cinco del aviso y dos de Rutas). La ejecución verde posterior `42145274722` es del Hub programado y omite la matriz general; no sustituye ese baseline.
- Build, tipos y lint de los archivos tocados: correctos. E2E focalizados después de restablecer el seed local: **17 pasadas / 5 omisiones preexistentes**, sin reintentos (32,4 s). Un primer intento local encontró la base vacía tras la interrupción; se detuvo y se restauró el seed, sin modificar la autenticación para ocultarlo.
- Unit completo posterior al rebase: **4.739 pasadas / 484 archivos** (318,10 s). La base sigue en `707952ac`, sin nuevos cambios al terminar los controles. Pendiente únicamente el nuevo CI del PR y su comprobación después del merge.
