#!/usr/bin/env python3
"""Valida integridad y trazabilidad de la revisión semántica PRELIMINAR.

No sustituye certificación semántica ni activación conductual de agentes.
"""
import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

REQUIRED = ("id","lineas_origen","significado","condiciones","excepciones",
            "destino_activo","estado_revision","tipo","fuente")
PARTS = ((1,16,"00-entrada.md"),(17,347,"01-arquitectura-tecnica.md"),
         (348,624,"02-historico-incidencias.md"),(625,666,"03-reglas-codigo.md"),
         (667,704,"04-protocolo-anterior.md"),(705,798,"05-flujo-entrega-anterior.md"))

def evaluar(repo):
    repo = repo.resolve()
    matrix = repo / "docs/agentes/auditoria-2026-11/obligaciones_atomicas.csv"
    cat = repo / "docs/agentes/contratos-operativos.md"
    errors=[]
    try:
        with matrix.open(encoding="utf-8",newline="") as f:
            reader=csv.DictReader(f)
            if not set(REQUIRED).issubset(reader.fieldnames or []):
                errors.append("faltan columnas")
            rows=list(reader)
        catalogue=cat.read_text(encoding="utf-8")
    except (OSError,UnicodeError,csv.Error) as e:
        return {"estado":"FAIL","errores":["fuentes inaccesibles: "+str(e)]}
    sections={}
    for ini,fin,name in PARTS:
        p=repo/"docs/agentes/fuente-original"/name
        if not p.is_file():
            errors.append("falta parte "+name)
            continue
        sections[name]=(ini,fin,p.read_text(encoding="utf-8").split("\n"))
    ids=set()
    lines=set()
    types=Counter()
    for k,x in enumerate(rows,1):
        id_=x.get("id","")
        if not re.fullmatch(r"AB-\d{4}",id_) or id_ in ids:
            errors.append("id ausente/duplicado en fila "+str(k))
        ids.add(id_)
        raw_line=x.get("lineas_origen","")
        if not raw_line.isdigit() or not 1<=int(raw_line)<=798:
            errors.append("línea inválida en fila "+str(k))
            continue
        n=int(raw_line)
        lines.add(n)
        part=next((name for lo,hi,name in PARTS if lo<=n<=hi),None)
        sec=sections.get(part)
        if not sec:
            continue
        origin=sec[2][n-sec[0]]
        if not x.get("fuente","").startswith("docs/agentes/fuente-original/"+part+"#L"+str(n-sec[0]+1)):
            errors.append("fuente errónea para "+id_)
        dest=x.get("destino_activo","")
        path=(repo/dest).resolve() if dest else None
        if not path or not path.is_file() or repo not in path.parents:
            errors.append("destino inexistente/fuera de repo "+id_)
        if x.get("estado_revision")=="VERIFICADA" and not x.get("referencia_revisor"):
            errors.append("verificada sin revisor "+id_)
        typ=x.get("tipo")
        types[typ]+=1
        if typ=="CLAUSULA_DESCOMPUESTA":
            if x.get("estado_revision")!="PREANALISIS_IA":
                errors.append("cambio de estado manual sin evidencia "+id_)
            if not x.get("condiciones") or not x.get("excepciones"):
                errors.append("condición/excepción vacía "+id_)
            if x.get("significado","") not in catalogue or id_ not in catalogue:
                errors.append("falta cláusula en catálogo "+id_)
            if not origin.strip():
                errors.append("origen vacío para cláusula "+id_)
            if x.get("clausula_original","") not in origin:
                errors.append("cita no coincide con origen "+id_)
        elif typ=="PASAJE_POR_DESCOMPONER":
            if x.get("estado_revision")!="PENDIENTE_ATOMIZACION":
                errors.append("pasaje indebidamente certificado "+id_)
        elif typ in ("CONTEXTO_ESTRUCTURAL","CONTEXTO_EVIDENCIA"):
            if x.get("estado_revision")!="CONTEXTO_PENDIENTE_VALIDACION":
                errors.append("contexto indebidamente certificado "+id_)
        else:
            errors.append("tipo inesperado "+str(typ)+" en "+id_)
    missing=set(range(1,799))-lines
    if missing:
        errors.append("posiciones originales sin entrada: "+str(len(missing)))
    rawcsv=matrix.read_text(encoding="utf-8")
    for secret in ("admin123","asist123","cont123","rep123","bambu_dev","jhonnatan"):
        if secret in rawcsv.lower():
            errors.append("ejemplo privado duplicado en matriz")
    cotejadas=sum(bool(x.get("evidencia_main")) and x.get("comparacion_main") not in ("NO_VERIFICADO_MAIN","PENDIENTE_EVIDENCIA_MAIN") for x in rows)
    return {"estado":"PASS_PREANALISIS" if not errors else "FAIL",
            "lineas_referenciadas":len(lines),"filas":len(rows),
            "clausulas_descompuestas":types["CLAUSULA_DESCOMPUESTA"],
            "pasajes_pendientes":types["PASAJE_POR_DESCOMPONER"],
            "contextos_pendientes":types["CONTEXTO_ESTRUCTURAL"]+types["CONTEXTO_EVIDENCIA"],
            "certificaciones_humanas":sum(x.get("estado_revision")=="VERIFICADA" for x in rows),
            "evidencia_codigo_acotada":cotejadas,
            "clausulas_sin_comparacion_main":sum(x.get("tipo")=="CLAUSULA_DESCOMPUESTA" and not x.get("evidencia_main") for x in rows),
            "errores":errors,
            "limite":"PASS_PREANALISIS no es PASS_SEMANTICO; no desbloquea merge"}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--repo",type=Path,default=Path("."))
    r=evaluar(p.parse_args().repo)
    print(json.dumps(r,indent=2,ensure_ascii=False))
    raise SystemExit(0 if r["estado"]=="PASS_PREANALISIS" else 1)
