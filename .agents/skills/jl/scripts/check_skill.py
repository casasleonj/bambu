#!/usr/bin/env python3
"""Validador offline de JL, sin paquetes externos. No implica prueba conductual."""
from pathlib import Path
import json
import re
import sys

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
errors = []
file = root / 'SKILL.md'
content = file.read_text(encoding='utf-8') if file.is_file() else ''
if not content:
    errors.append('missing/empty SKILL.md')
match = re.match(r'\A---\n(.*?)\n---\n', content, re.S)
if not match:
    errors.append('missing/invalid YAML frontmatter')
else:
    frontmatter = match.group(1)
    name_m = re.search(r'^name:\s*([a-z0-9-]+)\s*$', frontmatter, re.M)
    desc_m = re.search(r'^description:\s*\S(.+)$', frontmatter, re.M)
    if not name_m:
        errors.append('missing/invalid name')
    else:
        name = name_m.group(1)
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name):
            errors.append('invalid skill name convention')
        if name != root.name or name != 'jl':
            errors.append('frontmatter name must be jl and match folder jl')
    if not desc_m:
        errors.append('missing description')
    elif len(desc_m.group(1)) > 1024:
        errors.append('description longer than 1024 characters')
if content and len(content.splitlines()) > 500:
    errors.append('SKILL.md > 500 lines')
if '# JL' not in content:
    errors.append('missing visible JL heading')
for term in ('Agua Bambú','casasleonj/bambu','Next.js 16.2.4','Prisma 6.19.3'):
    if term in content:
        errors.append('project hardcode: ' + term)
for name in ('evidence-reuse.md','engineering.md','experience.md','convergence.md','verification-release.md','code-reuse.md','installation.md'):
    if not (root/'references'/name).is_file():
        errors.append('missing conditional reference ' + name)
for path in sorted(root.rglob('*.md')):
    txt = path.read_text(encoding='utf-8')
    # Only links to local markdown within the skill are checked; external links omitted.
    for target in re.findall(r'(?<!!)\[[^]]*\]\(([^)]+\.md)(?:#[^)]*)?\)',txt):
        if '://' in target or target.startswith(('http:', 'https:','mailto:')):
            continue
        resolved=(path.parent / target).resolve()
        if not resolved.is_file() or root not in resolved.parents:
            errors.append('broken/escaping markdown link '+str(path.relative_to(root))+' -> '+target)
    if path.stat().st_size < 40:
        errors.append('empty markdown file '+str(path.relative_to(root)))
eval_file=root/'tests'/'evals.yaml'
ids=[]
if not eval_file.is_file():
    errors.append('missing eval scenarios')
else:
    ids=re.findall(r'^- id:\s*([\w-]+)\s*$', eval_file.read_text(encoding='utf-8'),re.M)
    if len(ids)<68:
        errors.append(f'expected >=68 eval cases, got {len(ids)}')
    if len(set(ids)) != len(ids):
        errors.append('duplicate eval case ids')
    if 'mode:' not in eval_file.read_text(encoding='utf-8'):
        errors.append('evals incomplete')
report={'ok':not errors,'errors':errors,'skill_name':root.name,'skill_lines':len(content.splitlines()),'skill_bytes':len(content.encode('utf-8')),'references':len(list((root/'references').glob('*.md'))),'manual_eval_cases':len(ids)}
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(bool(errors))
