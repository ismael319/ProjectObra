import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(rootDir, 'public', 'favicon.svg')
const outputDir = path.join(rootDir, 'public', 'pwa-icons')

await mkdir(outputDir, { recursive: true })

const sourceSvg = await readFile(sourcePath, 'utf8')
const viewBox = sourceSvg.match(/viewBox="([^"]+)"/)?.[1]
const primaryPath = sourceSvg.match(/<path[^>]*d="([^"]+)"/)?.[1]

if (!viewBox || !primaryPath) {
  throw new Error('Não foi possível extrair a marca principal do favicon.svg')
}

// O favicon tem filtros de brilho que alguns renderizadores rasterizam com
// artefatos. O ícone de app usa o mesmo contorno, sem esses efeitos decorativos.
const iconSource = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path fill="#863bff" d="${primaryPath}"/></svg>`,
)

async function createIcon(filename, size, logoScale) {
  const logoSize = Math.round(size * logoScale)
  const logo = await sharp(iconSource)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: '#ffffff',
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(outputDir, filename))
}

await Promise.all([
  createIcon('icon-192.png', 192, 0.68),
  createIcon('icon-512.png', 512, 0.68),
  createIcon('icon-maskable-192.png', 192, 0.56),
  createIcon('icon-maskable-512.png', 512, 0.56),
  createIcon('apple-touch-icon.png', 180, 0.68),
])

console.log(`Ícones PWA gerados em ${outputDir}`)
