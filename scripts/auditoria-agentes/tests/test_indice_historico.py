import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "check_indice_historico.py"
spec = importlib.util.spec_from_file_location("indice",SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class IndiceTest(unittest.TestCase):
    def test_real_project(self):
        repo=Path(__file__).resolve().parents[3]
        result=mod.verificar(repo)
        self.assertEqual(result["estado"],"PASS_INDICE",result)
    def test_missing_files_are_not_success(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(mod.verificar(Path(d))["estado"],"FAIL")
    def test_corrupt_index_is_not_success(self):
        with tempfile.TemporaryDirectory() as d:
            repo=Path(d)
            folder=repo/"docs/agentes/fuente-original"
            folder.mkdir(parents=True)
            (folder/"02-historico-incidencias.md").write_text("1. **Caso**: texto\n",encoding="utf-8")
            (repo/"docs/agentes/indice-historico-49.md").write_text("| HIST-001 | 1 | Caso | [L1](fuente-original/02-historico-incidencias.md#L1) |\n",encoding="utf-8")
            self.assertEqual(mod.verificar(repo)["estado"],"FAIL")

if __name__=="__main__":
    unittest.main()
