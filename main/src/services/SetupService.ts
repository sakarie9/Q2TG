import Telegram from '../client/Telegram';
import { getLogger, Logger } from 'log4js';
import { BigInteger } from 'big-integer';
import { MarkupLike } from 'telegram/define';
import { Button } from 'telegram/tl/custom/button';
import { WorkMode } from '../types/definitions';
import TelegramChat from '../client/TelegramChat';
import Instance from '../models/Instance';
import createUserBotByQrCode from '../helpers/userBotLogin';

export default class SetupService {
  private owner: TelegramChat;
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram) {
    this.log = getLogger(`SetupService - ${instance.id}`);
  }

  public setWorkMode(mode: WorkMode) {
    this.instance.workMode = mode;
  }

  /**
   * 在设置阶段，第一个 start bot 的用户成为 bot 主人
   * @param userId 申请成为主人的用户 ID
   * @return {boolean} 是否成功，false 的话就是被占用了
   */
  public async claimOwner(userId: number | BigInteger) {
    userId = Number(userId);
    if (!this.owner) {
      this.instance.owner = userId;
      await this.setupOwner();
      this.log.info(`用户 ID: ${userId} 成为了 Bot 主人`);
      return true;
    }
    return false;
  }

  private async setupOwner() {
    if (!this.owner && this.instance.owner) {
      this.owner = await this.tgBot.getChat(this.instance.owner);
    }
  }

  public async informOwner(message: string, buttons?: MarkupLike) {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    return await this.owner.sendMessage({ message, buttons: buttons || Button.clear(), linkPreview: false });
  }

  public async waitForOwnerInput(message?: string, buttons?: MarkupLike, remove = false) {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    message && await this.informOwner(message, buttons);
    const reply = await this.owner.waitForInput();
    remove && await reply.delete({ revoke: true });
    return reply.message;
  }

  public async createUserBotByQrCode() {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    return await createUserBotByQrCode(this.owner, (err) => this.log.error(err));
  }

  public async finishConfig() {
    this.instance.isSetup = true;
  }
}
