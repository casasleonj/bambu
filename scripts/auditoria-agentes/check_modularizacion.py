#!/usr/bin/env python3
"""Verificación estática no destructiva de la modularización de AGENTS.md.

No certifica activación real de Codex, Claude Code ni OpenCode.
"""
import hashlib
import json
import re
from pathlib import Path

PARTES = (
    "00-entrada.md",
    "01-arquitectura-tecnica.md",
    "02-historico-incidencias.md",
    "03-reglas-codigo.md",
    "04-protocolo-anterior.md",
    "05-flujo-entrega-anterior.md",
)
BLOB_ORIGINAL = "4182d57064c7f89c2eea39e86d1e0b469179bb06"
MAX_BYTES_ROOT = 32768
CRITICAS = (
    ("tipado", r"sin `any`"),
    ("aprobacion_ui", r"aprobaci[oó]n expl[ií]cita del PO"),
    ("escritorio_movil", r"escritorio y m[oó]vil"),
    ("tres_r1_r2", r"tres iteraciones de R1.*R2"),
    ("r3_aprobado", r"R3.*aprobaci[oó]n"),
    ("sin_merge_automatico", r"aprobaci[oó]n de merge"),
    ("backlog", r"docs/BACKLOG.md"),
    ("contexto_maestro", r"Contexto Maestro"),
    ("historico", r"hist[oó]ri"),
    ("pruebas", r"E2E baseline"),
)
NECESARIOS = (
    "docs/agentes/protocolo-investigacion.md",
    "docs/agentes/flujo-entrega.md",
    "docs/agentes/reglas-codigo.md",
    "docs/agentes/contratos-tecnicos.md",
    "docs/agentes/historial-y-trazabilidad.md",
    "docs/agentes/README.md",
    ".agents/skills/jl/SKILL.md",
    ".agents/skills/hallazgo/SKILL.md",
    "CLAUDE.md",
    "opencode.json",
    ".opencode/prompts/protocolo.txt",
)

def blob_git(b: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(b)).encode("ascii") + b"\0" + b).hexdigest()

def verificar(repo: Path):
    verificaciones = {}
    def check(name, value):
        verificaciones[name] = bool(value)
    originals = repo / "docs/agentes/fuente-original"
    todos = all((originals / n).is_file() for n in PARTES)
    check("seis_archivos_originales", todos)
    concatenado = b"".join((originals / n).read_bytes() for n in PARTES) if todos else b""
    check("origen_sha_inalterado", todos and blob_git(concatenado) == BLOB_ORIGINAL)
    check("origen_798_posiciones", todos and len(concatenado.decode("utf-8").split("\n")) == 798)
    raiz = repo / "AGENTS.md"
    texto = raiz.read_text(encoding="utf-8") if raiz.is_file() else ""
    check("raiz_ligera", bool(texto) and len(texto.encode("utf-8")) <= MAX_BYTES_ROOT)
    check("raiz_no_identica_legacy", bool(texto) and blob_git(texto.encode("utf-8")) != BLOB_ORIGINAL)
    for name, regex in CRITICAS:
        check("raiz_"+name, bool(re.search(regex, texto, re.I|re.S)))
    for path in NECESARIOS:
        check("ruta_"+path, (repo/path).is_file())
    protocolo = (repo/"docs/agentes/protocolo-investigacion.md")
    p = protocolo.read_text(encoding="utf-8") if protocolo.is_file() else ""
    check("protocolo_704_tres_iteraciones", "tres iteraciones de investigación y planificación" in p)
    check("protocolo_704_investigar_no_r3", "nunca ejecutar R3" in p)
    check("protocolo_704_aprobacion", "aprobación expresa" in p)
    bridge = (repo/".opencode/prompts/protocolo.txt")
    b = bridge.read_text(encoding="utf-8") if bridge.is_file() else ""
    check("opencode_usa_canon", "docs/agentes/protocolo-investigacion.md" in b)
    check("opencode_sin_3_r3_obsoletas", "CICLO DE 3 RONDAS" not in b)
    # Enlaces Markdown: comprobar destinos locales de documentos canónicos.
    archivos_documentales = [
        repo / "AGENTS.md",
        repo / "docs/agentes/README.md",
        repo / "docs/agentes/protocolo-investigacion.md",
        repo / "docs/agentes/flujo-entrega.md",
        repo / "docs/agentes/contratos-tecnicos.md",
        repo / "docs/agentes/historial-y-trazabilidad.md",
        repo / "docs/agentes/reglas-codigo.md",
    ]
    for archivo in archivos_documentales:
        if not archivo.is_file():
            check("enlaces_"+archivo.name, False)
            continue
        rutas = re.findall(r"\\]\\(([^)]+)\\)", archivo.read_text(encoding="utf-8"))
        locales = [url.split("#",1)[0] for url in rutas
                   if not url.startswith(("https://","http://","mailto:","#"))]
        check("enlaces_"+archivo.name, all((archivo.parent / url).exists() for url in locales))
    readme = repo/"docs/agentes/README.md"
    t=readme.read_text(encoding="utf-8") if readme.is_file() else ""
    check("fuente_historica_no_normativa", "evidencia histórica" in t.lower())
    return {"resultado":"PASS_ESTRUCTURAL" if all(verificaciones.values()) else "FAIL",
            "evidencia":"La reconstrucción literal no certifica equivalencia semántica operativa ni activación real",
            "controles":verificaciones}

if __name__=="__main__":
    import argparse
    a=argparse.ArgumentParser()
    a.add_argument("--repo",type=Path,default=Path("."))
    a.add_argument("--salida",type=Path)
    z=a.parse_args()
    res=verificar(z.repo)
    print(json.dumps(res,indent=2,ensure_ascii=False))
    if z.salida:
        z.salida.parent.mkdir(parents=True,exist_ok=True)
        z.salida.write_text(json.dumps(res,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    raise SystemExit(0 if res["resultado"]=="PASS_ESTRUCTURAL" else 1)
