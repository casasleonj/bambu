"""Pruebas del verificador de cadena de agentes.

Cada prueba cubre una regla del reparto que se incumplió de verdad en #809:
el mismo agente investigó, implementó, auditó y hizo el QA de navegador.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from check_cadena_agentes import evaluar, familia_de  # noqa: E402

BUENO = """
<!-- cadena-agentes
investigacion:
  agente: codex
  modelo: gpt-6.1-sol
  artefacto: docs/agentes/plan-778.md
  fuentes_externas: 4
implementacion:
  agente: opencode
  modelo: glm-5.3-flash
  familia: glm
  artefacto: 9ec09a5c
auditoria:
  agente: claude
  modelo: claude-sonnet-5-5
  familia: anthropic
  artefacto: /tmp/claude-audit2.log
qa_navegador:
  agente: claude
  modelo: claude-sonnet-5-5
  herramienta: agent-browser
  artefacto: /tmp/qa-claude-20-repartidor.png
-->
"""


def test_cadena_correcta_pasa():
    errores, _, _ = evaluar(BUENO)
    assert errores == []


def test_sin_bloque_falla():
    errores, _, _ = evaluar("Un PR sin declaración de cadena.")
    assert any("cadena-agentes" in e for e in errores)


def test_el_mismo_agente_auditando_falla():
    malo = BUENO.replace("agente: claude\n  modelo: claude-sonnet-5-5\n  familia: anthropic",
                         "agente: opencode\n  modelo: glm-5.3-flash\n  familia: glm")
    errores, _, _ = evaluar(malo)
    assert any("mismo agente" in e for e in errores)
    assert any("familia" in e for e in errores)


def test_misma_familia_aunque_distinto_agente_falla():
    malo = BUENO.replace("familia: anthropic", "familia: glm")
    errores, _, _ = evaluar(malo)
    assert any("familia" in e for e in errores)


def test_falta_fase_obligatoria():
    malo = BUENO.replace("auditoria:", "revision:")
    errores, _, _ = evaluar(malo)
    assert any("auditoria" in e for e in errores)


def test_fase_sin_modelo_falla():
    malo = BUENO.replace("  modelo: glm-5.3-flash\n  familia: glm", "  familia: glm")
    errores, _, _ = evaluar(malo)
    assert any("modelo" in e for e in errores)


def test_qa_sin_herramienta_real_falla():
    malo = BUENO.replace("herramienta: agent-browser", "herramienta: revisado a ojo")
    errores, _, _ = evaluar(malo)
    assert any("herramienta" in e for e in errores)


def test_investigacion_sin_fuentes_externas_falla():
    malo = BUENO.replace("fuentes_externas: 4", "fuentes_externas: 0")
    errores, _, _ = evaluar(malo)
    assert any("fuentes externas" in e for e in errores)


def test_investigacion_solo_interna_declarada_es_valida():
    ok = BUENO.replace("fuentes_externas: 4", "fuentes_externas: 0\n  alcance: solo-interno")
    errores, _, _ = evaluar(ok)
    assert errores == []


def test_familia_de_reconoce_los_modelos_del_reparto():
    assert familia_de("claude-sonnet-5-5") == "anthropic"
    assert familia_de("gpt-6.1-sol") == "openai"
    assert familia_de("deepseek-v4.1-flash") == "deepseek"
    assert familia_de("glm-5.3-flash").startswith("glm")
    assert familia_de("kimi-k2.7-code") == "kimi"
    assert familia_de("mimo-v2.6-flash") == "mimo"
    assert familia_de("") == ""
