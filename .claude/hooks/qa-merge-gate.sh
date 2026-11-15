#!/usr/bin/env bash
# PreToolUse hook — bloquea `gh pr merge` sin evidencia de QA en navegador.
#
# Contrato de Claude Code: recibe el evento por stdin (JSON), y para bloquear la
# herramienta basta con salir con código 2 y escribir el motivo en stderr.
#
# La evidencia vive en `.qa/pr-<N>.md` dentro de la rama del PR y debe contener
# un estado distinto de NO EJECUTADO:
#   - Estado: PASÓ
#   - Estado: NO APLICA   (con el motivo técnico)
#
# Escape explícito y auditable: `QA_GATE=off` en el entorno del comando, o
# `--no-qa-gate` en el merge. Ambos quedan visibles en el historial del shell;
# no hay bypass silencioso.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    print(""); raise SystemExit
ti = d.get("tool_input") or {}
print(ti.get("command") or "")' 2>/dev/null)

# Sin comando no hay nada que bloquear: dejar pasar.
[ -n "${cmd:-}" ] || exit 0

# Solo interesa el merge de PRs.
printf '%s' "$cmd" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge' || exit 0

if [ "${QA_GATE:-}" = "off" ] || printf '%s' "$cmd" | grep -q -- '--no-qa-gate'; then
  printf 'QA gate omitido explícitamente (QA_GATE=off / --no-qa-gate).\n' >&2
  exit 0
fi

repo=$(git rev-parse --show-toplevel 2>/dev/null) || {
  printf 'QA gate: no hay repositorio git; merge bloqueado. Usa --no-qa-gate si es intencional.\n' >&2
  exit 2
}
cd "$repo" || exit 2

num=$(printf '%s' "$cmd" | grep -oE 'merge[[:space:]]+([0-9]+|#[0-9]+)' | grep -oE '[0-9]+' | head -1)
[ -n "${num:-}" ] || {
  printf 'QA gate: no pude determinar el número de PR en: %s\n' "$cmd" >&2
  printf 'Indica el PR (`gh pr merge <N>`) o usa --no-qa-gate de forma explícita.\n' >&2
  exit 2
}

ev=".qa/pr-$num.md"
if [ ! -f "$ev" ]; then
  printf 'QA gate: falta la evidencia %s.\n' "$ev" >&2
  printf 'Ejecuta /qa (skill qa-navegador) y guarda el bloque ### QA en navegador en ese archivo.\n' >&2
  printf 'Bypass consciente: QA_GATE=off gh pr merge ... (queda en el historial).\n' >&2
  exit 2
fi

estado=$(grep -E '^[[:space:]]*-?[[:space:]]*Estado:' "$ev" | head -1 | sed -E 's/.*Estado:[[:space:]]*//; s/[[:space:]]+$//; s/[[:space:]]*\(.*$//; s/[[:space:]]*[—–-].*$//' | tr -d '\r')

case "$(printf '%s' "${estado:-}" | tr '[:lower:]' '[:upper:]' | tr -s ' ')" in
  "PASÓ"|"PASO"|"NO APLICA")
    exit 0
    ;;
  "FALLÓ"|"FALLO")
    printf 'QA gate: la evidencia %s reporta FALLÓ. Corrige y repite el QA.\n' "$ev" >&2
    exit 2
    ;;
  *)
    printf 'QA gate: %s tiene estado "%s", que no permite merge.\n' "$ev" "${estado:-vacío}" >&2
    printf 'Estados válidos para mergear: PASÓ, NO APLICA. Usa QA_GATE=off si es intencional.\n' >&2
    exit 2
    ;;
esac
