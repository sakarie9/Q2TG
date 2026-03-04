// Stub module that provides type definitions from @icqqjs/icqq
// without requiring the actual npm package to be installed.
// OicqClient.ts uses dynamic require() for runtime icqq access.

export * from './lib/common';
export * from './lib/message/elements';
export { Platform, Domain, ApiRejection, Device, Apk } from './lib/core/index';
export { Config, LogLevel } from './lib/client';
export { Converter, rand2uuid, Image } from './lib/message/index';

// ── Types re-declared from icqq events / messages ────────────────────────────

import type { Gender, GroupRole } from './lib/common';
import type {
  MessageElem, Sendable, ImageElem, Quotable, Forwardable,
} from './lib/message/elements';
import type { Config } from './lib/client';

/** 发消息的返回值 */
export interface MessageRet {
  message_id: string;
  seq: number;
  rand: number;
  time: number;
}

/** 所有申请共通属性 */
export interface RequestEvent {
  post_type: 'request';
  user_id: number;
  nickname: string;
  flag: string;
  seq: number;
  time: number;
  approve(yes?: boolean): Promise<boolean>;
}

/** 好友申请 */
export interface FriendRequestEvent extends RequestEvent {
  request_type: 'friend';
  sub_type: 'add' | 'single';
  comment: string;
  source: string;
  age: number;
  sex: Gender;
}

/** 群申请 */
export interface GroupRequestEvent extends RequestEvent {
  request_type: 'group';
  sub_type: 'add';
  group_id: number;
  group_name: string;
  comment: string;
  inviter_id?: number;
  tips: string;
}

/** 群邀请 */
export interface GroupInviteEvent extends RequestEvent {
  request_type: 'group';
  sub_type: 'invite';
  group_id: number;
  group_name: string;
  role: GroupRole;
}

/** 好友增加 */
export interface FriendIncreaseEvent {
  post_type: 'notice';
  notice_type: 'friend';
  sub_type: 'increase';
  user_id: number;
  nickname: string;
  friend: Friend;
}

/** 好友消息撤回 */
export interface FriendRecallEvent {
  post_type: 'notice';
  notice_type: 'friend';
  sub_type: 'recall';
  user_id: number;
  operator_id: number;
  message_id: string;
  seq: number;
  rand: number;
  time: number;
  friend: Friend;
}

/** 好友戳一戳 */
export interface FriendPokeEvent {
  post_type: 'notice';
  notice_type: 'friend';
  sub_type: 'poke';
  user_id: number;
  operator_id: number;
  target_id: number;
  action: string;
  suffix: string;
  friend: Friend;
}

/** 群通知共通 */
export interface GroupNoticeEvent {
  post_type: 'notice';
  notice_type: 'group';
  group_id: number;
  group: Group;
}

/** 群员增加 */
export interface MemberIncreaseEvent extends GroupNoticeEvent {
  sub_type: 'increase';
  user_id: number;
  nickname: string;
}

/** 群员减少 */
export interface MemberDecreaseEvent extends GroupNoticeEvent {
  sub_type: 'decrease';
  operator_id: number;
  user_id: number;
  dismiss: boolean;
  member?: any;
}

/** 群消息撤回 */
export interface GroupRecallEvent extends GroupNoticeEvent {
  sub_type: 'recall';
  user_id: number;
  operator_id: number;
  message_id: string;
  seq: number;
  rand: number;
  time: number;
}

/** 群戳一戳 */
export interface GroupPokeEvent extends GroupNoticeEvent {
  sub_type: 'poke';
  user_id: number;
  operator_id: number;
  target_id: number;
  action: string;
  suffix: string;
}

/** 私聊消息 */
export interface PrivateMessage {
  message_type: 'private';
  message_id: string;
  user_id: number;
  sender: {
    user_id: number;
    nickname: string;
    group_id?: number;
    card?: string;
  };
  message: MessageElem[];
  raw_message: string;
  seq: number;
  rand: number;
  pktnum: number;
  time: number;
  source?: any;
  friend: Friend;
}

