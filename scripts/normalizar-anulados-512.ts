// Genera SQL revisable a partir de un manifiesto privado; no conecta a una base.
// Uso: npx tsx scripts/normalizar-anulados-512.ts manifiesto-privado.json salida-privada.sql
import { readFileSync, writeFileSync } from 'node:fs'
import { sqlNormalizarAnulados512 } from './lib/normalizar-anulados-512'

const [entrada, salida] = process.argv.slice(2)
if (!entrada || !salida || entrada === salida) throw new Error('Indica manifiesto de entrada y archivo SQL de salida diferentes')
writeFileSync(salida, sqlNormalizarAnulados512(JSON.parse(readFileSync(entrada, 'utf8'))), { mode: 0o600, flag: 'wx' })
