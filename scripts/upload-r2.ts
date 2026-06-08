import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

dotenv.config()

const outputDir = process.env.PHOTO_OUTPUT_DIR ?? 'public/photos'
const accountId = requiredEnv('R2_ACCOUNT_ID')
const accessKeyId = requiredEnv('R2_ACCESS_KEY_ID')
const secretAccessKey = requiredEnv('R2_SECRET_ACCESS_KEY')
const bucket = requiredEnv('R2_BUCKET')

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
})

async function main() {
  const files = await listFiles(outputDir)

  for (const filePath of files) {
    const key = path.relative(outputDir, filePath).split(path.sep).join('/')
    const type = contentTypeFor(filePath)

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: type,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )

    console.log(`Uploaded ${key}`)
  }

  console.log(`Uploaded ${files.length} files to ${bucket}`)
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return listFiles(entryPath)
      }

      if (entry.isFile()) {
        await stat(entryPath)
        return [entryPath]
      }

      return []
    }),
  )

  return files.flat()
}

function contentTypeFor(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.avif':
      return 'image/avif'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env or .envrc before uploading.`)
  }

  return value
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
