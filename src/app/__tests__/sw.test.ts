// @tests sw.ts push handler — commit 4b plan antifraude
// El SW recibe los pushes que dispara broadcastPush() y muestra
// notifications nativas. Tambien maneja el click para abrir la URL.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const swPath = join(process.cwd(), 'src/app/sw.ts')
const source = readFileSync(swPath, 'utf-8')

describe('commit 4b: push event handler', () => {
  it('FIX: el SW escucha el evento "push"', () => {
    expect(source).toMatch(/self\.addEventListener\(\s*['"]push['"]/)
  })

  it('FIX: parsea el payload como JSON con fallback a defaults', () => {
    expect(source).toMatch(/event\.data\?\.json\(\)/)
    expect(source).toMatch(/payload\s*=\s*\(\s*event\.data\?\.json\(\)\s*\?\?\s*\{\s*\}\s*\)/)
    expect(source).toMatch(/title\s*=\s*payload\.title\s*\?\?\s*['"]Nueva alerta['"]/)
  })

  it('FIX: llama showNotification con title + options', () => {
    expect(source).toMatch(/self\.registration\.showNotification\(\s*title\s*,\s*options\s*\)/)
  })

  it('FIX: la notification tiene tag dedup + requireInteraction (alerta urgente)', () => {
    // requireInteraction: true → la noti no se cierra sola (el user
    // debe actuar). Importante para alertas antifraude ALTA.
    expect(source).toMatch(/tag:\s*payload\.tag/)
    expect(source).toMatch(/requireInteraction:\s*true/)
  })

  it('FIX: envuelve showNotification en event.waitUntil (offline-safe)', () => {
    // event.waitUntil extiende la vida del SW hasta que la
    // promise se resuelva. Sin esto, el SW se mata antes de
    // mostrar la notification en conexiones lentas.
    expect(source).toMatch(/event\.waitUntil\(\s*self\.registration\.showNotification/)
  })
})

describe('commit 4b: notificationclick handler', () => {
  it('FIX: el SW escucha el evento "notificationclick"', () => {
    expect(source).toMatch(/self\.addEventListener\(\s*['"]notificationclick['"]/)
  })

  it('FIX: cierra la notification al hacer click', () => {
    expect(source).toMatch(/notification\.close\(\)/)
  })

  it('FIX: si hay un tab abierto con la URL, lo enfoca (no abre nuevo)', () => {
    // clientList.filter(client.url.includes(url)) → focus
    expect(source).toMatch(/client\.url\.includes\(url\)/)
    expect(source).toMatch(/\.focus\(\)/)
  })

  it('FIX: si no hay tab con esa URL, abre uno nuevo con openWindow', () => {
    expect(source).toMatch(/self\.clients\.openWindow\(url\)/)
  })

  it('FIX: todo el flow esta envuelto en event.waitUntil (no se mata el SW)', () => {
    // El click handler debe garantizar que el SW vive hasta
    // que la ventana termine de abrir.
    expect(source).toMatch(/event\.waitUntil\([\s\S]+?self\.clients[\s\S]+?matchAll/)
  })
})
