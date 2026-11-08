#!/usr/bin/env python3
"""Verifica reglas locales y enrutamiento de Claude Code, no ejecución de los agentes."""
import json
import re
from pathlib import Path

AREAS=[["src/app/api","api"],["src/lib","lib"],["prisma","prisma"],["src/components","components"],["e2e","e2e"],["src/modules","modules"]]
RULE_PATHS = re.compile(r"^---\npaths:\n\s+- \"([^\"]+)\"\n---\n", re.M)
LINKS = re.compile(r"\]\(([^)]+)\)")
INVARIANTS = {
    "src/app/api":["offlineId","fiados","autoriz","XMOD"],
    "src/lib":["dinero","offline","pickCoords","consumidores"],
    "prisma":["PostgreSQL","idempotente","producción","compatib"],
    "src/components":["escritorio y móvil","aprobación explícita","error","QA"],
    "e2e":["baseline","flaky","regresiones","skip"],
    "src/modules":["domain","application","infrastructure","presentation"]
}

def verificar(repo: Path):
    checks={}
    for area, name in AREAS:
        f=repo/area/"AGENTS.md"
        cm=repo/".claude/rules"/(name+".md")
        checks[area+"-local"]=f.is_file()
        checks[area+"-claude"]=cm.is_file()
        if not f.is_file() or not cm.is_file():
            continue
        guidance=f.read_text(encoding="utf-8")
        rule=cm.read_text(encoding="utf-8")
        patterns=RULE_PATHS.search(rule)
        checks[area+"-scope-frontmatter"]=bool(patterns and patterns.group(1)==area+"/**/*")
        checks[area+"-claude-referencia"]=area+"/AGENTS.md" in rule
        checks[area+"-no-override"]=("Complementa" in guidance or "complementa" in guidance or
                                     "suman" in guidance or "sum" in guidance or "Ámbito" in guidance)
        for s in INVARIANTS[area]:
            checks[area+"-invariante-"+s]=s.lower() in guidance.lower()
        links=[p.split("#",1)[0] for p in LINKS.findall(guidance)
               if p and not p.startswith(("#","https://","http://","mailto:"))]
        checks[area+"-enlaces"]=all((f.parent/p).resolve().is_file() and
             (repo.resolve() in (f.parent/p).resolve().parents) for p in links)
    return {"estado":"PASS_ESTRUCTURAL" if checks and all(checks.values()) else "FAIL",
            "control":"Solo rutas y cláusulas observables, no prueba uso ni cumplimiento real",
            "areas":len(AREAS),"checks":checks}
if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("--repo",type=Path,default=Path("."))
    a=p.parse_args()
    r=verificar(a.repo)
    print(json.dumps(r,ensure_ascii=False,indent=2))
    raise SystemExit(0 if r["estado"]=="PASS_ESTRUCTURAL" else 1)
