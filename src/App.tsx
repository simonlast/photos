import PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { ActionFn } from 'photoswipe'
import { useCallback, useEffect, useRef, useState } from 'react'
import 'photoswipe/style.css'
import './App.css'
import photosJson from './data/photos.generated.json'
import type { Photo } from './types/photo'

const photos = photosJson as Photo[]
const photoBaseUrl = trimTrailingSlash(
  import.meta.env.VITE_PHOTO_BASE_URL || '/photos',
)

function App() {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null)

  useEffect(() => {
    const closeActiveLightbox = () => {
      lightboxRef.current?.pswp?.close()
      window.setTimeout(() => lightboxRef.current?.pswp?.close(), 1_000)
    }

    const handleGuardedLightboxAction: ActionFn = (point, originalEvent) => {
      if (clickIsInsideActiveLightboxImage(originalEvent)) {
        lightboxRef.current?.pswp?.currSlide?.toggleZoom(point)
        return
      }

      closeActiveLightbox()
    }

    const lightbox = new PhotoSwipeLightbox({
      dataSource: photos.map((photo) => ({
        src: resolvePhotoUrl(photo.full.src),
        width: photo.full.width,
        height: photo.full.height,
        alt: photo.alt,
        msrc: resolvePhotoUrl(photo.sources[0]?.jpeg ?? photo.full.src),
      })),
      bgClickAction: handleGuardedLightboxAction,
      arrowNext: false,
      arrowPrev: false,
      close: false,
      counter: false,
      escKey: true,
      imageClickAction: 'zoom',
      initialZoomLevel: 'fit',
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      secondaryZoomLevel: 1,
      showHideAnimationType: 'none',
      tapAction: handleGuardedLightboxAction,
      zoom: false,
      pswpModule: () => import('photoswipe'),
    })

    lightbox.on('beforeOpen', () => {
      document.documentElement.classList.add('lightbox-open')
    })

    lightbox.on('close', () => {
      document.documentElement.classList.remove('lightbox-open')
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeActiveLightbox()
      }
    }

    const handleLightboxClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('.pswp')) {
        return
      }

      if (clickIsInsideActiveLightboxImage(event)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      closeActiveLightbox()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('click', handleLightboxClick, true)

    lightbox.init()
    lightboxRef.current = lightbox

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('click', handleLightboxClick, true)
      lightbox.destroy()
      lightboxRef.current = null
      document.documentElement.classList.remove('lightbox-open')
    }
  }, [])

  const openPhoto = useCallback((index: number) => {
    lightboxRef.current?.loadAndOpen(index)
  }, [])

  if (photos.length === 0) {
    return (
      <main className="app">
        <div className="empty-state">No generated photos yet.</div>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="photo-list" aria-label="Photo list">
        {photos.map((photo, index) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            index={index}
            onOpen={openPhoto}
          />
        ))}
      </section>
    </main>
  )
}

function clickIsInsideActiveLightboxImage(event: PointerEvent) {
  const activeImage = document.querySelector(
    '.pswp__item[aria-hidden="false"] .pswp__img:not(.pswp__img--placeholder)',
  )

  if (!activeImage) {
    return false
  }

  return clickIsInsideElement(event, activeImage)
}

function clickIsInsideElement(event: MouseEvent | PointerEvent, element: Element) {
  const rect = element.getBoundingClientRect()

  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  )
}

type PhotoTileProps = {
  photo: Photo
  index: number
  onOpen: (index: number) => void
}

function PhotoTile({ photo, index, onOpen }: PhotoTileProps) {
  const [loaded, setLoaded] = useState(false)
  const sizes =
    photo.aspectRatio < 0.85
      ? '(max-width: 820px) calc(100vw - 36px), 720px'
      : '(max-width: 1180px) calc(100vw - 36px), 1080px'
  const avifSrcSet = photo.sources
    .map((source) => `${resolvePhotoUrl(source.avif)} ${source.width}w`)
    .join(', ')
  const webpSrcSet = photo.sources
    .map((source) => `${resolvePhotoUrl(source.webp)} ${source.width}w`)
    .join(', ')
  const jpegSrcSet = photo.sources
    .map((source) => `${resolvePhotoUrl(source.jpeg)} ${source.width}w`)
    .join(', ')
  const fallback = resolvePhotoUrl(photo.sources.at(-1)?.jpeg ?? photo.full.src)

  return (
    <figure className="photo-item">
      <button
        type="button"
        className="photo-card"
        style={
          {
            '--photo-bg': photo.color,
            '--photo-max-width': photo.aspectRatio < 0.85 ? '720px' : '1080px',
          } as React.CSSProperties
        }
        aria-label={`Open ${photo.alt}`}
        onClick={() => onOpen(index)}
      >
        <picture>
          <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
          <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
          <img
            className={`photo-card__image${loaded ? ' is-loaded' : ''}`}
            src={fallback}
            srcSet={jpegSrcSet}
            sizes={sizes}
            width={photo.width}
            height={photo.height}
            alt={photo.alt}
            loading={index < 3 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : 'auto'}
            decoding="async"
            onLoad={() => setLoaded(true)}
          />
        </picture>
      </button>
    </figure>
  )
}

function resolvePhotoUrl(value: string) {
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('/')
  ) {
    return value
  }

  return `${photoBaseUrl}/${value}`
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export default App
