#!/usr/bin/env python3
"""Gate NO destructivo para AGENTS.md. No confundir una matriz de líneas con
certificación semántica o pruebas conductuales. Requiere evidencia revisable.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

ORIGINAL_BLOB = "4182d57064c7f89c2eea39e86d1e0b469179bb06"
ORIGINAL_FILAS = 798
AGENTES = ("codex", "claude", "opencode")
INVARIANTES = (
    "ui_po_approval", "no_any", "no_unauthorized_merge",
    "privacy_protection", "migration_compatibility", "money_integrity",
    "backlog_reference", "research_approval", "offline_idempotency",
)

def blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\\0" + data).hexdigest()

def evaluar(repo, matriz, evidencia):
    controles = []
    def exigir(id_, ok, razon):
        controles.append({"id": id_, "estado": "PASS" if bool(ok) else "FAIL", "razon": razon})
    root = repo / "AGENTS.md"
    original = root.is_file() and blob_sha(root.read_bytes()) == ORIGINAL_BLOB
    exigir("raiz-original-preservada", original, "Si cambió, exigir pruebas de equivalencia y activación")
    try:
        with matriz.open(newline="",encoding="utf-8") as fh:
            filas = list(csv.DictReader(fh))
    except (OSError,UnicodeError):
        filas = []
    ids = [f.get("linea_original") for f in filas]
    exigir("inventario-integro", len(filas) == ORIGINAL_FILAS and
        set(ids) == {str(i) for i in range(1,ORIGINAL_FILAS+1)} and len(ids)==len(set(ids)),
        "Cobertura estructural de 798 posiciones sin duplicados")
    exigir("destinos-declarados", bool(filas) and all(
        f.get("destino") and f.get("destino") != "SIN_DESTINO" for f in filas),
        "El destino de una línea no certifica el sentido de las cláusulas")
    candidatos = [f for f in filas if f.get("clase") in (
        "CANDIDATO_NORMATIVO", "CONTRATO", "GATE", "REGLA", "HISTORICO_MIXTO")]
    sin_revisar = [f.get("linea_original") for f in candidatos if
        f.get("certificacion_semantica") not in (
            "VERIFICADA_IDENTICA", "VERIFICADA_EQUIVALENTE", "CAMBIO_APROBADO")]
    exigir("equivalencia-semantica", bool(candidatos) and not sin_revisar,
           "Cada obligación requiere firma y evidencia; pendientes=" + str(len(sin_revisar)))
    try:
        estado = json.loads(evidencia.read_text(encoding="utf-8"))
    except (OSError,ValueError):
        estado = {}
    exigir("decisiones-po", estado.get("decisiones_normativas")=="APROBADAS_Y_TRAZADAS"
        and bool(estado.get("referencias_aprobaciones")),
        "Issue #704 no se resuelve solo por emitir documentación")
    for nombre in AGENTES:
        x=estado.get("runtime",{}).get(nombre,{})
        exigir("runtime-"+nombre,x.get("estado")=="PASS" and x.get("version")
               and x.get("traza") and x.get("baseline_sha") and x.get("candidato_sha"),
               "Necesita ejecución real A/B con traza comprobable")
    for inv in INVARIANTES:
        e=estado.get("invariantes",{}).get(inv,{})
        exigir("invariante-"+inv,e.get("estado")=="PASS" and e.get("evidencia"),
               "Regla crítica con caso negativo y resultado")
    exigir("adversariales",estado.get("adversariales")=="APROBADOS_CON_EVIDENCIA"
           and estado.get("reporte_adversariales"),"No confundir escenarios diseñados con ejecutados")
    exigir("revision-humana",estado.get("revision_humana")=="APROBADA"
           and estado.get("revisor_referencia"),"Una persona autorizada revisa la evidencia")
    return {
      "estado":"APTO_PARA_REVISION_DE_MERGE" if all(x["estado"]=="PASS" for x in controles) else "BLOQUEADO",
      "original_intacto":bool(original), "filas":len(filas),
      "candidatos_obligacion":len(candidatos),
      "pendientes_semanticos":len(sin_revisar),
      "checks":controles,
      "limite":"El verificador controla integridad FORMAL, no sustituye revisión semántica ni certifica trazas falsificadas."
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--repo",type=Path,required=True)
    parser.add_argument("--matriz",type=Path,required=True)
    parser.add_argument("--evidencia",type=Path,required=True)
    parser.add_argument("--salida",type=Path,required=True)
    parser.add_argument("--exigir-corte",action="store_true")
    x=parser.parse_args()
    resultado=evaluar(x.repo,x.matriz,x.evidencia)
    x.salida.parent.mkdir(parents=True,exist_ok=True)
    x.salida.write_text(json.dumps(resultado,indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps({k:v for k,v in resultado.items() if k!="checks"},ensure_ascii=False))
    return 2 if x.exigir_corte and resultado["estado"]!="APTO_PARA_REVISION_DE_MERGE" else 0

if __name__=="__main__":
    raise SystemExit(main())
