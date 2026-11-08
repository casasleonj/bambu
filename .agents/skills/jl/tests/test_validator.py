#!/usr/bin/env python3
"""Pruebas de mutación del contrato ESTÁTICO. No equivalen a ejecución del agente."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE=Path(__file__).resolve().parents[1]
CHECKER=SOURCE/'scripts/check_skill.py'

class ValidatorTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='jl-static-')
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'jl'
        shutil.copytree(SOURCE,self.root,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))

    def check(self,okay:bool):
        p=subprocess.run([sys.executable,str(CHECKER),str(self.root)],text=True,capture_output=True)
        data=json.loads(p.stdout)
        self.assertEqual(p.returncode==0,okay,data)
        return data

    def change(self,old,new):
        path=self.root/'SKILL.md'
        s=path.read_text(encoding='utf8')
        self.assertIn(old,s)
        path.write_text(s.replace(old,new),encoding='utf8')

    def test_original(self):
        out=self.check(True)
        self.assertGreaterEqual(out['defined_eval_cases'],169)
        self.assertEqual(out['actual_agent_executions'],0)

    def test_no_name(self):
        self.change('name: jl\n','')
        self.check(False)

    def test_wrong_name(self):
        self.change('name: jl','name: abc')
        self.check(False)

    def test_duplicate_frontmatter_field(self):
        self.change('name: jl','name: jl\nname: jl')
        self.check(False)

    def test_missing_description(self):
        self.change('description: ','obsolete_description: ')
        self.check(False)

    def test_too_long_description(self):
        self.change('description: "','description: "'+'x'*210)
        self.check(False)

    def test_missing_reference(self):
        (self.root/'references/engineering.md').unlink()
        self.check(False)

    def test_broken_link(self):
        self.change('(references/workflow.md)','(references/missing.md)')
        self.check(False)

    def test_hardcoded_project(self):
        self.change('# JL ·','# Agua Bambú\n# JL ·')
        self.check(False)

    def test_duplicate_eval(self):
        p=self.root/'tests/evals.yaml'
        p.write_text(p.read_text(encoding='utf8')+'\n- id: new-feature\n  mode: INVESTIGAR\n  prompt: x\n  expected: y\n',encoding='utf8')
        self.check(False)

    def test_missing_mode(self):
        self.change('`COMPLETO`','`XCOMPLETO`')
        # Mode present elsewhere in core, so modify globally for conceptual deletion.
        s=(self.root/'SKILL.md').read_text()
        (self.root/'SKILL.md').write_text(re.sub('COMPLETO','NO_MODE',s,flags=re.I),encoding='utf8')
        self.check(False)

    def test_missing_reuse_gate(self):
        self.change('REUSE-1','NO_REUSE_GATE')
        self.check(False)

    def test_missing_phase_event(self):
        self.change('INVESTIGACIÓN TERMINADA','TERMINADA INVESTIGACIÓN')
        self.check(False)

    def test_missing_playwright_scope(self):
        self.change('Playwright', 'NAVEGADOR_GENÉRICO')
        self.check(False)

    def test_missing_browser_tools_reference(self):
        (self.root/'references/browser-tools.md').unlink()
        self.check(False)

    def test_missing_browser_tool_routing(self):
        self.change('agent-browser', 'NAVEGADOR')
        self.check(False)

    def test_missing_qa_start(self):
        self.change('QA DE USUARIO INICIADO', 'QA OMITIDO')
        self.check(False)

    def test_missing_qa_progress(self):
        self.change('QA DE USUARIO EN CURSO', 'SIN PROGRESO')
        self.check(False)

    def test_missing_qa_finish(self):
        self.change('QA DE USUARIO FINALIZADO', 'SIN CIERRE QA')
        self.check(False)

    def test_missing_negative_scope(self):
        self.change('NO QUIERE','INACEPTABLE')
        self.check(False)

    def test_excessive_core(self):
        s=(self.root/'SKILL.md').read_text()
        (self.root/'SKILL.md').write_text(s+'\n'+'Texto redundante '*500,encoding='utf8')
        self.check(False)

    def test_missing_expected_on_one_case(self):
        p=self.root/'tests/evals.yaml'
        s=p.read_text()
        self.assertIn('  expected: ',s)
        p.write_text(s.replace('  expected: ', '  missing_expected: ',1))
        self.check(False)

    def test_malformed_eval_yaml(self):
        p=self.root/'tests/evals.yaml'
        p.write_text(p.read_text()+"\n  : badyaml: [\n")
        self.check(False)

    def test_missing_cross_module_reference(self):
        (self.root/'references/cross-module-consistency.md').unlink()
        self.check(False)

    def test_missing_cross_module_gate(self):
        self.change('XMOD-1', 'SIN_XMOD')
        self.check(False)

    def test_missing_consumer_reconciliation(self):
        self.change('conciliación entre consumidores', 'solo la pantalla original')
        self.check(False)

    def test_missing_semantic_comparability(self):
        self.change('misma métrica', 'cualquier número')
        self.check(False)

    def test_missing_evals(self):
        (self.root/'tests/evals.yaml').unlink()
        self.check(False)

if __name__=='__main__':unittest.main(verbosity=2)
