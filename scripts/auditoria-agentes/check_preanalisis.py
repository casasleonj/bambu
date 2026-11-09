#!/usr/bin/env python3
"""Verifica integridad del inventario semántico preliminar, no equivalencia de conducta."""
import argparse
import csv
import json
import re
from pathlib import Path

PARTS=("00-entrada.md","01-arquitectura-tecnica.md","02-historico-incidencias.md",
       "03-reglas-codigo.md","04-protocolo-anterior.md","05-flujo-entrega-anterior.md")
CANDIDATES={"CANDIDATO_NORMATIVO","CONTRATO","GATE","REGLA","HISTORICO_MIXTO"}
# No duplicar credenciales de ejemplo ni datos identificables al publicar
# un inventario. El snapshot original (en el mismo repo) sigue intacto.
SENSITIVE=("admin123","asist123","cont123","rep123","bambu_dev","jhonnatan",
           "cmrqut8tj0003ih04r4wc26tc")
def sanitize(text):
    for token in SENSITIVE:
        text=re.sub(re.escape(token), "[REDACTADO]", text, flags=re.IGNORECASE)
    return text


def check(repo):
    base=repo/"docs/agentes"
    audit=base/"auditoria-2026-11"
    errors=[]
    try:
        source=b"".join((base/"fuente-original"/name).read_bytes() for name in PARTS)
        lines=source.decode("utf-8").splitlines()
        with (audit/"matriz_fuente_798.csv").open(encoding="utf-8",newline="") as f:
            matrix=list(csv.DictReader(f))
        with (audit/"obligaciones_atomicas.csv").open(encoding="utf-8",newline="") as f:
            clauses=list(csv.DictReader(f))
    except (OSError,UnicodeError,csv.Error) as e:
        return {"estado":"FAIL","errores":[str(e)]}
    if len(matrix)!=798 or len(lines)!=797:
        errors.append("cardinalidad fuente/matriz inesperada")
    candidates={int(row["linea_original"]) for row in matrix if row["clase"] in CANDIDATES}
    seen=set()
    coverage=set()
    ab=0
    extracted=0
    for i,row in enumerate(clauses,1):
        ident=row.get("id","")
        if not ident or ident in seen:
            errors.append("id duplicado/ausente "+str(i))
        seen.add(ident)
        span=row.get("lineas_origen","")
        if not re.fullmatch(r"[1-9][0-9]*",span):
            errors.append("rango no atómico preliminar "+str(i))
            continue
        n=int(span)
        if n<1 or n>len(lines):
            errors.append("linea inexistente "+str(i))
            continue
        coverage.add(n)
        if row.get("clausula_original","").strip()!=sanitize(lines[n-1]).strip():
            errors.append("fuente literal divergente "+ident)
        if ident.startswith("AB-EX-"):
            extracted+=1
            # La segunda pasada aporta significado, condición y límite preliminares.
            # No equivale a certificación. Evitar marcadores vacíos.
            if (not row.get("significado","").strip() or
                row.get("significado","").startswith("EXTRACCION_LITERAL_PENDIENTE_DESCOMPOSICION:") or
                row.get("condiciones","").startswith("POR_IDENTIFICAR") or
                row.get("excepciones","").startswith("POR_IDENTIFICAR") or
                row.get("estado_revision")!="PENDIENTE"):
                errors.append("clasificacion insuficiente o fingida "+ident)
        elif re.fullmatch(r"AB-[0-9]{4}",ident):
            ab+=1
        else:
            errors.append("id desconocido "+ident)
        if row.get("estado_revision")=="VERIFICADA" and row.get("referencia_revisor","").startswith("PENDIENTE"):
            errors.append("certificacion sin revisor "+ident)
    missing=candidates-coverage
    if missing:
        errors.append("candidatos sin origen: "+str(sorted(missing)[:30]))
    if ab!=354 or extracted!=202 or len(clauses)!=556:
        errors.append("inventario distinto al preanalisis: "+str((ab,extracted,len(clauses))))
    return {"estado":"PASS_INVENTARIO_PRELIMINAR" if not errors else "FAIL",
            "filas_candidatas":len(candidates),"cubiertas":len(candidates&coverage),
            "clausulas_preanalizadas":ab,"extracciones_pendientes":extracted,
            "certificaciones_humanas":sum(r.get("estado_revision")=="VERIFICADA" for r in clauses),
            "errores":errors,
            "limite":"No certifica vigencia, equivalencia, activación ni decisiones de producto"}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--repo",type=Path,default=Path("."))
    a=p.parse_args()
    result=check(a.repo)
    print(json.dumps(result,indent=2,ensure_ascii=False))
    raise SystemExit(0 if result["estado"]=="PASS_INVENTARIO_PRELIMINAR" else 1)
