import importlib.util
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[1]/"check_modularizacion.py"
sp=importlib.util.spec_from_file_location("modularizacion", SCRIPT)
mod=importlib.util.module_from_spec(sp)
sp.loader.exec_module(mod)

class ModularizacionTest(unittest.TestCase):
    def test_git_blob_known_vector(self):
        self.assertEqual(mod.blob_git(b"hello\n"),"ce013625030ba8dba906f756967f9e9ca394464a")
    def test_exact_six_snapshot_paths(self):
        self.assertEqual(len(mod.PARTES),6)
        self.assertEqual(len(set(mod.PARTES)),6)
    def test_live_project_passes_structural(self):
        repo=Path(__file__).resolve().parents[3]
        res=mod.verificar(repo)
        self.assertEqual(res["resultado"],"PASS_ESTRUCTURAL",str({k:v for k,v in res["controles"].items() if not v}))
    def test_source_gates_are_distinct_from_runtime(self):
        repo=Path(__file__).resolve().parents[3]
        res=mod.verificar(repo)
        self.assertIn("no certifica equivalencia semántica operativa ni activación real",res["evidencia"])
        self.assertNotIn("PASS_RUNTIME",res["resultado"])

if __name__=="__main__":
    unittest.main()
