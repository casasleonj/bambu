import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

MOD=Path(__file__).resolve().parents[1]/"check_cutover.py"
spec=importlib.util.spec_from_file_location("check_cutover",MOD)
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

class CutoverTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.repo=self.root/"repo";self.repo.mkdir()
        (self.repo/"AGENTS.md").write_text("synthetic fixture",encoding="utf-8")
        self.matrix=self.root/"matriz.csv";self.ev=self.root/"evidencia.json"
        self.ev.write_text("{}",encoding="utf-8")
        self.matrix.write_text("linea_original,clase,destino,certificacion_semantica\n1,REGLA,docs/x.md,PENDIENTE\n",encoding="utf-8")
    def test_missing_evidence_blocks(self):
        result=gate.evaluar(self.repo,self.matrix,self.ev)
        self.assertEqual(result["estado"],"BLOQUEADO")
    def test_fake_full_review_without_runtime_still_blocks(self):
        with self.matrix.open("w",encoding="utf-8",newline="") as fh:
            w=csv.writer(fh)
            w.writerow(["linea_original","clase","destino","certificacion_semantica"])
            for n in range(1,799):
                w.writerow([n,"REGLA","docs/x.md","VERIFICADA_IDENTICA"])
        result=gate.evaluar(self.repo,self.matrix,self.ev)
        self.assertEqual(result["pendientes_semanticos"],0)
        self.assertEqual(result["estado"],"BLOQUEADO")
        self.assertEqual(next(x for x in result["checks"] if x["id"]=="runtime-codex")["estado"],"FAIL")
    def test_line_marking_cannot_substitute_atomic_review(self):
        with self.matrix.open("w",encoding="utf-8",newline="") as fh:
            w=csv.writer(fh)
            w.writerow(["linea_original","clase","destino","certificacion_semantica"])
            for n in range(1,799):
                w.writerow([n,"REGLA","docs/x.md","VERIFICADA_IDENTICA"])
        result=gate.evaluar(self.repo,self.matrix,self.ev)
        self.assertEqual(result["pendientes_semanticos"],0)
        self.assertEqual(result["atomos_revisados"],0)
        atom=next(x for x in result["checks"] if x["id"]=="obligaciones-atomicas-con-evidencia")
        self.assertEqual(atom["estado"],"FAIL")

    def test_github_blob(self):
        self.assertEqual(gate.blob_sha(b"hello\n"),"ce013625030ba8dba906f756967f9e9ca394464a")
    def test_duplicates_block(self):
        self.matrix.write_text("linea_original,clase,destino,certificacion_semantica\n1,REGLA,docs/a.md,VERIFICADA_IDENTICA\n1,REGLA,docs/a.md,VERIFICADA_IDENTICA\n")
        self.assertEqual(next(x for x in gate.evaluar(self.repo,self.matrix,self.ev)["checks"] if x["id"]=="inventario-integro")["estado"],"FAIL")

    def test_archived_verbatim_source_satisfies_source_gate_only(self):
        from unittest.mock import patch
        folder=self.repo/"docs/agentes/fuente-original"
        folder.mkdir(parents=True)
        names=("00-entrada.md","01-arquitectura-tecnica.md","02-historico-incidencias.md",
               "03-reglas-codigo.md","04-protocolo-anterior.md","05-flujo-entrega-anterior.md")
        blocks=[("BLOQUE-"+str(i)+"\\n").encode("utf-8") for i in range(6)]
        for name,data in zip(names,blocks):
            (folder/name).write_bytes(data)
        with patch.object(gate,"ORIGINAL_BLOB",gate.blob_sha(b"".join(blocks))):
            result=gate.evaluar(self.repo,self.matrix,self.ev)
        source=next(x for x in result["checks"] if x["id"]=="fuente-original-conservada")
        self.assertEqual(source["estado"],"PASS")
        self.assertEqual(result["estado"],"BLOQUEADO")

    def _runtime(self,**cambios):
        import json
        ok={"estado":"PASS","version":"1","traza":"t.jsonl","baseline_sha":"a","candidato_sha":"b"}
        ev={"runtime":{"claude":dict(ok),"codex":{"estado":"EXENTO_POR_PO","referencia_po":"chat PO","issue":"#734"},
                       "opencode":{"estado":"EXENTO_POR_PO","referencia_po":"chat PO","issue":"#734"}}}
        for k,v in cambios.items():
            ev["runtime"][k]=v
        self.ev.write_text(json.dumps(ev),encoding="utf-8")
        r=gate.evaluar(self.repo,self.matrix,self.ev)
        return {x["id"]:x["estado"] for x in r["checks"]},r

    def test_po_waiver_accepted_for_codex_and_opencode_only_with_claude_pass(self):
        checks,r=self._runtime()
        self.assertEqual((checks["runtime-claude"],checks["runtime-codex"],checks["runtime-opencode"]),("PASS","PASS","PASS"))
        self.assertEqual(len(r["exenciones_po"]),2)
        self.assertEqual(r["estado"],"BLOQUEADO")  # el resto de controles sigue exigiéndose

    def test_po_waiver_rejected_without_reference_issue_or_claude_pass(self):
        checks,_=self._runtime(codex={"estado":"EXENTO_POR_PO","issue":"#734"})
        self.assertEqual(checks["runtime-codex"],"FAIL")
        checks,_=self._runtime(opencode={"estado":"EXENTO_POR_PO","referencia_po":"x"})
        self.assertEqual(checks["runtime-opencode"],"FAIL")
        checks,_=self._runtime(claude={"estado":"NO_EJECUTADO"})
        self.assertEqual(checks["runtime-codex"],"FAIL")

    def test_claude_cannot_be_waived(self):
        checks,_=self._runtime(claude={"estado":"EXENTO_POR_PO","referencia_po":"x","issue":"#734"})
        self.assertEqual(checks["runtime-claude"],"FAIL")

    def _atomos(self,filas):
        d=self.repo/"docs/agentes/auditoria-2026-11";d.mkdir(parents=True)
        cols=["id","lineas_origen","clausula_original","significado","clasificacion","condiciones","excepciones",
              "destino_activo","criterio_verificacion","estado_revision","referencia_revisor"]
        with (d/"obligaciones_atomicas.csv").open("w",encoding="utf-8",newline="") as fh:
            w=csv.DictWriter(fh,fieldnames=cols);w.writeheader();w.writerows(filas)
        (self.repo/"docs/x.md").write_text("x",encoding="utf-8")
    def _fila(self,clase,clausula,significado):
        return {"id":"AB-1","lineas_origen":"1","clausula_original":clausula,"significado":significado,"clasificacion":clase,
                "condiciones":"c","excepciones":"e","destino_activo":"docs/x.md","criterio_verificacion":"k",
                "estado_revision":"VERIFICADA","referencia_revisor":"r"}
    def _estado_atomico(self):
        return next(x for x in gate.evaluar(self.repo,self.matrix,self.ev)["checks"] if x["id"]=="obligaciones-atomicas-con-evidencia")["estado"]
    def test_blank_source_line_allowed_only_as_historic_structure(self):
        self._atomos([self._fila("HISTORICO_NO_NORMATIVO","","ESTRUCTURA: separador")])
        self.assertEqual(self._estado_atomico(),"PASS")
    def test_blank_clause_cannot_be_a_vigente_rule(self):
        self._atomos([self._fila("VIGENTE","","ESTRUCTURA: separador")])
        self.assertEqual(self._estado_atomico(),"FAIL")

if __name__=="__main__":
    unittest.main()
