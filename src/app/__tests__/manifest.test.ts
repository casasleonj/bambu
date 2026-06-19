import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const PUBLIC_DIR = path.join(process.cwd(), 'public')
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons')

function loadManifest(): Record<string, unknown> {
  const manifestPath = path.join(PUBLIC_DIR, 'manifest.json')
  const content = fs.readFileSync(manifestPath, 'utf8')
  return JSON.parse(content) as Record<string, unknown>
}

describe('PWA manifest', () => {
  it('has required manifest fields', () => {
    const manifest = loadManifest()

    expect(manifest.id).toBe('/')
    expect(manifest.name).toBe('Agua Bambú - Gestión de Pedidos')
    expect(manifest.short_name).toBe('Agua Bambú')
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#2563eb')
    expect(manifest.background_color).toBe('#ffffff')
    expect(manifest.scope).toBe('/')
    expect(manifest.lang).toBe('es')
  })

  it('references existing icon files', () => {
    const manifest = loadManifest()
    const icons = manifest.icons as Array<{ src: string; sizes: string }>

    for (const icon of icons) {
      const iconPath = path.join(PUBLIC_DIR, icon.src.replace(/^\//, ''))
      expect(fs.existsSync(iconPath), `missing icon ${icon.src}`).toBe(true)
    }
  })

  it('references existing screenshot files', () => {
    const manifest = loadManifest()
    const screenshots = manifest.screenshots as Array<{ src: string; sizes: string; form_factor?: string }>

    for (const screenshot of screenshots) {
      const screenshotPath = path.join(PUBLIC_DIR, screenshot.src.replace(/^\//, ''))
      expect(fs.existsSync(screenshotPath), `missing screenshot ${screenshot.src}`).toBe(true)
    }
  })

  it('has shortcuts with existing icon references', () => {
    const manifest = loadManifest()
    const shortcuts = manifest.shortcuts as Array<{ name: string; url: string; icons: Array<{ src: string }> }>

    expect(shortcuts.length).toBeGreaterThan(0)

    for (const shortcut of shortcuts) {
      expect(shortcut.url).toBeTruthy()
      for (const icon of shortcut.icons) {
        const iconPath = path.join(PUBLIC_DIR, icon.src.replace(/^\//, ''))
        expect(fs.existsSync(iconPath), `missing shortcut icon ${icon.src}`).toBe(true)
      }
    }
  })
})

describe('PWA icon assets', () => {
  it('generates the 72x72 badge icon used by push notifications', async () => {
    const badgePath = path.join(ICONS_DIR, 'badge-72x72.png')
    expect(fs.existsSync(badgePath)).toBe(true)

    const metadata = await sharp(badgePath).metadata()
    expect(metadata.width).toBe(72)
    expect(metadata.height).toBe(72)
    expect(metadata.format).toBe('png')

    // The badge should be mostly transparent; verify it is not a solid rectangle.
    const { data, info } = await sharp(badgePath).raw().toBuffer({ resolveWithObject: true })
    let transparentPixels = 0
    for (let i = 3; i < data.length; i += info.channels) {
      if (data[i] === 0) transparentPixels++
    }
    expect(transparentPixels).toBeGreaterThan(0)
  })

  it('generates the 180x180 Apple touch icon used by iOS home screen bookmarks', async () => {
    const appleIconPath = path.join(ICONS_DIR, 'apple-touch-icon.png')
    expect(fs.existsSync(appleIconPath)).toBe(true)

    const metadata = await sharp(appleIconPath).metadata()
    expect(metadata.width).toBe(180)
    expect(metadata.height).toBe(180)
    expect(metadata.format).toBe('png')
  })
})
