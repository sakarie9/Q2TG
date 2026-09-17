import { Friend, Group, GroupFs, GroupMember, MessageRet, QQEntity, QQUser, Quotable, Sendable, SendableElem } from '../QQClient';
import { NapCatClient } from './client';
import { messageElemToNapCatSendable, napCatForwardMultiple, napCatReceiveToMessageElem } from './convert';
import { getLogger, Logger } from 'log4js';
import posthog from '../../models/posthog';
import type { SendMessageSegment, WSSendReturn } from 'node-napcat-ts';
import { FileResult } from 'tmp-promise';

const createSpoilerExtra = (chain: Sendable) => {
  if (!Array.isArray(chain)) throw new Error('喵喵喵？（!Array.isArray(chain)）');
  const rChain = chain.filter(it => typeof it === 'object' && it.type === 'node');
  const last = rChain[rChain.length - 1];
  const text = (typeof last.message === 'object' && !Array.isArray(last.message) && last.message.type === 'text') ? last.message.text : '';
  const news = [{
    text: 'Spoiler 图片',
  }];
  if (text) {
    news.push({ text });
  }
  news.push({
    text: '请谨慎查看',
  });
  return {
    prompt: '[Spoiler 图片]',
    summary: 'Powered by Q2TG',
    source: `${rChain[0].nickname}:`,
  };
};

export abstract class NapCatEntity implements QQEntity {
  protected logger: Logger;

  protected constructor(public readonly client: NapCatClient) {
    this.logger = getLogger('NapCatEntity');
  }

  abstract dm: boolean;

  async getForwardMsg(resid: string, fileName?: string) {
    // @ts-ignore
    const data = await this.client.callApi('get_forward_msg', { message_id: resid });
    return napCatForwardMultiple(data.messages);
  }

  async getVideoUrl(fid: string, md5?: string | Buffer): Promise<string> {
    return fid;
  }

  async recallMsg(paramOrMessageId: number, rand?: number, timeOrPktNum?: number): Promise<boolean> {
    try {
      await this.client.callApi('delete_msg', { message_id: paramOrMessageId });
      return true;
    }
    catch (e) {
      this.logger.error('消息撤回失败', e);
      posthog.capture('NapCat 消息撤回失败', { error: e });
      return false;
    }
  }

  protected abstract sendMsgImpl(message: SendMessageSegment[], extra?: Record<string, any>): Promise<MessageRet>;

  async sendMsg(content: Sendable, source?: Quotable, isSpoiler?: boolean): Promise<MessageRet> {
    if (!Array.isArray(content)) {
      content = [content];
    }
    content = content.map(it => {
      if (typeof it === 'string') {
        return { type: 'text', text: it };
      }
      return it;
    });

    const tmpFiles: FileResult[] = [];
    const message = await Promise.all(content.map(async it => {
      const { elem, tempFiles } = await messageElemToNapCatSendable(it as SendableElem);
      tmpFiles.push(...tempFiles);
      return elem;
    }));
    if (source) {
      // 优先使用真实的 msg_seq 构建引用回复：NapCat 重启后 msg_id 的短 ID 映射会丢失，
      // 只带 id 的 reply 段会被 NapCat 直接丢弃（在 QQ 端看不到引用）。
      // seq 是服务端持久有效的，NapCat 会通过 seq 重新拉取原消息。
      let realSeq = source.rand;
      if (!realSeq) {
        // 历史数据没有存 msg_seq，先拉一次历史消息让 NapCat 重新缓存原消息，
        // 顺便从返回结果里取出真实的 msg_seq
        realSeq = await this.tryWarmUpReplySource(source.seq);
      }
      message.unshift({
        type: 'reply',
        data: {
          id: source.seq.toString(),
          ...(realSeq ? { seq: realSeq } : {}),
        },
      } as unknown as SendMessageSegment);
    }

    const ret = await this.sendMsgImpl(message, isSpoiler ? createSpoilerExtra(content) : {});
    tmpFiles.forEach(it => it.cleanup());
    return ret;
  }

