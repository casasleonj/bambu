#!/usr/bin/env node
/**
 * Wrapper de `next dev` que auto-detecta la IP LAN y la inyecta como
 * NEXT_PUBLIC_DEV_LAN_ORIGIN antes de arrancar el dev server.
 *
 * ¿Por qué?
 * - Next.js 16 bloquea requests cross-origin en dev con "Blocked
 *   cross-origin request" salvo que la IP esté en `allowedDevOrigins`.
 * - Hardcodear la IP en .env requiere editarla cada vez que cambia
 *   la red WiFi del usuario (típico en desarrollo).
 * - Este script detecta automáticamente la IP LAN al iniciar y la
 *   pasa al server, sin tocar archivos.
 *
 * Uso:
 *   $ npm run dev                    # Auto-detecta IP LAN
 *   $ NEXT_PUBLIC_DEV_LAN_ORIGIN=192.168.1.4 npm run dev   # Override manual
 *
 * Criterios de detección:
 *   1. Solo IPv4 (excluye IPv6)
 *   2. Excluye loopback (127.0.0.1)
 *   3. Excluye Docker bridges (br-*, veth*, docker0) y similares
 *   4. Prioriza wireless/ethernet (wlo*, wlp*, wlan*, eth*, eno*, enp*)
 *   5. Entre RFC1918 (192.168.x.x, 10.x.x.x, 172.16-31.x.x),
 *      prefiere 192.168 > 10 > 172
 *
 * Si no detecta ninguna IP, el server arranca normalmente (solo localhost).
 *
 * Salida: muestra la IP detectada en stderr antes de spawn-ear Next.
 */

import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'

/**
 * Detecta la IP LAN más probable del equipo.
 *
 * @returns {string|null} IP detectada, o null si no hay.
 */
function detectLanIp() {
  const nets = networkInterfaces()
  const candidates = []

  // Patrones de interfaces reales (no virtuales)
  const realInterfacePattern = /^(wlo|wlp|wlan|wlx|eth|eno|enp|ens|em)[a-z0-9]*$/i
  // Patrones de interfaces a excluir (Docker, VPN, virtual)
  const virtualInterfacePattern = /^(br-|veth|docker|virbr|vmnet|tun|tap|wg)/i

  for (const name of Object.keys(nets)) {
    // Filtrar por nombre de interfaz
    if (virtualInterfacePattern.test(name)) continue
    if (!realInterfacePattern.test(name)) {
      // Si no matchea ningún patrón conocido, skipear por seguridad
      continue
    }

    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4') continue
      if (net.internal) continue // loopback (127.0.0.1)
      candidates.push({ name, ip: net.address })
    }
  }

  if (candidates.length === 0) return null

  // Priorizar 192.168 > 10 > 172.16-31
  const pref = (c) => {
    if (c.ip.startsWith('192.168.')) return 0
    if (c.ip.startsWith('10.')) return 1
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(c.ip)) return 2
    return 3
  }

  candidates.sort((a, b) => pref(a) - pref(b))
  return candidates[0].ip
}

// ─── Main ────────────────────────────────────────────────────────────────

const detectedIp = detectLanIp()

// Si el usuario ya seteo la env var manualmente, respetarla
const existingIp = process.env.NEXT_PUBLIC_DEV_LAN_ORIGIN
if (existingIp) {
  console.log(`\u{1F310} NEXT_PUBLIC_DEV_LAN_ORIGIN ya definida: ${existingIp}`)
} else if (detectedIp) {
  process.env.NEXT_PUBLIC_DEV_LAN_ORIGIN = detectedIp
  console.log(`\u{1F310} IP LAN auto-detectada: ${detectedIp}`)
  console.log(`   Configurando NEXT_PUBLIC_DEV_LAN_ORIGIN=${detectedIp}`)
  console.log(`   Accedé desde otro dispositivo en: http://${detectedIp}:3000`)
} else {
  console.log(`\u26A0\uFE0F  No se detect\u00f3 IP LAN \u2014 solo accesible v\u00eda http://localhost:3000`)
  console.log(`   Si necesit\u00e1s acceso LAN, export\u00e1:`)
  console.log(`     NEXT_PUBLIC_DEV_LAN_ORIGIN="<tu-ip>" npm run dev`)
}

// Spawn next dev con el env actualizado
const child = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', '3000'], {
  env: process.env,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error('Error al spawn-ear next dev:', err)
  process.exit(1)
})

// Forward de signals (Ctrl+C, SIGTERM)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig)
  })
}
