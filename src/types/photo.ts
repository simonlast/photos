export type Photo = {
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
