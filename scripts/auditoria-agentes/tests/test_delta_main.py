import importlib.util
import unittest
from pathlib import Path

src=Path(__file__).resolve().parents[1]/"check_delta_main.py"
spec=importlib.util.spec_from_file_location("delta_main",src)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class MainDeltaTests(unittest.TestCase):
    def test_new_main_obligations_are_preserved(self):
        repo=Path(__file__).resolve().parents[3]
        r=mod.evaluar(repo)
        self.assertEqual(r["estado"],"PASS_DELTA_DOCUMENTAL",r["motivos"])
        self.assertEqual(r["lineas_de_main"],9)
    def test_unavailable_repo_never_passes(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(mod.evaluar(Path(d))["estado"],"FAIL")

if __name__=="__main__":
    unittest.main()
