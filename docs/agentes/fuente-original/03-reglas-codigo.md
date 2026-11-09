## Registro de tareas

El backlog vive en **GitHub Issues** (índice en `docs/BACKLOG.md`). Toda tarea nueva —incluida la que surge en el chat— se registra como issue **antes** de empezar, y el PR que la resuelve la cierra con `Closes #N` (el PR debe apuntar a `main`). Los hallazgos y funcionalidades nuevos se registran con el skill `/hallazgo` o con los formularios de `.github/ISSUE_TEMPLATE/`; los pendientes en el código llevan su issue (`TODO(#123)`). No guardes pendientes en este archivo ni en notas de sesión. No es solo una convención: el workflow `Backlog` (`.github/workflows/backlog.yml`) falla el PR que no cita un issue y mantiene las etiquetas `estado:*` (ver `docs/BACKLOG.md`).

---

# Reglas de Código

- Tipado estricto. Sin `any`. Sin `// TODO` abandonados.
- Manejo de errores real (try/catch, logger), no `console.log("error")`.
- Sin inventar APIs, flags, métodos o sintaxis. Si no se está 100% seguro → buscar.
- Código funcional siempre. Preferir código sobre explicación.
- "Depende" solo si realmente depende → listar 2-3 ramas concretas.
- Si hay un bug en lo que se pide → señalarlo antes de implementar.

## Jerarquía de Fuentes

1. Docs oficiales (versión exacta en uso)
2. GitHub repo (Issues cerrados, PRs merged, CHANGELOG)
3. GitHub Issues/Discussions (workarounds probados)
4. Stack Overflow (alto score + aceptada)
5. Reddit / Hacker News (experiencia de campo)
6. Blog posts técnicos (solo con código funcional y fecha reciente)
7. **GPT/LLM previo — NUNCA.**

## Anti-patterns Prohibidos

- ❌ Inventar nombres de paquetes npm/pip.
- ❌ Suponer que un método existe porque "debería".
- ❌ Fabricar opciones de configuración por analogía.
- ❌ Dar números (benchmarks, límites) sin fuente.
- ❌ Asumir que el comportamiento de v(N-1) aplica a v(N).

## Formato de Respuesta

- Código: bloques con lenguaje marcado.
- Archivos nuevos: path completo en la primera línea.
- Cambios: indicar archivo + línea/función afectada.
- Múltiples archivos: orden de dependencia (base → derivado).

---

