/** LongMsg */
export interface LongMsgElem {
  type: 'long_msg';
  resid: string;
}
/** TEXT (此元素可使用字符串代替) */
export interface TextElem {
  type: 'text';
  text: string;
}
/** AT */
export interface AtElem {
  type: 'at';
  qq: number | 'all';
  id?: string | 'all';
  text?: string;
  dummy?: boolean;
}
/** 表情 */
export interface FaceElem {
  type: 'face' | 'sface';
  id: number;
  text?: string;
  big?: boolean;
  stickerId?: string;
  stickerType?: number;
}
/** 原创表情 */
export interface BfaceElem {
  type: 'bface';
  file: string;
  text: string;
}
/** 魔法表情 */
export interface MfaceElem {
  type: 'rps' | 'dice';
  id?: number;
}
/** 图片 */
export interface ImageElem {
  type: 'image';
  file: string | Buffer | import('stream').Readable;
  cache?: boolean;
  timeout?: number;
  headers?: import('http').OutgoingHttpHeaders;
  url?: string;
  asface?: boolean;
  origin?: boolean;
  summary?: string;
  fid?: string | number;
  md5?: string;
  height?: number;
  width?: number;
  size?: number;
  nt?: boolean;
  brief?: string;
}
/** 闪照 */
export interface FlashElem extends Omit<ImageElem, 'type'> {
  type: 'flash';
}
/** 语音 */
export interface PttElem {
  type: 'record';
  file: string | Buffer;
  url?: string;
  fid?: string;
  md5?: string;
  size?: number;
  seconds?: number;
  nt?: boolean;
}
/** 视频 */
export interface VideoElem {
  type: 'video';
  file: string | Buffer;
  name?: string;
  fid?: string;
  md5?: string;
  size?: number;
  seconds?: number;
  temp?: boolean;
  nt?: boolean;
}
/** 地点分享 */
export interface LocationElem {
  type: 'location';
  address: string;
  lat: number;
  lng: number;
  name?: string;
  id?: string;
}
/** 链接分享 */
export interface ShareElem {
  type: 'share';
  url: string;
  title: string;
  content?: string;
  image?: string;
}
/** JSON */
export interface JsonElem {
  type: 'json';
  data: any;
}
/** XML */
export interface XmlElem {
  type: 'xml';
  data: string;
  id?: number;
}
/** 戳一戳 */
export interface PokeElem {
  type: 'poke';
  id: number;
  text?: string;
}
/** 特殊 (官方客户端无法解析此消息) */
export interface MiraiElem {
  type: 'mirai';
  data: string;
}
/** 文件，只支持接收 */
export interface FileElem {
  type: 'file';
  name: string;
  fid: string;
  md5: string;
  size: number;
  duration: number;
}
/** @deprecated 旧版引用回复 */
export interface ReplyElem {
  type: 'reply';
  text?: string;
  id: string;
}
/** 可引用回复的消息 */
export interface Quotable {
  user_id: number;
  time: number;
  seq: number;
  rand: number;
  message: Sendable;
}
/** 引用回复消息 */
export interface QuoteElem extends Quotable {
  type: 'quote';
}
/** 可转发的消息 */
export interface Forwardable {
  user_id: number;
  message: Sendable;
  nickname?: string;
  time?: number;
}
/** 可转发节点 */
export interface ForwardNode extends Forwardable {
  type: 'node';
}
/** Markdown消息 */
export interface MarkdownElem {
  type: 'markdown';
  content: string;
  config?: {
    unknown?: number;
    time: number;
    token: string;
  };
}
/** 可组合发送的元素类型之一 */
export type ChainElem =
  TextElem | FaceElem | BfaceElem | MfaceElem | ImageElem | AtElem |
  MiraiElem | ReplyElem | ForwardNode | QuoteElem | MarkdownElem;

/** 所有可接收的消息元素类型 */
export type MessageElem =
  TextElem | FaceElem | BfaceElem | MfaceElem | ImageElem | AtElem |
  MiraiElem | ReplyElem | FlashElem | PttElem | VideoElem | JsonElem |
  XmlElem | PokeElem | LocationElem | ShareElem | FileElem | ForwardNode |
  QuoteElem | MarkdownElem | LongMsgElem;

/** 可通过`sendMsg`发送的类型集合 */
export type Sendable = string | MessageElem | (string | MessageElem)[];
