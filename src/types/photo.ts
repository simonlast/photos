export type PhotoSource = {
  width: number
  avif: string
  webp: string
  jpeg: string
}

export type Photo = {
  id: string
  title: string
  alt: string
  color: string
  placeholder: string
  width: number
  height: number
  aspectRatio: number
  sources: PhotoSource[]
  full: {
    src: string
    width: number
    height: number
    bytes: number
  }
}
