import { Friend, Group, QQClient } from '../client/QQClient';
import TelegramChat from '../client/TelegramChat';
import Telegram from '../client/Telegram';
import db from './db';
import { Entity } from 'telegram/define';
import { BigInteger } from 'big-integer';
import { Pair } from './Pair';
import { getLogger, Logger } from 'log4js';
import Instance from './Instance';

export default class ForwardPairs {
  private pairs: Pair[] = [];
  private readonly log: Logger;

  private constructor(private readonly instanceId: number) {
    this.log = getLogger(`ForwardPairs - ${instanceId}`);
  }

  private getMarkedChannelId(chatId: number) {
    return chatId > 0 ? Number(`-100${chatId}`) : chatId;
  }

  private formatError(e: unknown) {
    if (e instanceof Error) {
      return `${e.name}: ${e.message}`;
    }
    return String(e);
  }

  private async getTelegramChat(tg: Telegram, chatId: number): Promise<TelegramChat> {
    try {
      return await tg.getChat(chatId);
    }
    catch (e) {
      const markedChannelId = this.getMarkedChannelId(chatId);
      if (markedChannelId === chatId) {
        throw e;
      }
      try {
        return await tg.getChat(markedChannelId);
      }
      catch (markedError) {
        throw new Error(
          `原始 ID ${chatId} 解析失败: ${this.formatError(e)}; ` +
          `频道 ID ${markedChannelId} 解析失败: ${this.formatError(markedError)}`,
        );
      }
    }
  }

  // 在 forwardController 创建时初始化
  private async init(qqClient: QQClient, tgBot: Telegram, tgUser: Telegram) {
    const dbValues = await db.forwardPair.findMany({
      where: { instanceId: this.instanceId },
    });
    for (const i of dbValues) {
      try {
        const qq = await qqClient.getChat(Number(i.qqRoomId), i.qqFromGroupId ? Number(i.qqFromGroupId) : undefined);
        const tg = await this.getTelegramChat(tgBot, Number(i.tgChatId));
        let tgUserChat: TelegramChat;
        try {
          tgUserChat = await this.getTelegramChat(tgUser, Number(i.tgChatId));
        }
        catch (e) {
          this.log.warn(
            `UserBot 无法解析 TG: ${i.tgChatId}，使用 Bot 会话兜底；部分 UserBot 相关功能可能不可用`,
            this.formatError(e),
          );
          tgUserChat = tg;
        }
        if (qq && tg && tgUserChat) {
          this.log.debug('初始化', { qq, tg, tgUserChat });
          this.pairs.push(new Pair(qq, tg, tgUserChat, i.id, i.flags, i.apiKey, qqClient));
        }
      }
      catch (e) {
        this.log.warn(`初始化遇到问题，QQ: ${i.qqRoomId} TG: ${i.tgChatId}`, this.formatError(e));
      }
    }
    this.log.info(`初始化完成，加载 ${this.pairs.length}/${dbValues.length} 个关联`);
  }

  public static async load(instanceId: number, qqClient: QQClient, tgBot: Telegram, tgUser: Telegram) {
    const instance = new this(instanceId);
    await instance.init(qqClient, tgBot, tgUser);
    return instance;
  }

  public async add(qq: Friend | Group, tg: TelegramChat, tgUser: TelegramChat, qqClient: QQClient, qqFromGroupId?: number) {
    const dbEntry = await db.forwardPair.create({
      data: {
        qqRoomId: 'uin' in qq ? qq.uin : -qq.gid,
        tgChatId: Number(tg.id),
        instanceId: this.instanceId,
        qqFromGroupId,
      },
    });
    this.pairs.push(new Pair(qq, tg, tgUser, dbEntry.id, dbEntry.flags, dbEntry.apiKey, qqClient));
    return dbEntry;
  }

  public async remove(pair: Pair) {
    this.pairs.splice(this.pairs.indexOf(pair), 1);
    await db.forwardPair.delete({
      where: { id: pair.dbId },
    });
  }

  public find(target: Friend | Group | TelegramChat | Entity | number | BigInteger) {
    if (!target) return null;
    if (typeof target === 'object' && 'uin' in target) {
      return this.pairs.find(e => 'uin' in e.qq && e.qq.uin === target.uin && e.qq.dm);
    }
    else if (typeof target === 'object' && 'gid' in target) {
      return this.pairs.find(e => 'gid' in e.qq && e.qq.gid === target.gid && !e.qq.dm);
    }
    else if (typeof target === 'number' || 'eq' in target) {
      return this.pairs.find(e => e.qqRoomId === target || e.tg.id.eq(target));
    }
    else {
      return this.pairs.find(e => e.tg.id.eq(target.id));
    }
  }

  public async initMapInstance(instances: Instance[]) {
    return;
  }

  public getAll() {
    return this.pairs;
  }
}
