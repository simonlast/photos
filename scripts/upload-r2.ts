import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

dotenv.config({ path: '.envrc' })
dotenv.config()

const outputDir = process.env.PHOTO_OUTPUT_DIR ?? 'public/photos'
const manifestPath =
  process.env.PHOTO_MANIFEST_PATH ?? 'src/data/photos.generated.json'
const bucket = requiredEnv('R2_BUCKET')
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID
const r2AccountId = process.env.R2_ACCOUNT_ID
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const uploadConcurrency = Number(process.env.R2_UPLOAD_CONCURRENCY ?? 4)

type LocalFile = {
  path: string
  key: string
  size: number
}

type RemoteObject = {
  key: string
  size: number
}

type PhotoManifest = {
  display: { src: string }
  full: { src: string }
}

async function main() {
  const files = await listManifestFiles()
  await ensureBucketExists()
  const remoteObjects = await listRemoteObjects()
  const uploadQueue = files.filter((file) => {
    const remoteObject = remoteObjects.get(file.key)
    return !remoteObject || remoteObject.size !== file.size
  })
  const skippedCount = files.length - uploadQueue.length

  if (skippedCount > 0) {
    console.log(`Skipped ${skippedCount} unchanged files already in ${bucket}`)
  }

  await runWithConcurrency(uploadQueue, uploadConcurrency, async (file) => {
    await uploadFile(file.path, file.key, contentTypeFor(file.path))
    console.log(`Uploaded ${file.key}`)
  })

  console.log(`Uploaded ${uploadQueue.length} changed files to ${bucket}`)
}

async function listManifestFiles(): Promise<LocalFile[]> {
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as PhotoManifest[]
  const keys = Array.from(
    new Set(
      manifest.flatMap((photo) => [
        normalizeManifestSrc(photo.display.src),
        normalizeManifestSrc(photo.full.src),
      ]),
    ),
  )

  return Promise.all(
    keys.map(async (key) => {
      const filePath = path.join(outputDir, key)
      const fileStat = await stat(filePath)

      return { path: filePath, key, size: fileStat.size }
    }),
  )
}

async function ensureBucketExists() {
  if (cloudflareApiToken && cloudflareAccountId) {
    const result = await cloudflareRequest(
      `accounts/${cloudflareAccountId}/r2/buckets/${bucket}`,
      { method: 'GET' },
    )

    if (result.status === 404) {
      await cloudflareRequest(`accounts/${cloudflareAccountId}/r2/buckets`, {
        method: 'POST',
        body: JSON.stringify({ name: bucket }),
        headers: { 'Content-Type': 'application/json' },
      })
      return
    }

    if (!result.ok) {
      throw new Error(await cloudflareErrorMessage(result))
    }

    return
  }

  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error(
      'Missing Cloudflare R2 credentials. Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, or add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.',
    )
  }
}

async function listRemoteObjects() {
  if (!cloudflareApiToken || !cloudflareAccountId) {
    return new Map<string, RemoteObject>()
  }

  const result = await cloudflareRequest(
    `accounts/${cloudflareAccountId}/r2/buckets/${bucket}/objects?per_page=1000`,
    { method: 'GET' },
  )

  if (!result.ok) {
    throw new Error(await cloudflareErrorMessage(result))
  }

  const payload = (await result.json()) as {
    result?: RemoteObject[]
  }

  return new Map((payload.result ?? []).map((object) => [object.key, object]))
}

async function uploadFile(filePath: string, key: string, contentType: string) {
  if (cloudflareApiToken && cloudflareAccountId) {
    const body = await readFile(filePath)
    const result = await cloudflareRequest(
      `accounts/${cloudflareAccountId}/r2/buckets/${bucket}/objects/${encodeObjectKey(
        key,
      )}`,
      {
        method: 'PUT',
        body,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Type': contentType,
        },
      },
    )

    if (!result.ok) {
      throw new Error(await cloudflareErrorMessage(result))
    }

    return
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  })

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
}

function cloudflareRequest(pathname: string, init: RequestInit) {
  return fetch(`https://api.cloudflare.com/client/v4/${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cloudflareApiToken}`,
      ...init.headers,
    },
  })
}

async function cloudflareErrorMessage(response: Response) {
  const body = await response.text()

  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ code?: number; message?: string }>
    }
    const message = parsed.errors
      ?.map((error) =>
        error.code ? `${error.code}: ${error.message}` : error.message,
      )
      .filter(Boolean)
      .join('; ')

    return message || `Cloudflare API failed with HTTP ${response.status}`
  } catch {
    return `Cloudflare API failed with HTTP ${response.status}: ${body}`
  }
}

function encodeObjectKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/')
}

function normalizeManifestSrc(src: string) {
  return src.replace(/^\/+/, '')
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  let index = 0

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const item = items[index]
        index += 1
        await worker(item)
      }
    }),
  )
}

function contentTypeFor(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.avif':
      return 'image/avif'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.heic':
      return 'image/heic'
    case '.png':
      return 'image/png'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
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
