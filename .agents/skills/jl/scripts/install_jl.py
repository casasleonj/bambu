#!/usr/bin/env python3
"""Instalador/validador offline y reversible de JL para agentes de código.

Python >=3.9; biblioteca estándar. No usa red, no toca repos si --scope=user.
Uso desde la carpeta descomprimida: python3 jl/scripts/install_jl.py --agent all --scope user
El agente debe poder acceder al paquete y tener permisos en las ubicaciones elegidas.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone

SOURCE = Path(__file__).resolve().parents[1]
EXCLUDE = {'__pycache__', '.DS_Store', 'Thumbs.db'}


def files_fingerprint(path: Path) -> str:
    """Compara contenido real (no mtime); no sigue symlinks dentro del paquete."""
    digest = hashlib.sha256()
    for entry in sorted(path.rglob('*')):
        if entry.name in EXCLUDE or any(x in EXCLUDE for x in entry.parts):
            continue
        if entry.is_symlink():
            raise ValueError(f'Enlace simbólico inesperado dentro del skill: {entry}')
        if entry.is_file():
            rel = entry.relative_to(path).as_posix()
            digest.update(rel.encode('utf-8') + b'\0')
            digest.update(hashlib.sha256(entry.read_bytes()).digest())
    return digest.hexdigest()


def validate(source: Path) -> dict:
    if source.name != 'jl' or not (source / 'SKILL.md').is_file():
        raise ValueError('Paquete inválido: debe existir jl/SKILL.md')
    head = (source / 'SKILL.md').read_text(encoding='utf-8')
    if not re.search(r'^name:\s*jl\s*$', head, re.M):
        raise ValueError('Identificador interno no coincide con jl')
    version_match = re.search(r'^\s*version:\s*["\']?([\d.]+)', head, re.M)
    return {'name': 'jl', 'version': version_match.group(1) if version_match else 'sin-version',
            'sha256': files_fingerprint(source)}


def targets(agent: str, scope: str, project: Path, home: Path) -> list[tuple[str, Path, str]]:
    """(tipo, ruta, modalidad): all usa directorio común + enlace Claude."""
    if scope == 'project':
        roots = {
            'codex': project / '.agents' / 'skills' / 'jl',
            'claude': project / '.claude' / 'skills' / 'jl',
            'opencode': project / '.opencode' / 'skills' / 'jl',
        }
    else:
        roots = {
            'codex': home / '.agents' / 'skills' / 'jl',
            'claude': home / '.claude' / 'skills' / 'jl',
            'opencode': home / '.config' / 'opencode' / 'skills' / 'jl',
        }
    if agent == 'all':
        # OpenCode reconoce .agents/skills, evita una tercera copia.
        return [('Codex + OpenCode', roots['codex'], 'copy'),
                ('Claude Code', roots['claude'], 'link')]
    return [(agent, roots[agent], 'copy')]


def same_content(destination: Path, source_hash: str) -> bool:
    if not destination.is_dir():
        return False
    try:
        return validate(destination)['sha256'] == source_hash
    except (ValueError, OSError):
        return False


def move_to_backup(dest: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = dest.parent / f'.jl-backup-{stamp}-{os.getpid()}'
    if backup.exists() or backup.is_symlink():
        raise ValueError(f'Backup ya existe, no se sobrescribe: {backup}')
    dest.rename(backup)
    return backup


def install_dir(src: Path, dest: Path, src_hash: str, replace: bool, dry: bool) -> dict:
    if dest.is_symlink():
        raise ValueError(f'Destino es symlink: {dest}. Inspeccionar manualmente, no reemplazar a ciegas.')
    if dest.exists():
        if same_content(dest, src_hash):
            return {'path': str(dest), 'status': 'ya instalado, idéntico'}
        if not replace:
            raise ValueError(f'Existe JL diferente en {dest}. Revisar cambios y repetir con --replace si se autoriza.')
    if dry:
        return {'path': str(dest), 'status': 'plan: instalar copia' + (' y respaldar existente' if dest.exists() else '')}
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix='.jl-install-', dir=dest.parent))
    backup = None
    try:
        shutil.copytree(src, temp / 'jl', symlinks=False, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store', 'Thumbs.db'))
        staged = temp / 'jl'
        if validate(staged)['sha256'] != src_hash:
            raise ValueError('Los archivos copiados no coinciden con el origen')
        if dest.exists():
            backup = move_to_backup(dest)
        staged.rename(dest)
        if not same_content(dest, src_hash):
            raise ValueError('La instalación no coincide con el paquete')
        return {'path': str(dest), 'status': 'instalado', 'backup': str(backup) if backup else None}
    except Exception:
        # No destruir datos previos ante un fallo. Restaurar backup si el destino se creó.
        if backup and backup.exists():
            if dest.exists() and not dest.is_symlink():
                shutil.rmtree(dest)
            backup.rename(dest)
        raise
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def install_link(target: Path, dest: Path, replace: bool, dry: bool) -> dict:
    if dest.is_symlink():
        if dest.resolve() == target.resolve():
            return {'path': str(dest), 'status': 'enlace compartido existente'}
        if not replace:
            raise ValueError(f'Existe un enlace distinto: {dest}. No se cambia sin --replace.')
    elif dest.exists():
        if not replace:
            raise ValueError(f'Existe un JL independiente en {dest}. No se sustituye sin --replace.')
    if dry:
        return {'path': str(dest), 'status': f'plan: enlace a {target}' + (' y respaldar existente' if dest.exists() or dest.is_symlink() else '')}
    dest.parent.mkdir(parents=True, exist_ok=True)
    backup = None
    try:
        if dest.exists() or dest.is_symlink():
            backup = move_to_backup(dest)
        os.symlink(os.path.relpath(target, dest.parent), dest, target_is_directory=True)
        if not dest.is_dir() or dest.resolve() != target.resolve():
            raise ValueError(f'No se pudo verificar el enlace de Claude: {dest}')
        return {'path': str(dest), 'status': 'enlace compartido creado', 'backup': str(backup) if backup else None}
    except Exception:
        if dest.is_symlink():
            dest.unlink()
        if backup and backup.exists():
            backup.rename(dest)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description='Instalar y verificar JL sin red ni dependencias')
    parser.add_argument('--agent', choices=['codex', 'claude', 'opencode', 'all'], required=True)
    parser.add_argument('--scope', choices=['user', 'project'], default='user')
    parser.add_argument('--project', type=Path, default=Path.cwd())
    parser.add_argument('--home', type=Path, default=Path.home(), help=argparse.SUPPRESS)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--replace', action='store_true', help='Respaldar y reemplazar JL diferente tras autorización')
    opts = parser.parse_args()
    result = {'ok': False, 'operation': 'verify' if opts.verify else 'dry-run' if opts.dry_run else 'install',
              'agent': opts.agent, 'scope': opts.scope, 'items': []}
    try:
        if opts.scope == 'project' and not opts.project.is_dir():
            raise ValueError(f'No existe el directorio del proyecto: {opts.project}')
        meta = validate(SOURCE)
        result['package'] = meta
        dests = targets(opts.agent, opts.scope, opts.project.resolve(), opts.home.expanduser().resolve())
        # Antes de instalar múltiples agentes, comprobar que NO haya conflictos
        # en ningún destino. Evita instalar Codex y fallar luego en Claude.
        if opts.agent == 'all' and not opts.dry_run and not opts.verify:
            canonical = dests[0][1]
            for _, planned, mode in dests:
                if mode == 'copy':
                    install_dir(SOURCE, planned, meta['sha256'], opts.replace, True)
                else:
                    install_link(canonical, planned, opts.replace, True)
        for kind, dest, mode in dests:
            # Multi-agent: canonical at first position, claude link to canonical.
            canonical = dests[0][1] if opts.agent == 'all' else dest
            if opts.verify:
                if not (dest.is_dir() and same_content(dest, meta['sha256'])):
                    raise ValueError(f'JL ausente o diferente en {dest}')
                if mode == 'link' and (not dest.is_symlink() or dest.resolve() != canonical.resolve()):
                    raise ValueError(f'Claude no apunta al directorio compartido: {dest}')
                rec = {'path': str(dest), 'status': 'verificado'}
            elif mode == 'copy':
                rec = install_dir(SOURCE, dest, meta['sha256'], opts.replace, opts.dry_run)
            else:
                rec = install_link(canonical, dest, opts.replace, opts.dry_run)
            rec['agent'] = kind
            result['items'].append(rec)
        result['ok'] = True
        result['next'] = 'Iniciar nueva sesión del agente y verificar su catálogo y lectura real de jl/SKILL.md. Esta prueba no puede automatizarse aquí.'
    except Exception as error:
        result['error'] = str(error)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
