#!/usr/bin/env python3
"""Verifica que cada PR declare quién investigó, implementó y auditó.

El reparto de `docs/agentes/reparto-fases-y-modelos.md` §2 se cumplía a mano, y
por eso se incumplía: en #809 el mismo agente implementó, auditó y hizo el QA de
navegador. Este check convierte la regla en algo comprobable sobre el PR.

Reglas que aplica (todas de §2 y §3 del reparto):

1. **Toda fase declara autoría.** Sin `quién + modelo + artefacto` no hay fase.
2. **El revisor nunca es el implementador.** Compara el campo `agente` y la
   `familia` del modelo. Misma familia también invalida la auditoría. **Límite
   honesto:** la evidencia publicada respalda esto como precaución, no como
   garantía. *Self-Preference Bias in LLM-as-a-Judge* (arXiv:2410.21819) encuentra
   preferencia por respuestas de menor perplejidad incluso cuando vienen de otros
   modelos, y *Correlated Errors in LLMs* (ICML 2025) halla errores correlacionados
   entre proveedores distintos. Cambiar de familia reduce un sesgo conocido; no
   acredita independencia real.
3. **El QA de navegación lo hace un agente distinto del implementador**, y
   declara la herramienta real (`agent-browser`/`playwright`), no una promesa.
4. **La investigación es research, no lectura de código.** Una fase de
   investigación debe citar fuentes externas (URLs) o declarar explícitamente
   que fue solo reconocimiento interno.

Se lee de un bloque en el cuerpo del PR:

    <!-- cadena-agentes
    investigacion:
      agente: codex
      modelo: gpt-6.1-sol
      artefacto: docs/agentes/plan-778.md
      fuentes_externas: 3
    implementacion:
      agente: opencode
      modelo: glm-5.3-flash
      familia: glm
      artefacto: 9ec09a5c
    auditoria:
      agente: claude
      modelo: claude-sonnet-5-5
      familia: anthropic
      artefacto: /tmp/auditoria2.log
    qa_navegador:
      agente: claude
      modelo: claude-sonnet-5-5
      herramienta: agent-browser
      artefacto: /tmp/qa-claude-20-repartidor.png
    -->

Salida: exit 0 si la cadena es coherente; exit 1 con los motivos concretos.

Estado actual del repo (honesto): este check se ejecuta en modo `--aviso` desde
CI porque ningún PR anterior declara el bloque. Endurecerlo a bloqueante requiere
rellenar la declaración en los PRs abiertos.
"""
import argparse
import json
import re
import sys
from pathlib import Path

BLOQUE = re.compile(r"<!--\s*cadena-agentes(.*?)-->", re.S | re.I)
FASES_OBLIGATORIAS = ("implementacion", "auditoria")
FASES_OPCIONALES = ("investigacion", "qa_navegador")
CAMPOS = ("agente", "modelo", "artefacto")


def parsear_bloque(texto):
    """Convierte el bloque YAML-ligero en dict sin exigir PyYAML.

    Se acepta un subconjunto deliberadamente pequeño: `clave:` y `clave: valor`.
    Un parser real añadiría una dependencia al job barato, que debe correr sin
    instalar nada (misma razón que el clasificador de #778).
    """
    m = BLOQUE.search(texto or "")
    if not m:
        return None
    cuerpo = m.group(1)
    fases = {}
    actual = None
    for linea in cuerpo.splitlines():
        if not linea.strip() or linea.strip().startswith("#"):
            continue
        sangrada = linea[:1].isspace()
        clave, _, valor = linea.strip().partition(":")
        clave = clave.strip().lower()
        valor = valor.strip().strip("\"'")
        if not sangrada:
            actual = clave
            fases[actual] = {}
        elif actual:
            fases[actual][clave] = valor
    return fases


def familia_de(modelo):
    """Familia del modelo, para aplicar la regla del revisor."""
    if not modelo:
        return ""
    m = modelo.lower()
    for fam, llaves in (
        ("anthropic", ("claude", "sonnet", "opus", "haiku")),
        ("openai", ("gpt", "codex", "o3", "o4")),
        ("deepseek", ("deepseek",)),
        ("glm", ("glm", "zhipu")),
        ("kimi", ("kimi", "moonshot")),
        ("mimo", ("mimo", "xiaomi")),
        ("google", ("gemini", "gemma")),
    ):
        if any(k in m for k in llaves):
            return fam
    return m


