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
  display: {
    src: string
    width: number
    height: number
    bytes: number
  }
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
const displayBounds = { width: 2160, height: 1800 }
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

    const fullExtension = path.extname(input.path).toLowerCase()
    const fullName = `${id}-full${fullExtension}`
    const fullPath = path.join(outputDir, fullName)
    await writeFile(fullPath, buffer)

    const displayName = `${id}-display.avif`
    const displayInfo = await image
      .clone()
      .resize({
        width: displayBounds.width,
        height: displayBounds.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .avif({ quality: 62, effort: 4 })
      .toFile(path.join(outputDir, displayName))

    const dimensions = orientedDimensions(metadata)

    photos.push({
      id,
      title: titleFromName(baseName),
      alt: titleFromName(baseName),
      color,
      placeholder,
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: dimensions.width / dimensions.height,
      display: {
        src: publicUrl(displayName),
        width: displayInfo.width,
        height: displayInfo.height,
        bytes: displayInfo.size,
      },
      full: {
        src: publicUrl(fullName),
        width: dimensions.width,
        height: dimensions.height,
        bytes: input.size,
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
        return { path: inputPath, mtimeMs: inputStat.mtimeMs, size: inputStat.size }
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

function orientedDimensions(metadata: sharp.Metadata) {
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  const shouldSwap =
    typeof metadata.orientation === 'number' &&
    metadata.orientation >= 5 &&
    metadata.orientation <= 8

  return shouldSwap ? { width: height, height: width } : { width, height }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
