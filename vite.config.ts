import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  publicDir: 'static',
  plugins: [react(), serveGeneratedPhotos()],
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js',
      },
    },
  },
})

function serveGeneratedPhotos(): Plugin {
  const outputDir = path.resolve(process.env.PHOTO_OUTPUT_DIR ?? 'public/photos')

  return {
    name: 'serve-generated-photos',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/photos', async (request, response, next) => {
        if (!request.url) {
          next()
          return
        }

        const relativeUrl = decodeURIComponent(request.url.split('?')[0] ?? '')
        const filePath = path.resolve(outputDir, `.${relativeUrl}`)

        if (!filePath.startsWith(`${outputDir}${path.sep}`)) {
          response.statusCode = 403
          response.end()
          return
        }

        try {
          const fileStat = await stat(filePath)
          if (!fileStat.isFile()) {
            next()
            return
          }

          response.setHeader('Content-Type', contentTypeFor(filePath))
          response.setHeader('Content-Length', String(fileStat.size))
          createReadStream(filePath).pipe(response)
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            next()
            return
          }

          next(error)
        }
      })
    },
  }
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
