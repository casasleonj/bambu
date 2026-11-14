import importlib.util
import tempfile
import unittest
from pathlib import Path

src=Path(__file__).resolve().parents[1]/"check_skills.py"
spec=importlib.util.spec_from_file_location("check_skills",src)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class SkillRoutesTests(unittest.TestCase):
    def test_project_routes(self):
        repo=Path(__file__).resolve().parents[3]
        r=mod.analizar(repo)
        self.assertEqual(r["estado"],"PASS_ESTRUCTURAL",str({k:v for k,v in r["checks"].items() if not v}))
    def test_empty_fixture_fails(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(mod.analizar(Path(d))["estado"],"FAIL")
    def test_structural_success_not_claim_runtime_success(self):
        repo=Path(__file__).resolve().parents[3]
        r=mod.analizar(repo)
        self.assertEqual(r["activacion_codex"],"NO_EJECUTADA")
        self.assertEqual(r["activacion_claude"],"NO_EJECUTADA")
        self.assertEqual(r["activacion_opencode"],"NO_EJECUTADA")

if __name__=="__main__":
    unittest.main()
