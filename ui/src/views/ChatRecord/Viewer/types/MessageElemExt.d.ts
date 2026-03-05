import { MessageElem } from "@icqqjs/icqq"

export type ForwardElemExt = {
  type: 'forward',
  id: string,
  content?: any[],
}

export type MessageElemExt = MessageElem | {
  type: 'video-loop',
  url: string
} | {
  type: 'tgs',
  url: string
} | ForwardElemExt
