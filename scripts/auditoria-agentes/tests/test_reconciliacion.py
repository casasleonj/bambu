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
        self.assertEqual(result["clausulas_descompuestas"],354)
        self.assertEqual(result["pasajes_pendientes"],0)
        self.assertEqual(result["contextos_pendientes"],456)
        self.assertEqual(result["evidencia_codigo_acotada"],27)
    def test_rejects_altered_source_and_fake_semantic_attestation(self):
        import shutil
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            src=Path(__file__).resolve().parents[3]
            dst=Path(d)
            rel=[
                "docs/agentes/auditoria-2026-11/revision_fuente_798.csv",
                "docs/agentes/contratos-operativos.md",
                *[f"docs/agentes/fuente-original/{x}" for x in (
                    "00-entrada.md", "01-arquitectura-tecnica.md",
                    "02-historico-incidencias.md", "03-reglas-codigo.md",
                    "04-protocolo-anterior.md", "05-flujo-entrega-anterior.md")]
            ]
            for filename in rel:
                to=dst/filename
                to.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(src/filename,to)
            target=dst/"docs/agentes/fuente-original/00-entrada.md"
            text=target.read_text(encoding="utf-8")
            target.write_text(text.replace("ANTES de escribir", "DESPUÉS de escribir"),encoding="utf-8")
            result=mod.evaluar(dst)
            self.assertEqual(result["estado"],"FAIL")
            self.assertTrue(any("cita no coincide" in e for e in result["errores"]))
    def test_explicit_semantic_corrections_require_trace(self):
        repo=Path(__file__).resolve().parents[3]
        result=mod.evaluar(repo)
        self.assertEqual(result["estado"],"PASS_PREANALISIS",result["errores"])
    def test_a_source_that_is_only_archived_is_not_runtime_proof(self):
        repo=Path(__file__).resolve().parents[3]
        result=mod.evaluar(repo)
        self.assertEqual(result["certificaciones_humanas"],0)
        self.assertGreater(result["clausulas_sin_comparacion_main"],300)
        self.assertNotEqual(result["estado"],"PASS_SEMANTICO")

    def test_preanalisis_no_significa_certificacion(self):
        repo=Path(__file__).resolve().parents[3]
        r=mod.evaluar(repo)
        self.assertEqual(r["certificaciones_humanas"],0)
        self.assertNotEqual(r["estado"],"APTO_PARA_REVISION_DE_MERGE")

if __name__=="__main__":
    unittest.main()
