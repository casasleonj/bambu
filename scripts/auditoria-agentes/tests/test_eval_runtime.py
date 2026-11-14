import importlib.util
import unittest
from pathlib import Path

SRC=Path(__file__).resolve().parents[1]/"eval_runtime.py"
spec=importlib.util.spec_from_file_location("ab_eval_runtime",SRC)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class RuntimeEvaluatorTests(unittest.TestCase):
    def test_synthetic_cases_cover_skills_and_nine_invariants(self):
        import json
        cases=json.loads(mod.CASES_PATH.read_text(encoding="utf-8"))
        self.assertEqual(len(cases),21)
        self.assertEqual(len({x["id"] for x in cases}),21)
        invariantes={x["invariante"] for x in cases if x["type"]=="invariant"}
        self.assertEqual(len(invariantes),9)
        self.assertTrue(all(x.get("esperado_regex") for x in cases if x["type"]=="invariant"))
    def test_self_report_does_not_prove_tool_use(self):
        raw='{"type":"message","text":"He cargado la skill jl y leído SKILL.md"}'
        self.assertEqual(mod.scan_tool_calls(raw,"jl"),[])
    def test_explicit_native_tool_call_is_provisional_evidence(self):
        raw='{"type":"tool_use","name":"skill","input":{"id":"jl"}}'
        self.assertEqual(mod.scan_tool_calls(raw,"jl"),["skill-tool"])
    def test_fixture_includes_all_scoped_guides(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            repo=Path(__file__).resolve().parents[3]
            dst=Path(d)/"scratch"
            dst.mkdir()
            mod.fixture(repo,dst)
            for scope in ("src/app/api","src/lib","src/components","src/modules","prisma","e2e"):
                self.assertTrue((dst/scope/"AGENTS.md").is_file(),scope)
                self.assertTrue((dst/".claude/rules"/(scope.split("/")[-1] if scope!="src/app/api" else "api")).with_suffix(".md").is_file())
            self.assertFalse((dst/"src/lib/prisma.ts").exists())
            self.assertTrue((dst/"src/datos-ficticios.md").exists())

    def test_provider_key_is_redacted_from_trace(self):
        secret="sk-TEST-SYNTHETIC-KEY-1234567890"
        raw="tool error: "+secret
        self.assertNotIn(secret,mod.redact(raw,{"OPENAI_API_KEY":secret}))
    def test_redacts_unlisted_token_from_trace(self):
        token="sk-"+"a"*24
        self.assertNotIn(token,mod.redact("error "+token,{}))
        self.assertIn("[REDACTED_TOKEN]",mod.redact("error "+token,{}))
    def test_redacts_github_token_from_trace(self):
        token="ghp_"+"z"*24
        self.assertNotIn(token,mod.redact("error "+token,{}))
    def test_keeps_normal_trace_text(self):
        self.assertEqual(mod.redact("tool read SKILL.md",{}),"tool read SKILL.md")

    def test_redaction_does_not_fake_skill_events(self):
        self.assertEqual(mod.scan_tool_calls(mod.redact('{"type":"message","text":"skill jl"}',{}),"jl"),[])

    def test_no_cli_claimed_in_inventory(self):
        versions=mod.executable_versions()
        self.assertEqual(set(versions),set(mod.AGENTS))
        self.assertNotIn("PASS",str(versions))

if __name__=="__main__":
    unittest.main()
