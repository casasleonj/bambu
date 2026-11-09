#!/usr/bin/env python3
"""Auditoría estructural de rutas de skills. NO invoca modelos ni prueba conducta."""
import hashlib
import json
import re
from pathlib import Path

SKILLS = ("jl","hallazgo")
REFERENCIA = re.compile(r"\]\(([^)]+)\)")
METADATA = re.compile(r"\A---\n(.*?)\n---\n",re.S)

def analizar(repo):
    checks={}
    def record(key,ok):
        checks[key]=bool(ok)
    for skill in SKILLS:
        original=repo/".agents/skills"/skill/"SKILL.md"
        mirror=repo/".claude/skills"/skill/"SKILL.md"
        record(skill+"-principal",original.is_file())
        record(skill+"-claude",mirror.is_file())
        if not original.is_file():
            continue
        txt=original.read_text(encoding="utf-8")
        meta=METADATA.match(txt)
        record(skill+"-frontmatter",bool(meta and
            re.search(r"(?m)^name:\s*"+re.escape(skill)+r"\s*$",meta.group(1)) and
            re.search(r"(?m)^description:\s*\S",meta.group(1))))
        record(skill+"-mirror-consistente",mirror.is_file() and
            hashlib.sha256(original.read_bytes()).digest()==hashlib.sha256(mirror.read_bytes()).digest())
        if mirror.is_symlink():
            resolved=mirror.resolve()
            record(skill+"-symlink-seguro",resolved==original.resolve() and
                (resolved==repo.resolve() or repo.resolve() in resolved.parents))
        for link in REFERENCIA.findall(txt):
            route=link.split("#",1)[0]
            if not route or route.startswith(("https://","http://","mailto:","/")):
                continue
            record(skill+"-link-"+route,(original.parent/route).is_file())
    hallazgo=repo/".agents/skills/hallazgo/references/casos-limite.md"
    espejo=repo/".claude/skills/hallazgo/references/casos-limite.md"
    record("hallazgo-casos-limite",hallazgo.is_file() and espejo.is_file() and
        hallazgo.read_bytes()==espejo.read_bytes())
    claude=repo/"CLAUDE.md"
    record("claude-importa-raiz",claude.is_file() and "@AGENTS.md" in claude.read_text(encoding="utf-8"))
    config=repo/"opencode.json"
    try:
        settings=json.loads(config.read_text(encoding="utf-8"))
        record("opencode-config", "AGENTS.md" in settings.get("instructions",[]) and
               ".opencode/prompts/protocolo.txt" in str(settings.get("agent",{})))
    except (OSError,ValueError):
        record("opencode-config",False)
    ag=repo/"AGENTS.md"
    record("codex-presupuesto-raiz",ag.is_file() and ag.stat().st_size<=32768)
    return {"estado":"PASS_ESTRUCTURAL" if all(checks.values()) else "FAIL",
            "activacion_codex":"NO_EJECUTADA","activacion_claude":"NO_EJECUTADA",
            "activacion_opencode":"NO_EJECUTADA","checks":checks}

if __name__=="__main__":
    import argparse
    a=argparse.ArgumentParser()
    a.add_argument("--repo",type=Path,default=Path("."))
    z=a.parse_args()
    result=analizar(z.repo)
    print(json.dumps(result,indent=2,ensure_ascii=False))
    raise SystemExit(0 if result["estado"]=="PASS_ESTRUCTURAL" else 1)
