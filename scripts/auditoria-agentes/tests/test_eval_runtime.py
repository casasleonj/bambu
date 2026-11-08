import importlib.util
import unittest
from pathlib import Path

SRC=Path(__file__).resolve().parents[1]/"eval_runtime.py"
spec=importlib.util.spec_from_file_location("ab_eval_runtime",SRC)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class RuntimeEvaluatorTests(unittest.TestCase):
    def test_twelve_synthetic_cases(self):
        import json
        cases=json.loads(mod.CASES_PATH.read_text(encoding="utf-8"))
        self.assertEqual(len(cases),12)
        self.assertEqual(len({x["id"] for x in cases}),12)
    def test_self_report_does_not_prove_tool_use(self):
        raw='{"type":"message","text":"He cargado la skill jl y leído SKILL.md"}'
        self.assertEqual(mod.scan_tool_calls(raw,"jl"),[])
    def test_explicit_native_tool_call_is_provisional_evidence(self):
        raw='{"type":"tool_use","name":"skill","input":{"id":"jl"}}'
        self.assertEqual(mod.scan_tool_calls(raw,"jl"),["skill-tool"])
    def test_no_cli_claimed_in_inventory(self):
        versions=mod.executable_versions()
        self.assertEqual(set(versions),set(mod.AGENTS))
        self.assertNotIn("PASS",str(versions))

if __name__=="__main__":
    unittest.main()