def evaluar(texto_pr):
    """Devuelve (errores, avisos, fases).

    Alcance real, para no vender más de lo que hace: esto valida **coherencia del
    formato y de las identidades declaradas**, no que la revisión haya ocurrido ni
    que la identidad sea cierta. La atribución de un asistente es configurable y
    puede omitirse, así que cualquier bloque aquí es una declaración de quien
    escribe el PR. La evidencia externa (auditorías, capturas) es lo que sostiene
    la afirmación; el bloque sólo la hace auditable.
    """
    errores, avisos = [], []
    fases = parsear_bloque(texto_pr)
    if fases is None:
        return (
            ["no hay bloque <!-- cadena-agentes --> en el cuerpo del PR"],
            [
                "Sin bloque no se puede verificar el reparto. Copiarlo de "
                "docs/agentes/plantilla-cadena-agentes.md"
            ],
            {},
        )

    for fase in FASES_OBLIGATORIAS:
        if fase not in fases:
            errores.append(f"falta la fase obligatoria '{fase}'")
            continue
        for campo in CAMPOS:
            if not fases[fase].get(campo):
                errores.append(f"{fase}: falta '{campo}'")

    for fase in FASES_OPCIONALES:
        if fase in fases:
            for campo in CAMPOS:
                if not fases[fase].get(campo):
                    errores.append(f"{fase}: falta '{campo}'")

    # Regla 2: el revisor no es el implementador.
    impl = fases.get("implementacion", {})
    agente_impl = (impl.get("agente") or "").lower()
    fam_impl = (impl.get("familia") or familia_de(impl.get("modelo"))).lower()

    for fase in ("auditoria", "qa_navegador"):
        otro = fases.get(fase)
        if not otro:
            continue
        agente_otro = (otro.get("agente") or "").lower()
        fam_otro = (otro.get("familia") or familia_de(otro.get("modelo"))).lower()
        if agente_impl and agente_otro == agente_impl:
            errores.append(
                f"{fase}: lo ejecuta '{agente_otro}', el mismo agente que implementó. "
                "El revisor nunca es el implementador."
            )
        if fam_impl and fam_otro and fam_impl == fam_otro:
            errores.append(
                f"{fase}: familia de modelo '{fam_otro}' igual a la del implementador. "
                "Misma familia tampoco vale como revisión independiente."
            )

    # Regla 3: el QA de navegación declara herramienta real.
    qa = fases.get("qa_navegador")
    if qa:
        herr = (qa.get("herramienta") or "").lower()
        if herr not in ("agent-browser", "playwright", "playwright-mcp", "obscura"):
            errores.append(
                "qa_navegador: 'herramienta' debe ser agent-browser, playwright, "
                "playwright-mcp u obscura; una promesa no es evidencia"
            )
        if not re.search(r"\.(png|jpg|jsonl|log|txt|md)$", qa.get("artefacto") or "", re.I):
            avisos.append(
                "qa_navegador: el artefacto no parece una captura/log concreto; "
                "sin ruta verificable el QA es un autoinforme"
            )

    # Regla 4: investigación = research con fuentes, no solo reconocimiento.
    inv = fases.get("investigacion")
    if inv:
        try:
            fuentes = int(inv.get("fuentes_externas") or 0)
        except ValueError:
            fuentes = 0
        solo_interno = (inv.get("alcance") or "").lower() == "solo-interno"
        if fuentes == 0 and not solo_interno:
            errores.append(
                "investigacion: declara 0 fuentes externas y no marca "
                "'alcance: solo-interno'. Investigar es research, no solo leer el repo."
            )
    else:
        avisos.append(
            "no hay fase 'investigacion': si el trabajo necesitó research, falta."
        )

    return errores, avisos, fases


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--repo", type=Path, default=Path("."))
    p.add_argument("--cuerpo", type=Path, help="Archivo con el cuerpo del PR")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if args.cuerpo:
        texto = args.cuerpo.read_text(encoding="utf-8", errors="replace")
    else:
        texto = sys.stdin.read()

    errores, avisos, fases = evaluar(texto)
    if args.json:
        print(json.dumps({"ok": not errores, "errores": errores, "avisos": avisos,
                          "fases": fases}, ensure_ascii=False))
    else:
        for e in errores:
            print(f"ERROR  {e}")
        for a in avisos:
            print(f"AVISO  {a}")
        print("CADENA OK" if not errores else f"CADENA INCOMPLETA ({len(errores)} errores)")
    return 0 if not errores else 1


if __name__ == "__main__":
    sys.exit(main())