/** 群消息 */
export interface GroupMessage {
  message_type: 'group';
  message_id: string;
  user_id: number;
  group_id: number;
  sender: {
    user_id: number;
    nickname: string;
    card?: string;
    [key: string]: any;
  };
  message: MessageElem[];
  raw_message: string;
  seq: number;
  rand: number;
  pktnum: number;
  time: number;
  source?: any;
  anonymous?: { name: string } | null;
  atme: boolean;
  atall: boolean;
  group: Group;
}

/** 私聊消息事件 */
export interface PrivateMessageEvent extends PrivateMessage {
  friend: Friend;
}

/** 群消息事件 */
export interface GroupMessageEvent extends GroupMessage {
  recall(): Promise<boolean>;
  group: Group;
  member: Member;
}

/** 讨论组消息事件 */
export interface DiscussMessageEvent {
  message_type: 'discuss';
  message: MessageElem[];
  sender: any;
  seq: number;
  rand: number;
  pktnum: number;
  time: number;
  source?: any;
  raw_message: string;
  message_id: string;
}

// ── Class declarations: OicqClient uses these via dynamic require ─────────────

/** 好友 */
export declare class Friend {
  readonly uin: number;
  readonly nickname: string;
  readonly remark: string;
  readonly class_id: number;
  readonly client: Client;
  sendMsg(content: Sendable, source?: Quotable): Promise<MessageRet>;
  recallMsg(seq: number, rand: number, time?: number): Promise<boolean>;
  getForwardMsg(resid: string, fileName?: string): Promise<any[]>;
  uploadImages(imgs: ImageElem[]): Promise<any>;
  sendFile(file: string, filename: string): Promise<string>;
  poke(friendUin?: boolean): Promise<boolean>;
  pokeMember?(uin: number): Promise<boolean>;
  [key: string]: any;
}

/** 群 */
export declare class Group {
  readonly gid: number;
  readonly name: string;
  readonly is_owner: boolean;
  readonly is_admin: boolean;
  readonly info?: any;
  readonly client: Client;
  sendMsg(content: Sendable, source?: Quotable): Promise<MessageRet>;
  recallMsg(seq: number, rand: number, pktnum?: number): Promise<boolean>;
  getForwardMsg(resid: string, fileName?: string): Promise<any[]>;
  pickMember(uin: number, strict?: boolean): Member;
  uploadImages(imgs: ImageElem[]): Promise<any>;
  muteMember(uin: number, duration?: number): Promise<void>;
  setCard(uin: number, card?: string): Promise<boolean>;
  announce(content: string): Promise<any>;
  poke(uin: number): Promise<boolean>;
  pokeMember(uin: number): Promise<boolean>;
  fs: any;
  [key: string]: any;
}

/** Discuss */
export declare class Discuss {
  readonly gid: number;
  sendMsg(content: Sendable): Promise<MessageRet>;
  [key: string]: any;
}

/** 群员 */
export declare class Member {
  readonly gid: number;
  readonly uin: number;
  readonly client: Client;
  info?: any;
  card?: string;
  title?: string;
  is_owner: boolean;
  is_admin: boolean;
  renew(): Promise<any>;
  [key: string]: any;
}

/** icqq Client */
export declare class Client {
  readonly uin: number;
  readonly nickname: string;
  readonly fl: Map<number, any>;
  readonly sl: Map<number, any>;
  readonly gl: Map<number, any>;
  readonly classes: Map<number, string>;
  readonly config: Required<Config>;
  login(uin?: number, password?: string): void;
  isOnline(): boolean;
  submitSlider(ticket: string): void;
  submitSmsCode(code: string): void;
  sendSmsCode(): Promise<void>;
  pickFriend(uin: number, strict?: boolean): Friend;
  pickGroup(gid: number, strict?: boolean): Group;
  pickMember(gid: number, uin: number, strict?: boolean): Member;
  on(event: string, listener: (...args: any[]) => void): any;
  off(event: string): void;
  trap(event: string, listener: (...args: any[]) => void): any;
  trapOnce(event: string, listener: (...args: any[]) => void): any;
  offTrap(event: string, listener: (...args: any[]) => void): void;
  sendOidbSvcTrpcTcp(cmd: string, body: Uint8Array): Promise<any>;
  getProfile(uin: number): Promise<any>;
  getSign(cmd: string, seq: number, body: Buffer): Promise<Buffer>;
  getMsg(messageId: string): Promise<any>;
  [key: string]: any;
}

