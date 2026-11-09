#!/usr/bin/env python3
"""Verifica que el índice de Known Issues preserve los 49 bloques y sus anclas.
No determina si una solución histórica sigue vigente en el código de main.
"""
import argparse
import json
import re
from pathlib import Path

ORIGINAL = re.compile(r"^\s*(\d+)\.\s+\*\*([^*]+)\*\*")
INDEX = re.compile(r"^\| HIST-(\d{3}) \| (\d+) \| (.*?) \| \[L(\d+)\]\(([^)]+)\) \|$")
FUENTE = "fuente-original/02-historico-incidencias.md"

def verificar(repo):
    src = repo / "docs/agentes" / FUENTE
    dst = repo / "docs/agentes/indice-historico-49.md"
    if not src.is_file() or not dst.is_file():
        return {"estado":"FAIL", "razon":"fuente o indice no disponible"}
    records = []
    for i, line in enumerate(src.read_text(encoding="utf-8").splitlines(), 1):
        m = ORIGINAL.match(line)
        if m:
            records.append((int(m[1]),m[2].replace("[","(").replace("]",")").replace("|","\\|"),i))
    indexed = []
    for line in dst.read_text(encoding="utf-8").splitlines():
        m = INDEX.match(line)
        if m:
            indexed.append((int(m[1]),int(m[2]),m[3],int(m[4]),m[5]))
    errors=[]
    if len(records) != 49 or len(indexed) != 49:
        errors.append(f"cardinalidad: fuente={len(records)},indice={len(indexed)},esperado=49")
    for j,(num,title,line) in enumerate(records,1):
        if j>len(indexed):
            errors.append(f"falta HIST-{j:03d}")
            continue
        seq,i_num,i_title,i_line,i_dest=indexed[j-1]
        if (seq,i_num,i_title,i_line,i_dest) != (j,num,title,line,FUENTE+f"#L{line}"):
            errors.append(f"HIST-{j:03d} no coincide con fuente L{line}")
    for n in (13,43,45):
        if sum(x[0]==n for x in records)!=2:
            errors.append(f"duplicados de numero {n} sin preservar")
    return {"estado":"PASS_INDICE" if not errors else "FAIL","registros_fuente":len(records),
            "registros_indice":len(indexed),"errores":errors,
            "limite":"El índice prueba completitud de encabezados, no equivalencia ni activación de agentes"}

if __name__=="__main__":
    a=argparse.ArgumentParser()
    a.add_argument("--repo",type=Path,default=Path("."))
    v=a.parse_args()
    result=verificar(v.repo)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result["estado"]=="PASS_INDICE" else 1)
