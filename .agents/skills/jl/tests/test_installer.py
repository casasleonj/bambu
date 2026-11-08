#!/usr/bin/env python3
"""Pruebas REALES del instalador JL usando temporales; no instala en HOME del usuario."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest
import importlib.util
import contextlib
import io
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'install_jl.py'


class InstallerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='jl-test-')
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name) / 'home'
        self.home.mkdir()
        self.repo = Path(self.tmp.name) / 'repo'
        self.repo.mkdir()

    def invoke(self, agent='all', scope='user', *flags, ok=True):
        cmd = [sys.executable, str(SCRIPT), '--agent', agent, '--scope', scope,
               '--home', str(self.home), '--project', str(self.repo), *flags]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        try:
            obj = json.loads(proc.stdout)
        except json.JSONDecodeError:
            self.fail(f'Mala salida JSON: {proc.stdout} {proc.stderr}')
        self.assertEqual(proc.returncode == 0, ok, obj)
        return obj

    def test_global_install_all_shared_link_and_verify(self):
        self.invoke()
        canonical = self.home / '.agents/skills/jl'
        claude = self.home / '.claude/skills/jl'
        self.assertTrue((canonical / 'SKILL.md').is_file())
        self.assertTrue(claude.is_symlink())
        self.assertEqual(claude.resolve(), canonical.resolve())
        self.invoke('all', 'user', '--verify')
        self.assertFalse((self.repo / '.agents').exists())

    def test_local_install_only_target_repo(self):
        self.invoke('claude', 'project')
        self.assertTrue((self.repo / '.claude/skills/jl/SKILL.md').is_file())
        self.assertFalse((self.home / '.claude').exists())
        self.invoke('claude', 'project', '--verify')

    def test_preview_never_writes(self):
        self.invoke('all', 'user', '--dry-run')
        self.assertEqual(list(self.home.iterdir()), [])
        self.assertEqual(list(self.repo.iterdir()), [])

    def test_identical_install_is_idempotent(self):
        self.invoke('codex')
        j = self.invoke('codex')
        self.assertIn('idéntico', j['items'][0]['status'])
        self.assertFalse(list((self.home / '.agents/skills').glob('.jl-backup-*')))

    def test_different_version_is_not_overwritten(self):
        self.invoke('codex')
        target = self.home / '.agents/skills/jl/SKILL.md'
        target.write_text(target.read_text() + '\n# Cambio local\n')
        self.invoke('codex', 'user', ok=False)
        self.assertIn('Cambio local', target.read_text())

    def test_explicit_replacement_keeps_backup(self):
        self.invoke('codex')
        target = self.home / '.agents/skills/jl/SKILL.md'
        target.write_text(target.read_text() + '\n# Cambio local\n')
        j = self.invoke('codex', 'user', '--replace')
        backup = Path(j['items'][0]['backup'])
        self.assertTrue((backup / 'SKILL.md').is_file())
        self.assertIn('Cambio local', (backup / 'SKILL.md').read_text())
        self.assertNotIn('Cambio local', target.read_text())
        self.invoke('codex', 'user', '--verify')

    def test_mismatched_link_blocks_without_replace(self):
        other = self.home / 'other'
        other.mkdir()
        dest = self.home / '.claude/skills/jl'
        dest.parent.mkdir(parents=True)
        dest.symlink_to(other, target_is_directory=True)
        self.invoke('all', 'user', ok=False)
        self.assertEqual(dest.resolve(), other.resolve())

    def test_multiagent_conflict_does_not_leave_partial_install(self):
        other = self.home / 'separate-claude'
        other.mkdir()
        destination = self.home / '.claude/skills/jl'
        destination.parent.mkdir(parents=True)
        destination.symlink_to(other, target_is_directory=True)
        self.invoke('all', 'user', ok=False)
        self.assertFalse((self.home / '.agents/skills/jl').exists())
        self.assertEqual(destination.resolve(), other.resolve())

    def test_legacy_skill_not_deleted_by_install(self):
        legacy = self.home / '.agents/skills/old-skill'
        legacy.mkdir(parents=True)
        (legacy / 'SKILL.md').write_text('legacy data')
        self.invoke('all')
        self.assertEqual((legacy / 'SKILL.md').read_text(), 'legacy data')

    def test_source_not_found_would_not_report_success(self):
        self.invoke('claude', 'user', '--verify', ok=False)

    def test_opencode_native(self):
        self.invoke('opencode')
        self.assertTrue((self.home / '.config/opencode/skills/jl/SKILL.md').is_file())
        self.invoke('opencode', 'user', '--verify')

    def test_rollback_after_second_target_failure(self):
        # Inyectar fallo AL CREAR enlace después de instalar el primer destino.
        path = SCRIPT
        spec = importlib.util.spec_from_file_location('jl_installer_test', path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        args = ['installer','--agent','all','--scope','user','--home',str(self.home)]
        with patch.object(sys, 'argv', args), patch.object(mod.os, 'symlink', side_effect=OSError('fallo simulado')):
            buff=io.StringIO()
            with contextlib.redirect_stdout(buff):
                code=mod.main()
        result=json.loads(buff.getvalue())
        self.assertEqual(code,1)
        self.assertTrue(result.get('rollback_attempted'))
        self.assertEqual(result['rollback_errors'],[])
        self.assertFalse((self.home/'.agents/skills/jl').exists())
        self.assertFalse((self.home/'.claude/skills/jl').exists())

    def test_rollback_restores_updated_installation(self):
        self.invoke('codex')
        target=self.home/'.agents/skills/jl/SKILL.md'
        target.write_text(target.read_text()+'\n# personalización del usuario\n')
        spec=importlib.util.spec_from_file_location('jl_installer_test2', SCRIPT)
        mod=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        args=['installer','--agent','all','--scope','user','--home',str(self.home),'--replace']
        with patch.object(sys, 'argv', args), patch.object(mod.os,'symlink',side_effect=OSError('fallo simulado')):
            buff=io.StringIO()
            with contextlib.redirect_stdout(buff):
                code=mod.main()
        result=json.loads(buff.getvalue())
        self.assertEqual(code,1)
        self.assertEqual(result.get('rollback_errors'),[])
        self.assertIn('personalización del usuario',target.read_text())

    def test_source_pinned_name_jl(self):
        head = (SCRIPT.parent.parent / 'SKILL.md').read_text()
        self.assertIn('name: jl', head)


if __name__ == '__main__':
    unittest.main(verbosity=2)
