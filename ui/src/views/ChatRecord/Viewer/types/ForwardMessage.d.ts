import type { MessageElemExt } from './MessageElemExt';

export type ForwardMessage = {
  user_id: number
  nickname: string
  avatar?: string
  group_id?: number
  time: number
  seq: number
  message: MessageElemExt[]
  raw_message: string
}
