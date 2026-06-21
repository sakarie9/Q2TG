import { Readable } from 'node:stream';

export type Gender = 'male' | 'female' | 'unknown';
export type GroupRole = 'owner' | 'admin' | 'member';

export interface TextElem {
  type: 'text';
  text: string;
}

export interface FaceElem {
  type: 'face' | 'sface' | 'bface' | 'rps' | 'dice';
  id: number;
  text?: string;
  file?: string;
  stickerType?: number;
}

export interface ImageElem {
  type: 'image' | 'flash';
  file: string | Buffer | Readable;
  url?: string;
  md5?: string | Buffer;
  asface?: boolean;
  emoji_package_id?: string | number;
  brief?: string;
}

export interface AtElem {
  type: 'at';
  qq: number | string;
  text?: string;
}

export interface RecordElem {
  type: 'record';
  file?: string | Buffer | Readable;
  url?: string;
  md5?: string | Buffer;
}

export interface VideoElem {
  type: 'video';
  fid?: string;
  file?: string | Buffer | Readable;
  url?: string;
  md5?: string | Buffer;
}

export interface FileElem {
  type: 'file';
  fid: string;
  name: string;
  size: number;
  duration?: number;
  md5?: string | Buffer;
}

export interface JsonElem {
  type: 'json';
  data: string;
}

export interface XmlElem {
  type: 'xml';
  id?: number;
  data: string;
}

export interface ShareElem {
  type: 'share';
  url: string;
  title?: string;
  content?: string;
}

export interface LocationElem {
  type: 'location';
  lat: number;
  lng: number;
  address?: string;
  name?: string;
}

export interface MiraiElem {
  type: 'mirai';
  data: string;
}

export interface PokeElem {
  type: 'poke';
  text?: string;
}

export interface ReplyElem {
  type: 'reply';
  id: string | number;
}

export interface ForwardNode {
  type: 'node';
  user_id: number;
  nickname: string;
  message: Sendable;
}

export interface ForwardElem {
  type: 'forward';
  id: string;
  content?: ForwardMessage[];
}

export interface MarkdownElem {
  type: 'markdown';
  content: string;
}

export type MessageElem =
  | TextElem
  | FaceElem
  | ImageElem
  | AtElem
  | RecordElem
  | VideoElem
  | FileElem
  | JsonElem
  | XmlElem
  | ShareElem
  | LocationElem
  | MiraiElem
  | PokeElem
  | ReplyElem
  | ForwardNode
  | ForwardElem
  | MarkdownElem;

export type SendableElem = Exclude<MessageElem, ForwardElem | MarkdownElem | ReplyElem | FileElem>;
export type Sendable = SendableElem | string | (SendableElem | string)[];

export interface Quotable {
  message: MessageElem[] | MessageElem | string;
  seq: number;
  rand?: number;
  time?: number;
  user_id: number;
}

export interface MessageRet {
  message_id?: string;
  seq: number;
  rand: number;
  time: number;
}

export interface UserProfile {
  birthday?: Array<number | string>;
  email?: string;
  nickname?: string;
  city?: string;
  QID?: string;
  country?: string;
  province?: string;
  signature?: string;
  regTimestamp?: number | string;
}

export interface QQEntity {
  readonly client: { uin: number };
  readonly dm: boolean;

  getForwardMsg(resid: string, fileName?: string): Promise<ForwardMessage[]>;

  getVideoUrl(fid: string, md5: string | Buffer): Promise<string>;

  recallMsg(seqOrMessageId: number, rand?: number, timeOrPktNum?: number): Promise<boolean>;

  sendMsg(content: Sendable, source?: Quotable, isSpoiler?: boolean): Promise<MessageRet>;

  getFileUrl(fid: string): Promise<string>;
}

export interface QQUser extends QQEntity {
  readonly uin: number;
}

export interface Friend extends QQUser {
  readonly nickname: string;
  readonly remark: string;

  sendFile(file: string, filename: string): Promise<string>;

  poke?(self?: boolean): Promise<boolean>;

  renew?(): Promise<any>;
}

export interface Group extends QQEntity {
  readonly gid: number;
  readonly name: string;
  readonly is_owner: boolean;
  readonly is_admin: boolean;
  readonly fs: GroupFs;

  pickMember(uin: number, strict?: boolean): GroupMember;

  muteMember(uin: number, duration?: number): Promise<void>;

  setCard(uin: number, card?: string): Promise<boolean>;

  announce(content: string): Promise<any>;

  pokeMember?(uin: number): Promise<boolean>;

  renew?(): Promise<any>;

  getAllMemberInfo?(): Promise<GroupMemberInfo[]>;
}

export interface GroupFs {
  upload(file: string | Buffer | Uint8Array, pid?: string, name?: string, callback?: (percentage: string) => void): Promise<any>;
}

export interface GroupMember extends QQUser {
  renew(): Promise<GroupMemberInfo>;
  getProfile?(): Promise<UserProfile>;
}

export interface GroupMemberInfo {
  readonly user_id: number;
  readonly card: string;
  readonly nickname: string;
  readonly sex?: Gender;
  readonly age?: number;
  readonly join_time?: number;
  readonly last_sent_time?: number;
  readonly role: GroupRole;
  readonly title: string;
}

export interface ForwardMessage {
  user_id: number;
  nickname: string;
  avatar?: string;
  group_id?: number;
  time: number;
  seq: number;
  message: MessageElem[];
  raw_message: string;
}

export interface RequestEvent {
  readonly post_type: 'request';
  readonly request_type: 'friend' | 'group';
  readonly sub_type?: string;
  readonly user_id: number;
  readonly nickname: string;
  readonly flag: string;
  readonly time: number;
  approve(yes?: boolean): Promise<boolean>;
}

export interface FriendRequestEvent extends RequestEvent {
  readonly request_type: 'friend';
  readonly sub_type: 'add';
  readonly source: string;
  readonly comment: string;
  readonly age: number;
  readonly sex: Gender;
}

export interface GroupRequestEvent extends RequestEvent {
  readonly request_type: 'group';
  readonly sub_type: 'add';
  readonly group_id: number;
  readonly group_name: string;
  readonly comment: string;
  readonly inviter_id: number;
  readonly tips: string;
}

export interface GroupInviteEvent extends RequestEvent {
  readonly request_type: 'group';
  readonly sub_type: 'invite';
  readonly group_id: number;
  readonly group_name: string;
  readonly comment: string;
  readonly role: GroupRole;
}
