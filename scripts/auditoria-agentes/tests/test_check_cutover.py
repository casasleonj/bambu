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

if __name__=="__main__":
    unittest.main()
