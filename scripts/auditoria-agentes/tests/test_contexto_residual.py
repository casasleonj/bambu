import importlib.util
import tempfile
import unittest
from pathlib import Path

file=Path(__file__).resolve().parents[1]/"check_contexto_residual.py"
spec=importlib.util.spec_from_file_location("residual",file)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class ContextoResidualTests(unittest.TestCase):
    def test_64_context_lines(self):
        repo=Path(__file__).resolve().parents[3]
        x=mod.evaluar(repo)
        self.assertEqual(x["estado"],"PASS_PREANALISIS_RESIDUAL",x["errores"])
        self.assertEqual(x["posiciones"],64)
    def test_missing_source_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(mod.evaluar(Path(d))["estado"],"FAIL")
