type TextElem = {
  type: 'text' | 'at'
  text?: string
}

type FaceElem = {
  type: 'face' | 'sface' | 'bface' | 'rps' | 'dice'
  id?: number
  text?: string
  file?: string
}

type ImageElem = {
  type: 'image' | 'flash'
  file?: string
  url?: string
  localUrl?: string
  downloadStatus?: 'idle' | 'cached' | 'unsupported'
}

type MediaElem = {
  type: 'video' | 'record'
  fid?: string
  file?: string
  url?: string
  localUrl?: string
  downloadStatus?: 'idle' | 'cached' | 'unsupported'
}

type FileElem = {
  type: 'file'
  name: string
  localUrl?: string
  downloadStatus?: 'idle' | 'cached' | 'unsupported'
}

type LocationElem = {
  type: 'location'
  name?: string
  address?: string
}

type JsonElem = {
  type: 'json'
  data: string
}

type XmlElem = {
  type: 'xml'
  data: string
}

export type MessageElemExt = TextElem | FaceElem | ImageElem | MediaElem | FileElem | LocationElem | JsonElem | XmlElem | {
  type: 'video-loop',
  url: string
} | {
  type: 'tgs',
  url: string
}
