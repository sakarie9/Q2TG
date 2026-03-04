// Ambient module stub for @icqqjs/icqq
// This file provides type-only declarations so the UI can compile without the actual icqq npm package.
declare module '@icqqjs/icqq' {
  export interface MessageElem {
    type: string;
    [key: string]: any;
  }

  export declare class ForwardMessage {
    user_id: number;
    uid: string;
    nickname: string;
    group_id?: number;
    time: number;
    seq: number;
    message: MessageElem[];
    raw_message: string;
    avatar?: string;
  }
}
