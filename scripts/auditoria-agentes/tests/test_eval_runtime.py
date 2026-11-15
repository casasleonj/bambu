"""Pruebas del veredicto y del detector de activación.

Cubren tres defectos que hicieron que el informe de runtime fuera engañoso:

1. `scan_tool_calls` reventaba con `skill=None` (los casos `invariant` no declaran
   skill), así que 9 de 21 casos no podían evaluarse nunca.
2. `gate` e `invariant` se juzgaban por lectura de archivo cuando piden conducta:
   14 casos se reportaban como fallo y eran resultado correcto.
3. Un error de sandbox citado dentro de la salida de un comando **exitoso**
   anulaba la lectura real: la firma textual `bwrap:` se buscaba en el contenido,
   no en el resultado del comando.
"""
import importlib.util
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("eval_runtime", RAIZ / "eval_runtime.py")
ev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ev)


# --- scan_tool_calls: formato de traza de codex ---
def _traza(command, exit_code, output):
    return json.dumps({"item": {"type": "command_execution", "command": command,
                                "exit_code": exit_code,
                                "aggregated_output": output}})


def test_skill_none_devuelve_vacio_sin_reventar():
    """Los `invariant` no declaran skill; antes esto era un TypeError."""
    assert ev.scan_tool_calls(_traza("cat x", 0, "algo"), None) == []


def test_lectura_exitosa_cuenta_como_read_skill():
    t = _traza("cat .agents/skills/jl/SKILL.md", 0, "---\nname: jl\n")
    assert ev.scan_tool_calls(t, "jl") == ["read-skill"]


def test_comando_fallido_no_cuenta_como_activacion():
    t = _traza("cat .agents/skills/jl/SKILL.md", 1, "error")
    assert ev.scan_tool_calls(t, "jl") == ["intento-fallido"]


def test_lectura_iniciada_sin_exit_no_cuenta():
    t = _traza("cat .agents/skills/jl/SKILL.md", None, "")
    assert ev.scan_tool_calls(t, "jl") == ["intento-fallido"]


def test_error_de_sandbox_citado_no_anula_lectura_exitosa():
    """El modelo cita el error de bwrap al explicar el entorno: 23 KB leídos."""
    salida = "---\nname: jl\n\nnota: bwrap: No permissions to create a new namespace, ok\n"
    t = _traza("cat .agents/skills/jl/SKILL.md", 0, salida)
    assert ev.scan_tool_calls(t, "jl") == ["read-skill"]


def test_lectura_de_otra_skill_no_cuenta():
    t = _traza("cat .agents/skills/hallazgo/SKILL.md", 0, "---\nname: hallazgo\n")
    assert ev.scan_tool_calls(t, "jl") == []


# --- veredicto por tipo de caso ---
def test_positivo_con_lectura_es_activo():
    assert ev.veredicto("positive", ["read-skill"], "jl")[0] == "ACTIVO"


def test_positivo_sin_lectura_es_sin_evidencia():
    assert ev.veredicto("positive", [], "jl")[0] == "SIN_EVIDENCIA_DE_ACTIVACION"


def test_gate_se_evalua_por_conducta_no_por_lectura():
    estado, motivo = ev.veredicto("gate", [], "jl")
    assert estado == "CONDUCTA_PARA_REVISAR"
    assert "conducta" in motivo


def test_invariant_se_evalua_por_conducta():
    assert ev.veredicto("invariant", [], None)[0] == "CONDUCTA_PARA_REVISAR"


def test_negativo_sin_activacion_es_lo_esperado():
    assert ev.veredicto("negative", [], None)[0] == "SIN_ACTIVACION_ESPERADA"


def test_negativo_que_activa_se_senala():
    estado, motivo = ev.veredicto("negative", ["read-skill"], None)
    assert estado == "SIN_ACTIVACION_ESPERADA"
    assert "read-skill" in motivo


def test_tipo_desconocido_no_se_inventa():
    assert ev.veredicto("raro", [], None)[0] == "TIPO_DESCONOCIDO"


# --- coherencia con el catálogo real ---
def test_el_catalogo_solo_usa_tipos_contemplados():
    casos = json.loads((RAIZ / "casos_activacion.json").read_text(encoding="utf-8"))
    conocidos = {"positive", "gate", "invariant", "negative"}
    assert {c["type"] for c in casos} <= conocidos


def test_los_invariant_no_declaran_skill():
    """Si algún día declaran skill, el veredicto por conducta deja de aplicar.

    El campo existe en el JSON pero vale `null`: se comprueba el valor, no la
    presencia de la clave.
    """
    casos = json.loads((RAIZ / "casos_activacion.json").read_text(encoding="utf-8"))
    assert all(not c.get("skill") for c in casos if c["type"] == "invariant")
