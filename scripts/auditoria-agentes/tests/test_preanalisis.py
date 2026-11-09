import importlib.util
import tempfile
import unittest
from pathlib import Path

src=Path(__file__).resolve().parents[1]/"check_preanalisis.py"
spec=importlib.util.spec_from_file_location("preanalisis",src)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class PreanalysisTests(unittest.TestCase):
    def test_full_candidate_inventory(self):
        repo=Path(__file__).resolve().parents[3]
        result=mod.check(repo)
        self.assertEqual(result["estado"],"PASS_INVENTARIO_PRELIMINAR",result["errores"][:10])
        self.assertEqual(result["cubiertas"],530)
        self.assertEqual(result["clausulas_preanalizadas"],354)
        self.assertEqual(result["extracciones_pendientes"],202)
        self.assertEqual(result["certificaciones_humanas"],0)
        self.assertEqual(result["certificaciones_humanas"],0)
    def test_inventory_redacts_example_credentials(self):
        repo=Path(__file__).resolve().parents[3]
        csvtext=(repo/"docs/agentes/auditoria-2026-11/obligaciones_atomicas.csv").read_text(encoding="utf-8").lower()
        for token in mod.SENSITIVE:
            self.assertNotIn(token,csvtext)
        self.assertEqual(mod.sanitize("admin123 and bambu_dev"),"[REDACTADO] and [REDACTADO]")
    def test_202_classifications_are_present(self):
        repo=Path(__file__).resolve().parents[3]
        result=mod.check(repo)
        self.assertEqual(result["cubiertas"],530)
        self.assertEqual(result["estado"],"PASS_INVENTARIO_PRELIMINAR")
    def test_second_pass_requires_conditions_and_exceptions(self):
        import csv
        repo=Path(__file__).resolve().parents[3]
        with (repo/"docs/agentes/auditoria-2026-11/clasificacion_candidatas_202.csv").open(encoding="utf-8",newline="") as f:
            items=list(csv.DictReader(f))
        self.assertEqual(len(items),202)
        self.assertTrue(all(x["condicion"] and x["excepcion_o_limite"] for x in items))
    def test_missing_files_fail(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(mod.check(Path(d))["estado"],"FAIL")

if __name__=="__main__":
    unittest.main()
