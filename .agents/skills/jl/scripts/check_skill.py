#!/usr/bin/env python3
"""Validador estático sin dependencias externas. NO evalúa obediencia de agentes.

Comprobar estructura/contrato y correspondencia de cobertura; la verificación
conductual debe ejecutarse separadamente con un agente real.
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
ERRORS: list[str] = []


def fail(message: str):
    ERRORS.append(message)


def text(path: Path) -> str:
    if not path.is_file() or path.is_symlink():
        fail(f'Archivo ausente o symlink: {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}')
        return ''
    try:
        return path.read_text(encoding='utf-8')
    except (UnicodeError, OSError) as err:
        fail(f'Archivo ilegible: {path}: {err}')
        return ''


SKILL = text(ROOT/'SKILL.md')
fm = re.match(r'\A---\r?\n(.*?)\r?\n---\r?\n', SKILL, re.S)
meta = {}
if not fm:
    fail('Frontmatter YAML ausente o mal formado')
else:
    for line in fm.group(1).splitlines():
        if line and not line.startswith((' ', '\t')):
            if ':' not in line:
                fail(f'Campo frontmatter inválido: {line}')
                continue
            key, val = line.split(':',1)
            key = key.strip()
            if key in meta:
                fail(f'Campo frontmatter duplicado: {key}')
            meta[key] = val.strip().strip('"\'')
    name = meta.get('name', '')
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) or name != ROOT.name or name != 'jl':
        fail('name debe ser jl y coincidir con la carpeta')
    desc = meta.get('description','')
    if not desc or len(desc) > 1024:
        fail('description inválida, vacía o >1024 caracteres')
    if len(desc) > 200:
        fail('description >200 caracteres: optimizar descubrimiento entre clientes')

if len(SKILL.splitlines()) > 500 or len(SKILL.encode('utf-8')) > 12000:
    fail('Punto de entrada excesivo (>500 líneas o >12 KB), revisar carga progresiva')

# Contrato esencial: una prueba de presencia detecta omisiones, NO prueba conducta.
CONTRACT = {
    'modos': ['INVESTIGAR', 'IMPLEMENTAR', 'VALIDAR', 'COMPLETO', 'LOTE', 'INSTALAR'],
    'etapas': ['INVESTIGANDO', 'IMPLEMENTANDO', 'VALIDANDO', 'INVESTIGACIÓN TERMINADA', 'IMPLEMENTACIÓN TERMINADA', 'VALIDACIÓN TERMINADA', 'BLOQUEADA', 'REABIERTA'],
    'qa_navegador': ['Playwright','QA DE USUARIO INICIADO', 'QA DE USUARIO EN CURSO', 'QA DE USUARIO FINALIZADO', 'QA DE USUARIO PENDIENTE', 'flujo en curso','agent-browser'],
    'alcance': ['QUIERE', 'NO QUIERE', 'PRESERVAR', 'FUERA DE ALCANCE', 'ACEPTACIÓN'],
    'tecnicas': ['DOC-1','DOC-2','REUSE-1','REUSE-2','XMOD-1','XMOD-2','XMOD-3','Context7','convergencia'],
    'seguridad': ['producción','QA','autorización','regresión','baseline','evidencia'],
    'transversal': ['cross-module-consistency.md','consumidores indirectos','conciliación entre consumidores','misma métrica'],
    'escenarios': ['ESC-1','ESC-2','ESC-3','MAPA DE ESCENARIOS DESCUBIERTOS','escenarios-impacto-usuario.md','siguiente operación','reversas'],
    'sintesis': ['SYN-1','SYN-2','escenarios ESC','investigar soluciones existentes','antes del plan','no se pregunten otra vez'],
    'comunicacion_usuario': ['comunicacion-usuario.md','antes → acción','ejemplo concreto','hipotético','maquetas','pruebas de agente','definidas vs ejecutadas', 'qué ocurre, qué significa para el usuario y qué sigue'],
}
for group, words in CONTRACT.items():
    for word in words:
        if word.casefold() not in SKILL.casefold():
            fail(f'Contrato ausente ({group}): {word}')

# Los gates de síntesis deben existir en sus referencias reales, no solo mencionarse en SKILL.
for path,required in {
    'references/evidence-reuse.md':['SYN-1','SYN-2','empresas','comunidad','ESC','REUSE','XMOD','No reabrir decisiones existentes'],
    'references/escenarios-impacto-usuario.md':['SYN-1','SYN-2','precedentes externos','sin volver a preguntarla'],
    'references/user-feedback.md':['no autoridad para deshacer una decisión'],
}.items():
    document=text(ROOT/path)
    for phrase in required:
        if phrase.casefold() not in document.casefold():
            fail(f'Síntesis faltante en {path}: {phrase}')

for term in ['casasleonj/bambu','Agua Bambú','Next.js 16.2.4','Prisma 6.19.3','e2e/rutas.spec.ts']:
    if term in SKILL:
        fail(f'Acoplamiento de proyecto: {term}')

# Referencias relativas desde cada markdown; bloquear escapes fuera de la raíz.
for path in ROOT.rglob('*.md'):
    if path.is_symlink():
        fail(f'Markdown symlink inesperado: {path}')
        continue
    body = text(path)
    for target in re.findall(r'(?<!!)\[[^\]]*\]\(([^)]+)\)', body):
        address = target.split('#',1)[0]
        if not address or '://' in address or address.startswith(('mailto:','#')):
            continue
        if not address.endswith('.md'):
            continue
        dest = (path.parent/address).resolve()
        if not dest.is_file() or (dest != ROOT and ROOT not in dest.parents):
            fail(f'Link local roto/fuera de skill: {path.relative_to(ROOT)} -> {target}')

refs = ['workflow','user-feedback','code-reuse','evidence-reuse','engineering','convergence','experience','verification-release','browser-tools','installation','cross-module-consistency','comunicacion-usuario','escenarios-impacto-usuario']
for r in refs:
    if not (ROOT/'references'/f'{r}.md').is_file():
        fail(f'Referencia obligatoria ausente: {r}.md')
    if f'references/{r}.md' not in SKILL:
        fail(f'Entrada no descubre referencia {r}.md')
if not (ROOT/'assets'/'report.md').is_file():
    fail('Plantilla adaptable ausente')

# Validación acotada del YAML del catálogo (formato simple de casos, sin dependencia PyYAML).
# El test externo con PyYAML comprueba además el parseo sintáctico integral.
evals = text(ROOT/'tests'/'evals.yaml')
ids = re.findall(r'^- id:\s*([\w-]+)\s*$', evals, re.M)
if len(ids) < 215 or len(ids) != len(set(ids)):
    fail(f'Casos de evaluación insuficientes/duplicados: total={len(ids)}, únicos={len(set(ids))}')
for block in re.split(r'(?=^- id:)', evals, flags=re.M):
    if not block.startswith('- id:'):
        continue
    for field in ('mode', 'prompt', 'expected'):
        if not re.search(r'^\s*'+field+r':\s*\S', block, re.M):
            fail(f'Caso sin campo {field}: {block.splitlines()[0]}')
try:
    import yaml  # opcional: aumenta certeza sintáctica, sin bloquear ejecución del skill sin PyYAML
except ImportError:
    yaml_parsed = False
else:
    yaml_parsed = True
    try:
        doc = yaml.safe_load(evals)
        cases = doc['cases']
        if not isinstance(cases, list) or len(cases) != len(ids):
            fail('Catálogo YAML con tamaño o estructura incoherente')
        elif any(not isinstance(c,dict) or any(not isinstance(c.get(x),str) or not c[x] for x in ('id','mode','prompt','expected')) for c in cases):
            fail('Caso YAML con campos no válidos')
    except (ValueError, TypeError, KeyError, yaml.YAMLError) as exc:
        fail(f'Catálogo YAML no parseable: {exc}')
report = {'ok':not ERRORS, 'errors':ERRORS,'skill':ROOT.name,
          'entry_bytes':len(SKILL.encode('utf-8')),'entry_lines':len(SKILL.splitlines()),
          'references':len(list((ROOT/'references').glob('*.md'))),
          'defined_eval_cases':len(ids), 'yaml_semantic_parse':yaml_parsed,
          'actual_agent_executions':0,
          'notes':'El validador estructural no prueba activación ni ejecución conductual.'}
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if ERRORS else 0)
