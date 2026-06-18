import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

const PROJECT_ROOT = process.cwd()
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'public', 'screenshots')

const THEME_BG = '#2563eb'
const TEXT_COLOR = '#ffffff'

async function ensureScreenshotsDir(): Promise<void> {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true })
}

function createPlaceholder(width: number, height: number, label: string): sharp.Sharp {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${THEME_BG}"/>
      <text
        x="50%"
        y="50%"
        font-family="system-ui, sans-serif"
        font-size="${Math.min(width, height) / 12}px"
        font-weight="bold"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="${TEXT_COLOR}"
      >${label}</text>
    </svg>
  `

  return sharp(Buffer.from(svg))
}

async function generateScreenshots(): Promise<void> {
  const narrowPath = path.join(SCREENSHOTS_DIR, 'dashboard-narrow.png')
  const widePath = path.join(SCREENSHOTS_DIR, 'dashboard-wide.png')

  await createPlaceholder(390, 844, 'Agua Bambú').png().toFile(narrowPath)
  await createPlaceholder(1280, 720, 'Agua Bambú').png().toFile(widePath)
}

async function main(): Promise<void> {
  await ensureScreenshotsDir()
  await generateScreenshots()
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`generate-pwa-screenshots failed: ${message}`)
  process.exit(1)
})
