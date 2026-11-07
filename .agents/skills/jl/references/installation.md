# Instalar o actualizar JL (solo ante petición explícita)

Esta referencia ayuda a un agente que **ya descubrió JL** a administrarlo. La primera instalación requiere que el agente lea `INSTALAR_CON_AGENTE.md` **del paquete recibido**: es imposible depender de una skill que aún no se ha descubierto.

## Ejecución autónoma responsable

1. Verificar que el usuario pidió instalar/actualizar JL; encontrar el **paquete real** (ZIP o directorio extraído), no inventar un enlace o una ruta. No obtener una variante aleatoria de Internet.
2. Identificar agente y alcance. Si no hay preferencia, instalar para el agente que ejecuta la solicitud, con `--scope user` por defecto. Instalar para varios agentes solo si se pidió.
3. Leer el manifiesto de `jl/SKILL.md` y `scripts/install_jl.py`; ejecutar `check_skill.py` y la previsualización del instalador.
4. Ejecutar el instalador desde el paquete extraído: `python3 jl/scripts/install_jl.py --agent AGENTE --scope user` y después con `--verify`. Para proyecto, añadir `--scope project --project RUTA_REAL`.
5. En actualización de un `jl` diferente, **no sobrescribir automáticamente**; explicar diferencias, obtener autorización y usar `--replace`. Se crea backup recuperable.
6. Confirmar físicamente `jl/SKILL.md`, catálogo y lectura en una sesión nueva. Detectar duplicados, symlinks antiguos, permisos y configuración restrictiva. No borrar otro skill sin autorización.
7. Informar resultado específico, evidencias y limitaciones. El instalador **no** garantiza activación automática, conexión de herramientas, permisos ni ejecución de evaluaciones conductuales.

## Ubicaciones documentadas

| Agente | Usuario | Proyecto |
|---|---|---|
| Codex | `~/.agents/skills/jl` | `.agents/skills/jl` |
| Claude Code | `~/.claude/skills/jl` | `.claude/skills/jl` |
| OpenCode | `~/.config/opencode/skills/jl` | `.opencode/skills/jl` |

El instalador permite `--agent all` usando `~/.agents/skills/jl` como ubicación compartida por Codex y OpenCode, y un enlace en la ruta Claude. Si la versión o el entorno no aceptan el enlace, **no afirmar éxito**; corregir la estrategia de forma verificable. La documentación del agente prevalece si las ubicaciones cambian.

**No incluir esta referencia en contexto cuando el issue trata de funcionalidades, bugs, código o QA, sin relación con instalación.**
