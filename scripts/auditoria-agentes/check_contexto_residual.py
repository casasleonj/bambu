#!/usr/bin/env python3
"""Comprueba exhaustividad de 64 posiciones de contexto no recogidas en cláusulas. No certifica semántica."""
import argparse
import csv
import json
from pathlib import Path

def readcsv(path):
    with path.open(encoding="utf-8",newline="") as fh:
        return list(csv.DictReader(fh))

def evaluar(repo:Path):
    a=repo/"docs/agentes/auditoria-2026-11"
    try:
        original=readcsv(a/"revision_fuente_798.csv")
        atoms=readcsv(a/"obligaciones_atomicas.csv")
        residual=readcsv(a/"clasificacion_contexto_residual_64.csv")
        technical=(repo/"docs/agentes/contratos-tecnicos.md").read_text(encoding="utf-8")
    except (OSError,UnicodeError,csv.Error) as e:
        return {"estado":"FAIL","motivos":[str(e)]}
    seen={int(x["lineas_origen"]) for x in atoms if x.get("lineas_origen","").isdigit()}
    original_context={int(x["lineas_origen"]) for x in original if x.get("tipo")=="CONTEXTO_EVIDENCIA"}
    uncovered=original_context-seen
    observed=[int(x["linea"]) for x in residual if x.get("linea","").isdigit()]
    errors=[]
    if len(uncovered)!=64 or len(residual)!=64 or set(observed)!=uncovered or len(set(observed))!=64:
        errors.append("el conjunto residual no corresponde a las 64 posiciones originales")
    for row in residual:
        if not all(row.get(c,"").strip() for c in ("id","linea","tipo","significado","condicion","excepcion","estado")):
            errors.append("falta significado/condición/excepción "+row.get("id",""))
        if row.get("estado")!="PREANALISIS_IA_NO_CERTIFICADO":
            errors.append("certificación no autorizada "+row.get("id",""))
    if "REVISION_CONTEXTO_RESIDUAL.md" not in technical:
        errors.append("sin enlace desde contratos técnicos")
    return {"estado":"PASS_PREANALISIS_RESIDUAL" if not errors else "FAIL",
            "posiciones":len(uncovered),"errores":errors,
            "limite":"Cobertura documental de contextos; no prueba que no haya obligaciones escondidas"}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--repo",type=Path,default=Path("."))
    r=evaluar(p.parse_args().repo)
    print(json.dumps(r,ensure_ascii=False,indent=2))
    raise SystemExit(0 if r["estado"]=="PASS_PREANALISIS_RESIDUAL" else 1)
