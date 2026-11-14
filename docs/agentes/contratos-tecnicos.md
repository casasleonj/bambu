# Arquitectura y contratos técnicos · índice de consulta

## Qué hay aquí

La fuente original `AGENTS.md` documentó el stack, configuración, accesos, esquemas, patrones DDD, uso de PostgreSQL, sincronización offline, realtime, autenticación y geografía. Se preserva **literalmente** en [fuente-original/01-arquitectura-tecnica.md](fuente-original/01-arquitectura-tecnica.md), que recoge las líneas 17–347 del archivo antiguo. **Consultar solo las secciones relevantes para el issue.**

## Verificación antes de actuar

- La fuente técnica de verdad es `main` actual a un SHA y sus pruebas, no el snapshot.
- Para Next.js, validar la versión instalada y consultar `node_modules/next/dist/docs/` antes de usar APIs o suponer comportamiento conocido de versiones anteriores.
- El proyecto usa PostgreSQL/Prisma, no añadir SQLite por facilidad; comprobar esquema/migraciones y compatibilidad.
- Para offline/Serwist y cálculos monetarios, proteger idempotencia, reintentos, autorización, versiones, filtros, corte temporal y consumidores directos e indirectos.
- Antes de cambiar una función compartida, usar JL REUSE y XMOD; no equiparar dos totales con definición diferente.
- No utilizar credenciales demostrativas mencionadas en documentación como acceso legítimo; nunca publicar secretos reales.

Para contratos de dominio y excepciones extraídos del documento original consultar [contratos operativos](contratos-operativos.md), sin suponer que la nota histórica es el estado técnico de `main`.

## Índice rápido

- Configuración, toolchain y base de datos: fuente original inicio.
- Auth, proxy, rate limiting y Redis: sección «Critical Architecture Decisions».
- Offline y deduplicación: «Offline-First Architecture».
- Esquema relacional 1FN: «1FN Normalization».
- Next/SSR y Service Worker: «Service Worker», «App Router», «Server Components».
- DDD y contratos compartidos: «DDD Module Structure».
- Consumidor final y geografía: «Cliente canónico», «Coordenadas efectivas».
- SSE: «Realtime Updates».
- [Clasificación residual de 64 pasajes](auditoria-2026-11/REVISION_CONTEXTO_RESIDUAL.md): comandos históricos no ejecutables, tablas de módulos y tipos SSE; verificar consumidores contra main y no asumir publicación real.
- Histórico de producción y comportamiento por fecha: [historial-y-trazabilidad.md](historial-y-trazabilidad.md).

**Si la implementación y una nota antigua divergen, registrar BRECHA PLAN ↔ CÓDIGO o nota técnica obsoleta, según la autoridad de producto. No ajustar contratos de producto solo porque el código sea diferente.**
