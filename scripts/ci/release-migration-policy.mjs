// #703 R0 · Interpretación fail-closed del diff NUL de migraciones Prisma.
// Entrada: git diff --name-status --no-renames -z BEFORE AFTER -- prisma/migrations/
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function countNewMigrationFiles(raw) {
  if (!Buffer.isBuffer(raw)) throw new Error('Diff inválido, se esperaba Buffer')
  if (!raw.length) return 0
  const decoded=new TextDecoder('utf-8',{fatal:true}).decode(raw)
  if (!decoded.endsWith('\0')) throw new Error('Diff no termina en NUL')
  const entries=decoded.slice(0,-1).split('\0')
  if (entries.length%2!==0) throw new Error('Diff --name-status malformado')
  let total=0
  for(let i=0;i<entries.length;i+=2){
    const status=entries[i],path=entries[i+1]
    if (status!=='A' || !/^prisma\/migrations\/[A-Za-z0-9_.-]+\/migration\.sql$/.test(path)) {
      throw new Error('Migración histórica modificada, eliminada o archivo inesperado: '+status+
        ' '+String(path).slice(0,120))
    }
    total++
  }
  if(total>1000) throw new Error('Exceso de migraciones nuevas')
  return total
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  try{console.log(countNewMigrationFiles(readFileSync(0)))}
  catch(error){console.error('Clasificador migración: '+error.message);process.exitCode=1}
}
