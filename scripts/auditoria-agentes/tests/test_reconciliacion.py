import importlib.util
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[1]/"check_reconciliacion.py"
spec=importlib.util.spec_from_file_location("reconciliacion",SCRIPT)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class ReconciliacionTests(unittest.TestCase):
    def test_preanalisis_real_consistente(self):
        repo=Path(__file__).resolve().parents[3]
        result=mod.evaluar(repo)
        self.assertEqual(result["estado"],"PASS_PREANALISIS",result["errores"][:20])
        self.assertEqual(result["lineas_referenciadas"],798)
        self.assertGreaterEqual(result["clausulas_descompuestas"],190)
    def test_preanalisis_no_significa_certificacion(self):
        repo=Path(__file__).resolve().parents[3]
        r=mod.evaluar(repo)
        self.assertEqual(r["certificaciones_humanas"],0)
        self.assertNotEqual(r["estado"],"APTO_PARA_REVISION_DE_MERGE")

if __name__=="__main__":
    unittest.main()