  /**
   * 拉取引用原消息所在的历史消息，让 NapCat 重新缓存该消息。
   * 用于没有 msg_seq 的历史数据，避免 NapCat 重启后引用回复失效。
   * @returns 如果历史消息里能找回原消息，返回它真实的 msg_seq
   */
  protected abstract fetchHistoryForReply(seq: number): Promise<unknown>;

  private async tryWarmUpReplySource(seq: number): Promise<number | undefined> {
    let timer: NodeJS.Timeout | undefined;
    try {
      // 加超时，避免 NapCat 无响应时卡住整条回复消息的发送
      const result = await Promise.race([
        this.fetchHistoryForReply(seq),
        new Promise<undefined>((_, reject) => {
          timer = setTimeout(() => reject(new Error('获取引用消息历史超时')), 5000);
          timer.unref?.();
        }),
      ]);
      const messages = (result as { messages?: Array<{ message_id?: number | string; real_seq?: number | string; }> } | undefined)?.messages;
      const target = messages?.find(it => Number(it.message_id) === seq);
      const realSeq = Number(target?.real_seq);
      return realSeq || undefined;
    }
    catch (e) {
      this.logger.warn('拉取引用消息历史失败，将尝试直接回复', seq, e);
      return undefined;
    }
    finally {
      if (timer) clearTimeout(timer);
    }
  }

  // 文件会被下载，返回的是绝对路径
  async getFileUrl(fid: string): Promise<string> {
    const data = await this.client.callApi('get_file', { file: fid });
    return data.file;
  }
}

abstract class NapCatUser extends NapCatEntity implements QQUser {
  public readonly dm = true;
  nickname: string;

  protected constructor(client: NapCatClient,
                        public readonly uin: number) {
    super(client);
  }

  protected async sendMsgImpl(message: SendMessageSegment[], extra = {}): Promise<MessageRet> {
    const data = await this.client.callApi('send_private_msg', {
      user_id: this.uin,
      ...extra,
      // @ts-ignore 库的问题
      message,
    });
    return {
      message_id: data.message_id.toString(),
      seq: data.message_id,
      time: Date.now() / 1000,
      rand: 0,
    };
  }

  protected async fetchHistoryForReply(seq: number) {
    return await this.client.callApi('get_friend_msg_history', {
      user_id: this.uin,
      message_seq: seq,
      count: 1,
    });
  }

  async poke(self?: boolean): Promise<boolean> {
    if (self) {
      throw new Error('NapCat 不支持自己戳自己');
    }
    try {
      await this.client.callApi('friend_poke', { user_id: this.uin });
      return true;
    }
    catch (e) {
      this.logger.error('戳一戳失败', e);
      posthog.capture('NapCat 戳一戳失败', { error: e });
      return false;
    }
  }
}

export class NapCatFriend extends NapCatUser implements Friend {
  remark: string;

  private constructor(client: NapCatClient, uid: number) {
    super(client, uid);
  }

  public static async create(client: NapCatClient, uid: number): Promise<NapCatFriend> {
    const instance = new this(client, uid);
    await instance.renew();
    return instance;
  }

  public static createExisted(client: NapCatClient, info: { nickname: string, remark: string, uid: number }) {
    const instance = new this(client, info.uid);
    instance.nickname = info.nickname;
    instance.remark = info.remark;
    return instance;
  }

  async renew() {
    const data = await this.client.callApi('get_stranger_info', { user_id: this.uin });
    this.nickname = data.nickname;
    this.remark = data.remark;
    return data;
  }

  async sendFile(file: string, filename: string): Promise<string> {
    await this.client.callApi('upload_private_file', {
      user_id: this.uin,
      file,
      name: filename,
    });
    return filename;
  }
}

class NapCatGFS implements GroupFs {
  public constructor(private client: NapCatClient, private gid: number) {
  }

  async upload(file: string | Buffer | Uint8Array, pid?: string, name?: string, callback?: (percentage: string) => void) {
    if (typeof file !== 'string') {
      throw new Error('TODO');
    }
    return await this.client.callApi('upload_group_file', {
      group_id: this.gid,
      file,
      name,
      folder_id: pid,
    });
  }
}

export class NapCatGroup extends NapCatEntity implements Group {
  readonly dm = false;
  name: string;
  fs: GroupFs;

  is_owner = false;
  is_admin = false;

