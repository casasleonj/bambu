import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

const PROJECT_ROOT = process.cwd()
const SOURCE_LOGO = path.join(PROJECT_ROOT, 'public', 'logo-agua-bambu.jpg')
const ICONS_DIR = path.join(PROJECT_ROOT, 'public', 'icons')

const THEME_BG = '#2563eb'
const PADDING_PX = 18

async function ensureIconsDir(): Promise<void> {
  await fs.mkdir(ICONS_DIR, { recursive: true })
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function generateBadge(): Promise<void> {
  const outputPath = path.join(ICONS_DIR, 'badge-72x72.png')
  const size = 72
  const iconSize = 56

  // Notification badges are rendered as a monochrome mask by the OS. We
  // produce a white silhouette on a transparent background.
  const { data, info } = await sharp(SOURCE_LOGO)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .grayscale()
    .threshold(128)
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Threshold output is single-channel (0 or 255). Build an RGBA buffer where
  // opaque regions become white and transparent regions stay transparent.
  const rgba = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0; i < info.width * info.height; i++) {
    const value = data[i] ?? 0
    const alpha = value > 0 ? 255 : 0
    rgba[i * 4] = 255     // R
    rgba[i * 4 + 1] = 255 // G
    rgba[i * 4 + 2] = 255 // B
    rgba[i * 4 + 3] = alpha
  }

  const whiteIcon = sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })

  // Center the icon on a transparent canvas.
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await whiteIcon.png().toBuffer(),
        left: Math.floor((size - info.width) / 2),
        top: Math.floor((size - info.height) / 2),
      },
    ])
    .png()
    .toFile(outputPath)
}

async function generateAppleTouchIcon(): Promise<void> {
  const outputPath = path.join(ICONS_DIR, 'apple-touch-icon.png')
  const size = 180

  // iOS applies its own rounded mask. A solid colored square with the logo
  // padded inside is the safest, most widely supported format.
  const logoBuffer = await sharp(SOURCE_LOGO)
    .resize(size - PADDING_PX * 2, size - PADDING_PX * 2, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const logoMeta = await sharp(logoBuffer).metadata()
  const logoWidth = logoMeta.width ?? size - PADDING_PX * 2
  const logoHeight = logoMeta.height ?? size - PADDING_PX * 2

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: THEME_BG,
    },
  })
    .composite([
      {
        input: logoBuffer,
        left: Math.floor((size - logoWidth) / 2),
        top: Math.floor((size - logoHeight) / 2),
      },
    ])
    .png()
    .toFile(outputPath)
}

async function main(): Promise<void> {
  if (!(await fileExists(SOURCE_LOGO))) {
    throw new Error(`Source logo not found: ${SOURCE_LOGO}`)
  }

  await ensureIconsDir()
  await generateBadge()
  await generateAppleTouchIcon()
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`generate-pwa-icons failed: ${message}`)
  process.exit(1)
})
