# Instrucciones locales · módulos DDD y dominios

**Ámbito:** `src/modules/`.

- Mantener la separación existente cuando corresponda: `domain` (entidades/servicios puros, sin Prisma), `application` (casos de uso), `infrastructure` (repositorios/efectos), `presentation` (adaptación a consumidores).
- No extender DDD a todo el repositorio sin evidencia ni refactorizar por oportunidad; reutilizar responsabilidades que ya existen y conservar contratos con consumidores legacy.
- Las decisiones de producto se recuperan de Planes Maestros y Contexto Maestro accesibles. El estado real, de `main` a SHA, determina cómo migrar sin inventar una regla comercial.
- Si cambia un contrato compartido entre dominios, aplicar JL XMOD/ESC/REUSE, identificar consumidores y probar conciliación, offline, históricos y autorizaciones.
- En dinero/inventario evitar resultados diferentes entre módulos por recálculo de una métrica que ya tiene fuente canónica.

Ver [arquitectura histórica](../../docs/agentes/fuente-original/01-arquitectura-tecnica.md) y [guía de contratos](../../docs/agentes/contratos-tecnicos.md).
