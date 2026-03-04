// Member is the icqq group member class.
// This stub exists for TypeScript compilation only.
// instanceof Member checks will always be false when icqq is not installed.
export declare class Member {
  readonly gid: number;
  readonly uin: number;
  readonly client: any;
  info?: MemberInfo;
  card?: string;
  title?: string;
  is_owner: boolean;
  is_admin: boolean;
  renew(): Promise<MemberInfo>;
  [key: string]: any;
}

export interface MemberInfo {
  user_id: number;
  card: string;
  nickname: string;
  sex: string;
  age: number;
  join_time: number;
  last_sent_time: number;
  role: string;
  title: string;
  [key: string]: any;
}
