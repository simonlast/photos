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
const INITIAL_PHOTO_COUNT = 20
const PHOTO_LOAD_BATCH_SIZE = 10

type LightboxZoomLevel = {
  panAreaSize: { x: number; y: number } | null
  elementSize: { x: number; y: number } | null
  initial: number
}

function App() {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(INITIAL_PHOTO_COUNT, photos.length),
  )
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || visibleCount >= photos.length) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) =>
            Math.min(count + PHOTO_LOAD_BATCH_SIZE, photos.length),
          )
        }
      },
      { rootMargin: '3000px 0px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount])

  useEffect(() => {
    const closeActiveLightbox = () => {
      lightboxRef.current?.pswp?.close()
    }

    const handleLightboxTap: ActionFn = (point, originalEvent) => {
      if (eventHitsActiveLightboxImage(originalEvent)) {
        lightboxRef.current?.pswp?.currSlide?.toggleZoom(point)
        return
      }

      closeActiveLightbox()
    }

    const lightbox = new PhotoSwipeLightbox({
      dataSource: photos.map((photo) => ({
        src: resolvePhotoUrl(photo.lightbox.src),
        width: photo.lightbox.width,
        height: photo.lightbox.height,
        alt: photo.alt,
        msrc: resolvePhotoUrl(photo.display.src),
      })),
      bgClickAction: 'close',
      arrowNext: false,
      arrowPrev: false,
      close: false,
      counter: false,
      clickToCloseNonZoomable: false,
      escKey: true,
      imageClickAction: 'zoom',
      initialZoomLevel: 'fit',
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      secondaryZoomLevel: coverViewportZoomLevel,
      showHideAnimationType: 'none',
      tapAction: handleLightboxTap,
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

      if (eventHitsActiveLightboxImage(event)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      closeActiveLightbox()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('click', handleLightboxClick)

    lightbox.init()
    lightboxRef.current = lightbox

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('click', handleLightboxClick)
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
      <section
        className="photo-list"
        aria-label="Photo list"
        data-loaded-count={visibleCount}
        data-total-count={photos.length}
      >
        {photos.slice(0, visibleCount).map((photo, index) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            index={index}
            onOpen={openPhoto}
          />
        ))}
        {visibleCount < photos.length ? (
          <div ref={sentinelRef} className="sentinel" aria-hidden="true" />
        ) : null}
      </section>
    </main>
  )
}

function eventHitsActiveLightboxImage(event: MouseEvent | PointerEvent) {
  const target = event.target
  if (target instanceof Element && target.classList.contains('pswp__img')) {
    return true
  }

  return activeLightboxImages().some((image) =>
    pointIsInsideElement(event, image),
  )
}

function coverViewportZoomLevel(zoomLevel: LightboxZoomLevel) {
  if (!zoomLevel.panAreaSize || !zoomLevel.elementSize) {
    return 1
  }

  const fitWidth = zoomLevel.elementSize.x * zoomLevel.initial
  const fitHeight = zoomLevel.elementSize.y * zoomLevel.initial
  if (fitWidth === 0 || fitHeight === 0) {
    return 1
  }

  const coverScale = Math.max(
    window.innerWidth / fitWidth,
    window.innerHeight / fitHeight,
  )

  return Math.max(1, zoomLevel.initial * coverScale)
}

function activeLightboxImages() {
  return Array.from(
    document.querySelectorAll(
      '.pswp__item[aria-hidden="false"] .pswp__img',
    ),
  )
}

function pointIsInsideElement(
  event: MouseEvent | PointerEvent,
  element: Element,
) {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    return false
  }

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
  const displaySrc = resolvePhotoUrl(photo.display.src)

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
        <img
          className={`photo-card__image${loaded ? ' is-loaded' : ''}`}
          src={displaySrc}
          sizes={sizes}
          width={photo.display.width}
          height={photo.display.height}
          alt={photo.alt}
          loading={index < 3 ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : 'auto'}
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
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
