/**
 * Genera VAPID keys para Web Push.
 *
 * Uso: npx tsx scripts/gen-vapid-keys.ts
 *
 * El output va a consola. Copiar a .env:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_SUBJECT=mailto:admin@aguabambu.com (o un mail real)
 *
 * Las keys son unicas por instalacion. NO commitear las keys al repo.
 * Solo commitear los nombres de las variables a .env.example.
 */
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('# Agregar a .env (NO commitear al repo):')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log(`# Subject es un mail o URL de contacto (RFC 8292):`)
console.log(`VAPID_SUBJECT=mailto:admin@aguabambu.com`)
