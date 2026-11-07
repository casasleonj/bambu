#!/usr/bin/env python3
"""Pruebas adversariales estructurales de JL. No ejecuta agentes."""
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil
import subprocess
import sys
import re

root=Path(__file__).resolve().parents[1]
check=root/'scripts'/'check_skill.py'

def run_on(mutation=None):
    with TemporaryDirectory() as directory:
        dest=Path(directory)/'jl'
        shutil.copytree(root,dest)
        if mutation:
            mutation(dest)
        result=subprocess.run([sys.executable,str(check),str(dest)],capture_output=True,text=True)
        return result.returncode,result.stdout

def add_broken_link(p):
    f=p/'SKILL.md';f.write_text(f.read_text(encoding='utf-8')+'\n[broken](references/unknown.md)\n',encoding='utf-8')

def drop_desc(p):
    f=p/'SKILL.md';f.write_text(re.sub(r'^description:.*$', 'other_field: text',f.read_text(encoding='utf-8'),count=1,flags=re.M),encoding='utf-8')

def incorrect_name(p):
    f=p/'SKILL.md';f.write_text(f.read_text(encoding='utf-8').replace('name: jl','name: other-name',1),encoding='utf-8')

def wrong_folder(p):
    # A mismatching folder is structurally invalid even with a valid manifest.
    f=p/'SKILL.md';f.write_text(f.read_text(encoding='utf-8').replace('name: jl','name: jl-other',1),encoding='utf-8')

def hardcode(p):
    f=p/'SKILL.md';f.write_text(f.read_text(encoding='utf-8')+'\nAgua Bambú depends on Next.js 16.2.4\n',encoding='utf-8')

def duplicate_eval(p):
    f=p/'tests'/'evals.yaml';f.write_text(f.read_text(encoding='utf-8')+'\n- id: new-feature\n  mode: INVESTIGAR\n  prompt: repetido\n  expected: duplicado\n',encoding='utf-8')

def remove_ref(p):
    (p/'references'/'code-reuse.md').unlink()

checks={'original válido':(None,True),'enlace roto':(add_broken_link,False),'sin descripción':(drop_desc,False),'nombre incorrecto':(incorrect_name,False),'carpeta/no metadata':(wrong_folder,False),'proyecto fijado':(hardcode,False),'evaluación duplicada':(duplicate_eval,False),'referencia ausente':(remove_ref,False)}
for label,(mutation,ok) in checks.items():
    rc,stdout=run_on(mutation)
    assert (rc==0)==ok,(label,stdout)
    print('PASS',label)
