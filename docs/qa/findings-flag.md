# __PLAYWRIGHT_TEST__ flag — uso en código productivo

Componentes que bifurcan cuando el flag está seteado:
1. src/components/base-caja-modal.tsx:44 — saltar 3 fetches API (`/api/cierre/last`, `/api/config?clave=BASE_DIA_*`, `/api/config`) y confiar en localStorage.
2. src/components/connectivity-indicator.tsx:80 — deshabilitar polling 5s y sync 30s.

Implicancia:
- Tests que corren con `__PLAYWRIGHT_TEST__ = true` nunca prueban el camino real del modal base-caja.
- Tests nunca prueban el polling real del contador de cola offline.
- Tests nunca prueban el sync 30s del connectivity-indicator.

Estrategia QA:
- M2 specs: cubren el camino real sin flag (con `page.route` mock para velocidad).
- M10 specs: cubren polling real sin flag (waitForTimeout explícito, documentado).

NO eliminar el flag del código productivo en este ticket (puede romper flakiness en dev CI).
