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
}

type MediaElem = {
  type: 'video' | 'record'
}

type FileElem = {
  type: 'file'
  name: string
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
