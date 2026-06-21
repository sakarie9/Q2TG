import Telegram from '../client/Telegram';
import SetupService from '../services/SetupService';
import { Api } from 'telegram';
import { getLogger, Logger } from 'log4js';
import { Button } from 'telegram/tl/custom/button';
import setupHelper from '../helpers/setupHelper';
import commands from '../constants/commands';
import { WorkMode } from '../types/definitions';
import Instance from '../models/Instance';
import env from '../models/env';
import { QQClient } from '../client/QQClient';
import posthog from '../models/posthog';
import db from '../models/db';

export default class SetupController {
  private readonly setupService: SetupService;
  private readonly log: Logger;
  private isInProgress = false;
  private waitForFinishCallbacks: Array<(ret: { tgUser?: Telegram, qqClient: QQClient }) => unknown> = [];
  // 创建的 UserBot
  private tgUser?: Telegram;
  private qqClient: QQClient;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram) {
    this.log = getLogger(`SetupController - ${instance.id}`);
    this.setupService = new SetupService(this.instance, tgBot);
    tgBot.addNewMessageEventHandler(this.handleMessage);
    tgBot.setCommands(commands.preSetupCommands, new Api.BotCommandScopeUsers());
  }

  private handleMessage = async (message: Api.Message) => {
    if (this.isInProgress || !message.isPrivate) {
      return false;
    }

    if (message.message === '/setup' || message.message === '/start setup' || message.message === '/start') {
      this.isInProgress = true;
      await this.doSetup(Number(message.sender.id));
      await this.finishSetup();
      return true;
    }

    return false;
  };

  private async doSetup(ownerId: number) {
    // 设置 owner
    try {
      await this.setupService.claimOwner(ownerId);
    }
    catch (e) {
      this.log.error('Claim Owner 失败', e);
      posthog.capture('Claim Owner 失败', { error: e });
      this.isInProgress = false;
      throw e;
    }
    // 设置工作模式
    let workMode: WorkMode | '' = '';
    try {
      while (!workMode) {
        const workModeText = await this.setupService.waitForOwnerInput('欢迎使用 Q2TG v4\n' +
          '请选择工作模式，关于工作模式的区别请查看<a href="https://github.com/Clansty/Q2TG#%E5%85%B3%E4%BA%8E%E6%A8%A1%E5%BC%8F">这里</a>', [
          [Button.text('个人模式', true, true)],
          [Button.text('群组模式', true, true)],
        ]);
        workMode = setupHelper.convertTextToWorkMode(workModeText);
      }
      this.setupService.setWorkMode(workMode);
    }
    catch (e) {
      this.log.error('设置工作模式失败', e);
      posthog.capture('设置工作模式失败', { error: e });
      this.isInProgress = false;
      throw e;
    }
    // 连接 QQ 后端
    if (this.instance.qq) {
      if (this.instance.qq.type !== 'napcat') {
        throw new Error('当前实例仍配置为已移除的旧 QQ 后端，请在数据库中改用 NapCat 后端后重试');
      }
      await this.setupService.informOwner('正在连接已设置好的 NapCat');
      this.qqClient = await QQClient.create({
        type: 'napcat',
        id: this.instance.qq.id,
        wsUrl: this.instance.qq.wsUrl,
      });
    }
    else if (env.NAPCAT_WS_URL && this.instance.id === 0) {
      await this.tryConnectNapCat(env.NAPCAT_WS_URL);
    }
    else {
      let wsUrl = '';
      while (!wsUrl) {
        const input = await this.setupService.waitForOwnerInput('请输入 NapCat WebSocket 地址，例如 ws://napcat:3001');
        if (/wss?:\/\//.test(input)) {
          wsUrl = input;
        }
        else {
          await this.setupService.informOwner('地址格式不正确，请输入 ws:// 或 wss:// 开头的 NapCat WebSocket 地址');
        }
      }
      await this.tryConnectNapCat(wsUrl);
    }
    // 登录 tg UserBot
    if (env.DISABLE_TG_USERBOT) {
      await this.setupService.informOwner('UserBot 已通过环境变量禁用，跳过登录。之后需要启用时请移除 DISABLE_TG_USERBOT 并重启。');
      return;
    }
    if (this.instance.userSessionId) {
      try {
        await this.setupService.informOwner('正在连接已有 UserBot session');
        this.tgUser = await Telegram.connect(this.instance.userSessionId);
        await this.setupService.informOwner('UserBot 已连接');
        return;
      }
      catch (e) {
        this.log.error('连接已有 UserBot 失败', e);
        posthog.capture('连接已有 UserBot 失败', { error: e });
        await this.setupService.informOwner('已有 UserBot session 连接失败，将生成新的扫码登录二维码。');
      }
    }
    try {
      await this.setupService.informOwner('正在生成 UserBot 登录二维码，请用 Telegram 手机客户端扫码。');
      this.tgUser = await this.setupService.createUserBotByQrCode();
      this.instance.userSessionId = this.tgUser.sessionId;
      await this.setupService.informOwner(`UserBot 登录成功\n请使用下面的菜单开始创建转发！`);
    }
    catch (e) {
      this.log.error('创建 UserBot 失败，继续以 Bot 模式完成配置', e);
      posthog.capture('创建 UserBot 失败', { error: e });
      await this.setupService.informOwner(`UserBot 登录失败，已继续以 Bot 模式完成配置。\n之后可发送 /userbot_login 重新扫码登录。\n<code>${e.message}</code>`);
    }
  }

  private async tryConnectNapCat(wsUrl: string) {
    try {
      const dbQQBot = await db.qqBot.create({
        data: {
          type: 'napcat',
          wsUrl,
        },
      });
      this.qqClient = await QQClient.create({
        ...dbQQBot,
        type: 'napcat',
      });
      this.instance.qqBotId = dbQQBot.id;
      await this.setupService.informOwner(`连接 NapCat 成功`);
    }
    catch (e) {
      this.log.error('连接 NapCat 失败', e);
      posthog.capture('连接 NapCat 失败', { error: e });
      await this.setupService.informOwner(`连接 NapCat 失败\n${e.message}`);
      this.isInProgress = false;
      throw e;
    }
  }

  private async finishSetup() {
    this.tgBot.removeNewMessageEventHandler(this.handleMessage);
    this.isInProgress = false;
    await this.setupService.finishConfig();
    this.waitForFinishCallbacks.forEach(e => e({
      tgUser: this.tgUser,
      qqClient: this.qqClient,
    }));
  }

  public waitForFinish() {
    return new Promise<{ tgUser?: Telegram, qqClient: QQClient }>(resolve => {
      this.waitForFinishCallbacks.push(resolve);
    });
  }
}
