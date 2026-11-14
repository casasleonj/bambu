import importlib.util
import tempfile
import unittest
from pathlib import Path

F=Path(__file__).resolve().parents[1]/"check_scoped_rules.py"
spec=importlib.util.spec_from_file_location("scope_checker",F)
scope=importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)

class ScopedTests(unittest.TestCase):
    def test_repository_rules_have_valid_paths(self):
        r=scope.verificar(Path(__file__).resolve().parents[3])
        self.assertEqual(r["estado"],"PASS_ESTRUCTURAL",str({k:v for k,v in r["checks"].items() if not v}))
    def test_missing_rules_do_not_pass(self):
        with tempfile.TemporaryDirectory() as d:
            r=scope.verificar(Path(d))
            self.assertEqual(r["estado"],"FAIL")
    def test_one_scoped_file_missing_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/"src/lib").mkdir(parents=True)
            (root/"src/lib/AGENTS.md").write_text("Ámbito: test. Dinero, offline y pickCoords: consumidores")
            r=scope.verificar(root)
            self.assertEqual(r["estado"],"FAIL")
    def test_six_areas(self):
        self.assertEqual(len(scope.AREAS),6)

if __name__=="__main__":
    unittest.main()
