import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const ICONS_DIR = path.join(process.cwd(), 'public', 'icons')

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
