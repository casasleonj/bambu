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
    """Solo eventos de herramienta reconocibles; texto final nunca prueba activación."""
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
            if name is None and o.get("type") in ("tool_use","tool_call","function_call"):
                name=o.get("name") or o.get("tool")
                if isinstance(name,dict):
                    name=name.get("name")
            args=o.get("input") or o.get("arguments") or o.get("parameters") or {}
            param=json.dumps(args,ensure_ascii=False) if isinstance(args,(dict,list)) else str(args)
            if isinstance(name,str):
                n=name.lower().split(".")[-1]
                if n in ("skill","load_skill","skills") and re.search(r"\b"+re.escape(skill)+r"\b",param,re.I):
                    matches.append("skill-tool")
                if n in ("read","read_file","exec_command","shell","bash","command") and re.search(r"\b"+re.escape(skill)+r"\b[^\n]*SKILL\.md",param,re.I):
                    matches.append("read-skill")
            stack.extend(x for x in o.values() if isinstance(x,(dict,list)))
    return sorted(set(matches))

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
    value=re.sub(r"(?i)\\b(?:sk-[A-Za-z0-9_-]{18,}|gh[pousr]_[A-Za-z0-9]{20,})\\b",
                 "[REDACTED_TOKEN]",value)
    return value

def cli_command(agent,prompt):
    if agent=="codex":
        return ["codex","exec","--json","--sandbox","read-only",prompt]
    if agent=="claude":
        return ["claude","-p",prompt,"--output-format","stream-json","--tools","Read,Glob,Grep,Skill","--permission-mode","dontAsk"]
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
    for source in [".agents/skills/jl",".agents/skills/hallazgo",".claude/skills/jl",".claude/skills/hallazgo","docs/agentes"]:
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
    (dest/"src").mkdir()
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
                                    "traza":trace.name,"sha256":hashlib.sha256(raw.encode()).hexdigest(),
                                    "stderr_resumen":redact(p.stderr or "",environment)[-350:]})
                except subprocess.TimeoutExpired:
                    results.append({"caso":item["id"],"agente":current,"estado":"TIEMPO_AGOTADO"})
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
