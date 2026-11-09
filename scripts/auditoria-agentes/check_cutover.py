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
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def evaluar(repo, matriz, evidencia):
    controles = []
    def exigir(id_, ok, razon):
        controles.append({"id": id_, "estado": "PASS" if bool(ok) else "FAIL", "razon": razon})
    root = repo / "AGENTS.md"
    original_en_raiz = root.is_file() and blob_sha(root.read_bytes()) == ORIGINAL_BLOB
    segmentos = [
        "00-entrada.md", "01-arquitectura-tecnica.md", "02-historico-incidencias.md",
        "03-reglas-codigo.md", "04-protocolo-anterior.md", "05-flujo-entrega-anterior.md",
    ]
    carpeta = repo / "docs/agentes/fuente-original"
    fuente_completa = all((carpeta / n).is_file() for n in segmentos)
    original_archivado = fuente_completa and blob_sha(
        b"".join((carpeta / n).read_bytes() for n in segmentos)
    ) == ORIGINAL_BLOB
    original = original_en_raiz or original_archivado
    exigir("fuente-original-conservada", original, "La raíz antigua o los seis segmentos deben reconstruir SHA del AGENTS original")
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
    # Una fila no es una obligación. La matriz de 798 posiciones solo identifica
    # dónde buscar cláusulas; una línea puede contener varias y viceversa.
    atom_path = repo / "docs/agentes/auditoria-2026-11/obligaciones_atomicas.csv"
    try:
        with atom_path.open(newline="",encoding="utf-8") as fh:
            atomos = list(csv.DictReader(fh))
    except (OSError, UnicodeError):
        atomos = []
    ids_atomos=set()
    cubiertas=set()
    errores_atomicos=[]
    validas={"VIGENTE","HISTORICO_NO_NORMATIVO","CAMBIO_APROBADO"}
    for k,atomo in enumerate(atomos,1):
        aid=atomo.get("id","").strip()
        if not aid or aid in ids_atomos:
            errores_atomicos.append("id ausente/duplicado registro "+str(k))
        ids_atomos.add(aid)
        estado_atomo=atomo.get("estado_revision","").strip()
        clase_atomo=atomo.get("clasificacion","").strip()
        requeridos=("clausula_original","significado","condiciones","excepciones",
                    "criterio_verificacion","referencia_revisor")
        if estado_atomo!="VERIFICADA" or clase_atomo not in validas or any(
                not atomo.get(c,"").strip() for c in requeridos):
            errores_atomicos.append("registro incompleto "+str(k))
        dest=atomo.get("destino_activo","").strip()
        ruta=(repo/dest).resolve() if dest else None
        dentro=bool(ruta and (ruta==repo.resolve() or repo.resolve() in ruta.parents))
        if not dentro or not ruta.is_file():
            errores_atomicos.append("destino no verificable "+str(k))
        if clase_atomo in ("VIGENTE","CAMBIO_APROBADO") and dest.startswith("docs/agentes/fuente-original/"):
            errores_atomicos.append("regla vigente solo en archivo historico "+str(k))
        for span in atomo.get("lineas_origen","").split(";"):
            span=span.strip()
            if not span:
                continue
            lim=span.split("-")
            if len(lim)>2 or not all(t.isdigit() for t in lim):
                errores_atomicos.append("rango invalido "+str(k))
                continue
            inicio,fin=int(lim[0]),int(lim[-1])
            if inicio<1 or fin>ORIGINAL_FILAS or fin<inicio:
                errores_atomicos.append("rango fuera de fuente "+str(k))
            else:
                cubiertas.update(range(inicio,fin+1))
    faltan_cubrir={int(f["linea_original"]) for f in candidatos if str(f.get("linea_original","")).isdigit()} - cubiertas
    atomizacion_ok=bool(atomos) and not errores_atomicos and not faltan_cubrir
    exigir("obligaciones-atomicas-con-evidencia",atomizacion_ok,
           "Descomponer cláusulas, distinguir archivo historico vs norma activa, cubrir candidatos "
           "y exigir validación humana; atomos="+str(len(atomos))+
           ",sin_cobertura="+str(len(faltan_cubrir))+
           ",errores="+str(len(errores_atomicos)))
    try:
        estado = json.loads(evidencia.read_text(encoding="utf-8"))
    except (OSError,ValueError):
        estado = {}
    exigir("decisiones-po", estado.get("decisiones_normativas")=="APROBADAS_Y_TRAZADAS"
        and bool(estado.get("referencias_aprobaciones")),
        "Issue #704 no se resuelve solo por emitir documentación")
    def runtime_pass(x):
        return bool(x.get("estado")=="PASS" and x.get("version")
                    and x.get("traza") and x.get("baseline_sha") and x.get("candidato_sha"))
    exenciones=[]
    for nombre in AGENTES:
        x=estado.get("runtime",{}).get(nombre,{})
        ok=runtime_pass(x)
        razon="Necesita ejecución real A/B con traza comprobable"
        # Exención explícita del PO (issue de seguimiento). Nunca es PASS de ejecución:
        # solo vale para agentes distintos de Claude, exige referencia + issue y que
        # Claude Code haya pasado su propia prueba A/B.
        if (not ok and nombre!="claude" and x.get("estado")=="EXENTO_POR_PO"
                and str(x.get("referencia_po","")).strip() and str(x.get("issue","")).strip()
                and runtime_pass(estado.get("runtime",{}).get("claude",{}))):
            ok=True
            razon="EXENCIÓN DEL PO (no es evidencia de ejecución); seguimiento "+str(x["issue"])
            exenciones.append({"agente":nombre,"issue":x["issue"],"referencia_po":x["referencia_po"]})
        exigir("runtime-"+nombre,ok,razon)
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
      "nota_candidatos":"Son filas a analizar, NO obligaciones atómicas verificadas",
      "exenciones_po":exenciones,
      "atomos_revisados":len(atomos),
      "filas_candidatas_sin_cobertura_atomica":len(faltan_cubrir),
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
