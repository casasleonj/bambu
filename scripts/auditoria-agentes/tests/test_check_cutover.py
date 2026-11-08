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
    def test_github_blob(self):
        self.assertEqual(gate.blob_sha(b"hello\n"),"ce013625030ba8dba906f756967f9e9ca394464a")
    def test_duplicates_block(self):
        self.matrix.write_text("linea_original,clase,destino,certificacion_semantica\n1,REGLA,docs/a.md,VERIFICADA_IDENTICA\n1,REGLA,docs/a.md,VERIFICADA_IDENTICA\n")
        self.assertEqual(next(x for x in gate.evaluar(self.repo,self.matrix,self.ev)["checks"] if x["id"]=="inventario-integro")["estado"],"FAIL")

if __name__=="__main__":
    unittest.main()