  private constructor(client: NapCatClient,
                      public readonly gid: number) {
    super(client);
    this.logger = getLogger(`NapCatGroup - ${client.id} - ${gid}`);
    this.fs = new NapCatGFS(client, gid);
  }

  public static async create(client: NapCatClient, gid: number) {
    const instance = new this(client, gid);
    await instance.renew();
    return instance;
  }

  public static createExisted(client: NapCatClient, info: { gid: number, name: string }) {
    const instance = new this(client, info.gid);
    instance.name = info.name;
    return instance;
  }

  async renew() {
    const data = await this.client.callApi('get_group_info', { group_id: this.gid });
    this.name = data.group_name;
    const memberData = await this.client.callApi('get_group_member_info', {
      group_id: this.gid,
      user_id: this.client.uin,
    });
    this.is_owner = memberData.role === 'owner';
    this.is_admin = memberData.role === 'admin';
    return data;
  }

  protected async sendMsgImpl(message: SendMessageSegment[], extra = {}): Promise<MessageRet> {
    const data = await this.client.callApi('send_group_msg', {
      group_id: this.gid,
      ...extra,
      // @ts-ignore 库的问题
      message,
    });
    return {
      message_id: data.message_id.toString(),
      seq: data.message_id,
      time: Date.now() / 1000,
      rand: 0,
    };
  }

  protected async fetchHistoryForReply(seq: number) {
    return await this.client.callApi('get_group_msg_history', {
      group_id: this.gid,
      message_seq: seq,
      count: 1,
    });
  }

  pickMember(uid: number, strict?: boolean): GroupMember {
    return new NapCatGroupMember(this.client, this.gid, uid);
  }

  async muteMember(uid: number, duration = 600): Promise<void> {
    await this.client.callApi('set_group_ban', {
      group_id: this.gid,
      user_id: uid,
      duration: duration,
    });
  }

  async setCard(uid: number, card?: string): Promise<boolean> {
    try {
      await this.client.callApi('set_group_card', {
        group_id: this.gid,
        user_id: uid,
        card: card,
      });
      return true;
    }
    catch (e) {
      this.logger.error('设置群名片失败', e);
      posthog.capture('NapCat 设置群名片失败', { error: e });
      return false;
    }
  }

  async getAllMemberInfo() {
    // lib bug
    return await this.client.callApi('get_group_member_list', { group_id: this.gid }) as unknown as WSSendReturn['get_group_member_info'][];
  }

  async announce(content: string): Promise<any> {
    return await this.client.callApi('_send_group_notice', {
      group_id: this.gid,
      content,
    });
  }

  async pokeMember(uid: number): Promise<boolean> {
    try {
      await this.client.callApi('group_poke', {
        group_id: this.gid,
        user_id: uid,
      });
      return true;
    }
    catch (e) {
      this.logger.error('戳一戳失败', e);
      posthog.capture('NapCat 戳一戳失败', { error: e });
      return false;
    }
  }

  override async getFileUrl(fid: string): Promise<string> {
    const data = await this.client.callApi('get_group_file_url', { group_id: this.gid, file_id: fid });
    return data.url;
  }
}

export class NapCatGroupMember extends NapCatUser implements GroupMember {
  public constructor(client: NapCatClient,
                     public readonly gid: number,
                     uid: number) {
    super(client, uid);
  }

  async renew() {
    return await this.client.callApi('get_group_member_info', {
      group_id: this.gid,
      user_id: this.uin,
    });
  }

  async getProfile() {
    const user = await this.client.pickFriend(this.uin) as NapCatFriend;
    const info = await user.renew();
    return {
      birthday: [(info as any).birthday_year, (info as any).birthday_month, (info as any).birthday_day],
      email: (info as any).eMail,
      nickname: info.nickname,
      city: (info as any).city || (info as any).detail?.commonExt?.city,
      QID: (info as any).qid,
      country: (info as any).country || (info as any).detail?.commonExt?.country || '',
      province: (info as any).province || (info as any).detail?.commonExt?.province || '',
      signature: '',
      regTimestamp: (info as any).regTime || (info as any).detail?.commonExt?.regTime || '',
    };
  }
}
