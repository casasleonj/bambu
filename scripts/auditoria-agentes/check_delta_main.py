#!/usr/bin/env python3
"""Comprueba que la rama conserva el delta original de main #691/#696.

PASS_DOCUMENTAL no equivale a validación semántica, aprobación ni tests E2E.
"""
import hashlib
import json
import subprocess
from pathlib import Path

SOURCE_MAIN="ef0bc0dd0736e3acfd9d9d0bf64ffc5ff62fb44f"
SOURCE_BLOB="65556a31471776cd0682478c862d47336c91033e"
NUMBERS=(621,625,626,627,628,629,630,631,632)
KEYS=("cierre-dia","BASE_CAMBIO","COBRO_FIADO_V2","Cliente.saldoFavor",
      "IngresoSaldoFavor","PedidoSaldoFavorMovimiento","CONSUMIDOR_FINAL",
      "hayMas","Reintentar","AyudaTermino","rebanada 2","rebanada 3",
      "Sin decidir","ADMIN","ASISTENTE","CONTADOR","Escape","60 segundos")

def evaluar(repo:Path):
    root=repo.resolve()
    audit=root/"docs/agentes/auditoria-2026-11/delta_main_ef0bc0dd.json"
    module=root/"docs/agentes/contratos-saldo-favor-696.md"
    try:
        data=json.loads(audit.read_text(encoding="utf-8"))
        main=subprocess.run(["git","show",f"{SOURCE_MAIN}:AGENTS.md"],
                            cwd=root,check=True,capture_output=True).stdout
        text=main.decode("utf-8")
        doc=module.read_text(encoding="utf-8")
        core=(root/"AGENTS.md").read_text(encoding="utf-8")
        nav=(root/"docs/agentes/README.md").read_text(encoding="utf-8")
    except (OSError, ValueError, subprocess.CalledProcessError, UnicodeError) as error:
        return {"estado":"FAIL","motivos":["fuente/destino inaccesible: "+str(error)]}
    errors=[]
    blob=hashlib.sha1(b"blob "+str(len(main)).encode()+b"\\0"+main).hexdigest()
    if blob!=SOURCE_BLOB or data.get("source_blob_sha")!=SOURCE_BLOB or data.get("source_commit")!=SOURCE_MAIN:
        errors.append("SHA histórico de main inconsistente")
    lines=text.split("\n")
    observed=data.get("original_lines",[])
    if [x.get("line") for x in observed]!=list(NUMBERS):
        errors.append("rangos originales alterados")
    for r in observed:
        n=r.get("line",0)
        if not isinstance(n,int) or n<1 or n>len(lines) or r.get("text")!=lines[n-1]:
            errors.append("texto original divergente en línea "+str(n))
    for token in KEYS:
        if token not in doc:
            errors.append("contrato o excepción ausente "+token)
    if "contratos-saldo-favor-696.md" not in core or "contratos-saldo-favor-696.md" not in nav:
        errors.append("módulo no enlazado en descubrimiento")
    return {"estado":"PASS_DELTA_DOCUMENTAL" if not errors else "FAIL",
            "lineas_de_main":len(observed),"tokens_contrato":len(KEYS),
            "motivos":errors,"limite":"No prueba obediencia de agentes ni equivalencia normativa firmada"}

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("--repo",type=Path,default=Path("."))
    result=evaluar(p.parse_args().repo)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result["estado"]=="PASS_DELTA_DOCUMENTAL" else 1)
