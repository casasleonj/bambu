#!/usr/bin/env python3
"""Evaluador de activación CLI real, aislado y opt-in. Estado por defecto: NO_EJECUTADO.

No marca PASS a partir de declaraciones en la respuesta del modelo.
Requiere revisar cada traza por humano después de ejecutar.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

AGENTS = ("codex", "claude", "opencode")
HERE = Path(__file__).resolve().parent
CASES_PATH = HERE / "casos_activacion.json"

def scan_tool_calls(data, skill):
    """Solo eventos de herramienta reconocibles; texto final nunca prueba activación.

    Cubre los tres envoltorios reales:
      codex      {"item":{"type":"command_execution","command":...,"exit_code":...}}
                 {"item":{"type":"mcp_tool_call","tool":...,"arguments":{...}}}
      claude     {"type":"assistant","message":{"content":[{"type":"tool_use",...}]}}
      opencode   {"part":{"type":"tool","tool":"read","state":{"input":{...}}}}

    Dos reglas que hacen la diferencia entre medir y engañarse:
      1. El envelope anida nombre e input: la búsqueda genérica no lo ve y todo sale [].
      2. Un intento fallido no es una lectura. Si el evento trae exit_code distinto de 0
         o el error de sandbox, se registra como "intento-fallido" y NO cuenta como
         activación. En este entorno bwrap está denegado, así que `cat SKILL.md` sale
         exit=1: contarlo daría 7 activaciones falsas en codex.
    """
    matches=[]
    for line in data.splitlines():
        try:
            ev=json.loads(line)
        except (ValueError, TypeError):
            continue
        stack=[ev]
        while stack:
            o=stack.pop()
            if isinstance(o,list):
                stack.extend(o)
                continue
            if not isinstance(o,dict):
                continue
            name=o.get("tool_name") or o.get("toolName")
            args=o.get("input") or o.get("arguments") or o.get("parameters") or {}
            failed=False
            pending=False
            # Envelope de opencode: {"part":{"type":"tool","tool":"read","state":{"input":{...}}}}
            if o.get("type")=="tool" and isinstance(o.get("tool"),str):
                name=o.get("tool")
                state=o.get("state")
                if isinstance(state,dict):
                    args=state.get("input") or args
                    if state.get("status")=="error":
                        failed=True
            # Envelope de codex: command_execution lleva el comando en "command", no en "input",
            # y mcp_tool_call en "tool"/"arguments". Sin esto codex siempre daba eventos=[].
            if o.get("type")=="command_execution":
                name="command_execution"
                args={"command":o.get("command") or ""}
                code=o.get("exit_code")
                output=str(o.get("aggregated_output") or "")
                # item.started trae exit_code:null y todavía no leyó nada: NO es evidencia.
                # Sólo un exit_code==0 con salida real prueba que el archivo se leyó.
                if code is None:
                    pending=True
                elif code!=0 or not output.strip() or "No permissions to create a new namespace" in output or "bwrap:" in output:
                    failed=True
            if o.get("type")=="mcp_tool_call":
                name=o.get("tool") or o.get("server")
                args=o.get("arguments") or args
                if o.get("error"):
                    failed=True
                result=o.get("result")
                if isinstance(result,dict) and result.get("isError"):
                    failed=True
            if name is None and o.get("type") in ("tool_use","tool_call","function_call","command_execution"):
                name=o.get("name") or o.get("tool")
                if isinstance(name,dict):
                    name=name.get("name")
            param=json.dumps(args,ensure_ascii=False) if isinstance(args,(dict,list)) else str(args)
            if isinstance(name,str):
                n=name.lower().split(".")[-1]
                is_target=False
                kind=None
                if n in ("skill","load_skill","skills") and re.search(r"\b"+re.escape(skill)+r"\b",param,re.I):
                    is_target=True; kind="skill-tool"
                if n in ("read","read_file","readfile","exec_command","shell","bash","command","command_execution") and re.search(r"\b"+re.escape(skill)+r"\b[^\n]*SKILL\.md",param,re.I):
                    is_target=True; kind="read-skill"
                if is_target:
                    if pending:
                        matches.append("pendiente")
                    elif failed:
                        matches.append("intento-fallido")
                    else:
                        matches.append(kind)
            stack.extend(x for x in o.values() if isinstance(x,(dict,list)))
    found=set(matches)
    # Un intento fallido y un éxito del mismo tipo: prevalece el éxito.
    if found & {"skill-tool","read-skill"}:
        found.discard("intento-fallido")
        found.discard("pendiente")
    elif "pendiente" in found:
        found.discard("pendiente")
        found.add("intento-fallido")
    return sorted(found)

def executable_versions():
    result={}
    for n in AGENTS:
        path=shutil.which(n)
        if not path:
            result[n]={"estado":"NO_DISPONIBLE"}
            continue
        try:
            p=subprocess.run([path,"--version"],capture_output=True,text=True,timeout=8)
            result[n]={"estado":"DISPONIBLE_SIN_EJECUTAR","version":(p.stdout or p.stderr).strip()[:180],"exit":p.returncode}
        except (OSError,subprocess.TimeoutExpired) as e:
            result[n]={"estado":"VERSION_NO_VERIFICABLE","error":str(e)[:180]}
    return result

def redact(value,environment):
    for key in ("OPENAI_API_KEY","ANTHROPIC_API_KEY"):
        secret=environment.get(key)
        if secret and len(secret)>=12:
            value=value.replace(secret,"[PROVIDER_KEY_REDACTED]")
    value=re.sub(r"(?i)\b(?:sk-[A-Za-z0-9_-]{18,}|gh[pousr]_[A-Za-z0-9]{20,})\b",
                 "[REDACTED_TOKEN]",value)
    return value

def seed_auth(agent,home):
    """Copia sólo las credenciales del CLI, nunca su configuración global.

    Si el harness aísla HOME y no se copian, el CLI arranca sin token y responde
    401 Unauthorized ("Missing bearer or basic authentication in header"), que el
    evaluador leería como fallo del agente cuando el fallo es del aislamiento.
    Devuelve la lista de rutas sembradas para dejarlo en la traza.
    """
    sources={
        "codex":[(".codex/auth.json",".codex/auth.json")],
        "claude":[(".claude/.credentials.json",".claude/.credentials.json")],
        "opencode":[(".local/share/opencode/auth.json",".local/share/opencode/auth.json")],
    }.get(agent,[])
    seeded=[]
    origin=Path(os.path.expanduser("~")).resolve()
    for src_rel,dst_rel in sources:
        src=origin/src_rel
        if not src.is_file():
            continue
        dst=home/dst_rel
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(src,dst)
        os.chmod(dst,0o600)
        seeded.append(dst_rel)
    return seeded

def cli_command(agent,prompt):
    if agent=="codex":
        return ["codex","exec","--json","--sandbox","read-only","--skip-git-repo-check",prompt]
    if agent=="claude":
        return ["claude","-p",prompt,"--output-format","stream-json","--verbose","--tools","Read,Glob,Grep,Skill","--permission-mode","dontAsk"]
    if agent=="opencode":
        return ["opencode","run","--format","json",prompt]
    raise ValueError(agent)

def fixture(repo,dest):
    for source in ["AGENTS.md","CLAUDE.md","opencode.json",".opencode/prompts/protocolo.txt"]:
        src=repo/source
        if src.is_file():
            dst=dest/source
            dst.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(src,dst)
    # Incluir las reglas por directorio y las reglas Claude path-scoped.
    # Copiar solamente la documentación de instrucciones, jamás datos de la app.
    for scope in ("src/app/api","src/lib","src/components","src/modules","prisma","e2e"):
        rule=repo/scope/"AGENTS.md"
        if rule.is_file():
            destination=dest/scope/"AGENTS.md"
            destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(rule,destination)
    domain=repo/"docs/fiados/656-658-entrega.md"
    if domain.is_file():
        target_domain=dest/"docs/fiados/656-658-entrega.md"
        target_domain.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(domain,target_domain)
    for source in [".claude/rules",".agents/skills/jl",".agents/skills/hallazgo",".claude/skills/jl",".claude/skills/hallazgo","docs/agentes"]:
        src=repo/source
        if src.is_dir():
            shutil.copytree(src,dest/source,dirs_exist_ok=True,symlinks=False)
    settings=dest/"opencode.json"
    settings.write_text(json.dumps({
        "$schema":"https://opencode.ai/config.json",
        "instructions":["AGENTS.md"],
        "permission":{"*":"deny","read":"allow","glob":"allow","grep":"allow",
                      "skill":"allow","edit":"deny","bash":"deny"}
    },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (dest/"src").mkdir(exist_ok=True)
    (dest/"src"/"datos-ficticios.md").write_text("DATOS FICTICIOS: pedido 7, cobro 10, saldo 3; consumidores Cliente, Caja, Dashboard. No realizar modificaciones.\n",encoding="utf-8")
    subprocess.run(["git","init","-q",str(dest)],capture_output=True,check=False,timeout=8)

def execute(repo,out,agent,timeout):
    cases=json.loads(CASES_PATH.read_text(encoding="utf-8"))
    available=executable_versions()
    results=[]
    with tempfile.TemporaryDirectory(prefix="ab-eval-") as d:
        fixture(repo,Path(d))
        for item in cases:
            if agent not in ("all",item.get("agent",agent)):
                continue
            targets=AGENTS if agent=="all" else (agent,)
            for current in targets:
                if available[current]["estado"]!="DISPONIBLE_SIN_EJECUTAR":
                    results.append({"caso":item["id"],"agente":current,"estado":"NO_EJECUTADO_CLI_AUSENTE"})
                    continue
                command=cli_command(current,item["prompt"])
                # HOME/XDG vacíos: nunca heredar MCPs/plugins, auth o hooks globales.
                # Las claves de proveedor solo pasan explícitamente por variables permitidas.
                home=Path(d)/"_sandbox_home"
                home.mkdir(exist_ok=True)
                # CODEX_HOME debe existir: si no, codex aborta con "CODEX_HOME points to
                # <ruta>, but that path does not exist" y los 21 casos fallan con exit 1.
                (home/".codex").mkdir(parents=True,exist_ok=True)
                # El aislamiento de HOME deja al CLI sin credenciales y devuelve 401.
                # Se copian SOLO los ficheros de auth (0600, mismo dueño), nunca el resto
                # de la configuración global: ni MCPs, ni plugins, ni hooks.
                # Debe sembrarse ANTES de construir el entorno que lo apunta.
                copied_auth=seed_auth(current,home)
                environment={k:v for k,v in os.environ.items() if k in
                    ("PATH","LANG","LC_ALL","TERM","OPENAI_API_KEY","ANTHROPIC_API_KEY")}
                environment.update({"CI":"1","HOME":str(home),
                    "XDG_CONFIG_HOME":str(home/".config"),
                    "XDG_DATA_HOME":str(home/".local/share"),
                    "XDG_CACHE_HOME":str(home/".cache"),
                    "CODEX_HOME":str(home/".codex")})
                try:
                    p=subprocess.run(command,cwd=d,env=environment,capture_output=True,text=True,
                                     timeout=timeout,stdin=subprocess.DEVNULL)
                    raw=redact(p.stdout or "",environment)
                    trace=out/(current+"_"+item["id"]+".jsonl")
                    trace.write_text(raw,encoding="utf-8")
                    evidence=scan_tool_calls(raw,item["skill"]) if item.get("skill") else []
                    results.append({"caso":item["id"],"agente":current,
                                    "estado":"TRAZA_PARA_REVISION" if p.returncode==0 else "FALLO_EJECUCION",
                                    "codigo":p.returncode,"eventos_skill":evidence,
                                    "credenciales_sembradas":copied_auth,
                                    "traza":trace.name,"sha256":hashlib.sha256(raw.encode()).hexdigest(),
                                    "stderr_resumen":redact(p.stderr or "",environment)[-350:]})
                except subprocess.TimeoutExpired:
                    results.append({"caso":item["id"],"agente":current,"estado":"TIEMPO_AGOTADO",
                                    "credenciales_sembradas":copied_auth})
    return results

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--repo",type=Path,default=Path("."))
    p.add_argument("--salida",type=Path,default=Path("/tmp/ab-agent-activation"))
    p.add_argument("--execute",action="store_true")
    p.add_argument("--accept-provider-costs",action="store_true")
    p.add_argument("--agent",choices=("all",)+AGENTS,default="all")
    p.add_argument("--timeout",type=int,default=120)
    x=p.parse_args()
    root=x.repo.resolve()
    out=x.salida.resolve()
    if out==root or root in out.parents:
        p.error("Guardar trazas fuera del repositorio para evitar publicar información accidental.")
    if x.execute and not x.accept_provider_costs:
        p.error("--execute exige --accept-provider-costs: invoca modelos reales.")
    out.mkdir(parents=True,exist_ok=True)
    result={"estado":"NO_EJECUTADO","disponibilidad":executable_versions(),
            "casos_declarados":len(json.loads(CASES_PATH.read_text(encoding="utf-8")))}
    if x.execute:
        result["casos"]=execute(root,out,x.agent,x.timeout)
        result["estado"]="REQUIERE_REVISION_HUMANA_DE_TRAZAS"
    (out/"resultado.json").write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({"estado":result["estado"],"casos":result["casos_declarados"],
                      "disponibilidad":result["disponibilidad"]},ensure_ascii=False))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
