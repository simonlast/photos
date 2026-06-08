import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

type PhotoManifest = {
  id: string
  title: string
  alt: string
  color: string
  placeholder: string
  width: number
  height: number
  aspectRatio: number
  sources: Array<{
    width: number
    avif: string
    webp: string
    jpeg: string
  }>
  full: {
    src: string
    width: number
    height: number
    bytes: number
  }
}

const sourceDir =
  process.env.PHOTO_SOURCE_DIR ?? '/Users/simonlast/Pictures/Lightroom exports'
const outputDir = process.env.PHOTO_OUTPUT_DIR ?? 'public/photos'
const manifestPath =
  process.env.PHOTO_MANIFEST_PATH ?? 'src/data/photos.generated.json'
const gridWidths = [420, 840, 1260]
const inputExtensions = new Set([
  '.avif',
  '.heic',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
])

async function main() {
  const inputs = await findImages(sourceDir)

  await rm(outputDir, { force: true, recursive: true })
  await mkdir(outputDir, { recursive: true })
  await mkdir(path.dirname(manifestPath), { recursive: true })

  const photos: PhotoManifest[] = []

  console.log(`Found ${inputs.length} source images in ${sourceDir}`)

  for (const [index, input] of inputs.entries()) {
    console.log(`[${index + 1}/${inputs.length}] ${path.basename(input.path)}`)
    const buffer = await readFile(input.path)
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 12)
    const baseName = slugify(path.basename(input.path, path.extname(input.path)))
    const id = `${baseName}-${hash}`
    const image = sharp(buffer, { limitInputPixels: false }).rotate()
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      console.warn(`Skipping ${input.path}: missing dimensions`)
      continue
    }

    const stats = await image.clone().resize(32, 32, { fit: 'inside' }).stats()
    const color = rgbToHex(
      Math.round(stats.channels[0]?.mean ?? 220),
      Math.round(stats.channels[1]?.mean ?? 220),
      Math.round(stats.channels[2]?.mean ?? 220),
    )
    const placeholderBuffer = await image
      .clone()
      .resize(32, 32, { fit: 'inside' })
      .jpeg({ quality: 38, mozjpeg: true })
      .toBuffer()
    const placeholder = `data:image/jpeg;base64,${placeholderBuffer.toString(
      'base64',
    )}`

    const fullName = `${id}-full.jpg`
    const fullPath = path.join(outputDir, fullName)
    const fullInfo = await image
      .clone()
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(fullPath)

    const usableWidths = gridWidths
      .filter((width) => width < fullInfo.width)
      .concat(Math.min(fullInfo.width, gridWidths[0]))
      .filter(uniqueNumber)
      .sort((a, b) => a - b)

    const sources: PhotoManifest['sources'] = []
    for (const width of usableWidths) {
      const avifName = `${id}-${width}.avif`
      const webpName = `${id}-${width}.webp`
      const jpegName = `${id}-${width}.jpg`

      await Promise.all([
        image
          .clone()
          .resize({ width, withoutEnlargement: true })
          .avif({ quality: 52, effort: 2 })
          .toFile(path.join(outputDir, avifName)),
        image
          .clone()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 78, effort: 3 })
          .toFile(path.join(outputDir, webpName)),
        image
          .clone()
          .resize({ width, withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(path.join(outputDir, jpegName)),
      ])

      sources.push({
        width,
        avif: publicUrl(avifName),
        webp: publicUrl(webpName),
        jpeg: publicUrl(jpegName),
      })
    }

    photos.push({
      id,
      title: titleFromName(baseName),
      alt: titleFromName(baseName),
      color,
      placeholder,
      width: fullInfo.width,
      height: fullInfo.height,
      aspectRatio: fullInfo.width / fullInfo.height,
      sources,
      full: {
        src: publicUrl(fullName),
        width: fullInfo.width,
        height: fullInfo.height,
        bytes: fullInfo.size,
      },
    })
  }

  await writeFile(manifestPath, `${JSON.stringify(photos, null, 2)}\n`)
  console.log(`Processed ${photos.length} photos into ${outputDir}`)
}

async function findImages(dir: string) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter(
        (entry) => entry.isFile() && inputExtensions.has(path.extname(entry.name).toLowerCase()),
      )
      .map(async (entry) => {
        const inputPath = path.join(entry.parentPath, entry.name)
        const inputStat = await stat(inputPath)
        return { path: inputPath, mtimeMs: inputStat.mtimeMs }
      }),
  )

  return files.sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) {
      return b.mtimeMs - a.mtimeMs
    }

    return a.path.localeCompare(b.path, undefined, { numeric: true })
  })
}

function publicUrl(fileName: string) {
  return fileName
}

function titleFromName(name: string) {
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function uniqueNumber(value: number, index: number, values: number[]) {
  return values.indexOf(value) === index
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
