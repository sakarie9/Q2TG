import { WorkMode } from '../types/definitions';
import db from './db';
import ConfigController from '../controllers/ConfigController';
import SetupController from '../controllers/SetupController';
import ForwardController from '../controllers/ForwardController';
import DeleteMessageController from '../controllers/DeleteMessageController';
import FileAndFlashPhotoController from '../controllers/FileAndFlashPhotoController';
import Telegram from '../client/Telegram';
import { getLogger, Logger } from 'log4js';
import ForwardPairs from './ForwardPairs';
import InstanceManageController from '../controllers/InstanceManageController';
import InChatCommandsController from '../controllers/InChatCommandsController';
import { Api } from 'telegram';
import commands from '../constants/commands';
import TelegramChat from '../client/TelegramChat';
import RequestController from '../controllers/RequestController';
import { MarkupLike } from 'telegram/define';
import { Button } from 'telegram/tl/custom/button';
import { QqBot } from '@prisma/client';
import HugController from '../controllers/HugController';
import QuotLyController from '../controllers/QuotLyController';
import MiraiSkipFilterController from '../controllers/MiraiSkipFilterController';
import env from './env';
import AliveCheckController from '../controllers/AliveCheckController';
import { QQClient } from '../client/QQClient';
import posthog from './posthog';
import LoadingController from '../controllers/LoadingController';
import TypingController from '../controllers/TypingController';
import GroupNameRefreshController from '../controllers/GroupNameRefreshController';
import createUserBotByQrCode from '../helpers/userBotLogin';

export default class Instance {
  public static readonly instances: Instance[] = [];

  private _owner = 0;
  private _isSetup = false;
  private _workMode = '';
  private _botSessionId = 0;
  private _userSessionId = 0;
  private _qq: QqBot;
  private _flags: number;

  private readonly log: Logger;

  public tgBot: Telegram;
  public tgUser?: Telegram;
  public qqClient: QQClient;
  public isInit = false;

  private _ownerChat: TelegramChat;

  public forwardPairs: ForwardPairs;
  private setupController: SetupController;
  private instanceManageController: InstanceManageController;
  private requestController: RequestController;
  private configController: ConfigController;
  private deleteMessageController: DeleteMessageController;
  private inChatCommandsController: InChatCommandsController;
  private forwardController: ForwardController;
  private fileAndFlashPhotoController: FileAndFlashPhotoController;
  private hugController: HugController;
  private quotLyController: QuotLyController;
  private miraiSkipFilterController: MiraiSkipFilterController;
  private aliveCheckController: AliveCheckController;
  private loadingController: LoadingController;
  private typingController: TypingController;
  private groupNameRefreshController: GroupNameRefreshController;
  private userBotLoginPromise?: Promise<boolean>;

  private constructor(public readonly id: number) {
    this.log = getLogger(`Instance - ${this.id}`);
  }

  private async load() {
    const dbEntry = await db.instance.findFirst({
      where: { id: this.id },
      include: { qqBot: true },
    });

    if (!dbEntry) {
      if (this.id === 0) {
        // 创建零号实例
        await db.instance.create({
          data: { id: 0 },
        });
        return;
      }
      else
        throw new Error('Instance not found');
    }

    this._owner = Number(dbEntry.owner);
    this._qq = dbEntry.qqBot;
    this._botSessionId = dbEntry.botSessionId;
    this._userSessionId = dbEntry.userSessionId;
    this._isSetup = dbEntry.isSetup;
    this._workMode = dbEntry.workMode;
    this._flags = dbEntry.flags;
  }

  private init(botToken?: string) {
    (async () => {
      this.log.debug('正在登录 TG Bot');
      if (this.botSessionId) {
        this.tgBot = await Telegram.connect(this._botSessionId);
      }
      else {
        const token = this.id === 0 ? env.TG_BOT_TOKEN : botToken;
        if (!token) {
          throw new Error('botToken 未指定');
        }
        this.tgBot = await Telegram.create({
          botAuthToken: token,
        });
        this.botSessionId = this.tgBot.sessionId;
      }
      this.log.info('TG Bot 登录完成');
      if (!this.isSetup || !this._owner) {
        this.log.info('当前服务器未配置，请向 Bot 发送 /setup 来设置');
        this.setupController = new SetupController(this, this.tgBot);
        // 这会一直卡在这里，所以要新开一个异步来做，提前返回掉上面的
        ({ tgUser: this.tgUser, qqClient: this.qqClient } = await this.setupController.waitForFinish());
        this._ownerChat = await this.tgBot.getChat(this.owner);
      }
      else {
        this._ownerChat = await this.tgBot.getChat(this.owner);
        await this.tryConnectUserBot();
        this.log.debug('正在连接 QQ 后端');
        if (this.qq.type !== 'napcat') {
          throw new Error('当前实例仍配置为已移除的旧 QQ 后端，请在数据库中改用 NapCat 后端后重试');
        }
        this.qqClient = await QQClient.create({
          type: 'napcat',
          id: this.qq.id,
          wsUrl: this.qq.wsUrl,
        });
        this.log.info('QQ 后端连接完成');
      }
      this.aliveCheckController = new AliveCheckController(this, this.tgBot, this.tgUser, this.qqClient);
      this.loadingController = new LoadingController(this, this.tgBot, this.tgUser, this.qqClient);
      this.forwardPairs = await ForwardPairs.load(this.id, this.qqClient, this.tgBot, this.tgUser);
      this.setupCommands()
        .then(() => this.log.info('命令设置成功'))
        .catch(e => {
          this.log.error('命令设置错误', e);
          posthog.capture('命令设置错误', { error: e });
        });
      if (this.id === 0) {
        this.instanceManageController = new InstanceManageController(this, this.tgBot);
      }
      this.requestController = new RequestController(this, this.tgBot, this.qqClient);
      this.configController = new ConfigController(this, this.tgBot, this.tgUser, this.qqClient);
      this.deleteMessageController = new DeleteMessageController(this, this.tgBot, this.tgUser, this.qqClient);
      this.miraiSkipFilterController = new MiraiSkipFilterController(this, this.tgBot, this.tgUser, this.qqClient);
      this.inChatCommandsController = new InChatCommandsController(this, this.tgBot, this.tgUser, this.qqClient);
      this.quotLyController = new QuotLyController(this, this.tgBot, this.qqClient);
      this.typingController = new TypingController(this, this.tgBot, this.tgUser, this.qqClient);
      this.forwardController = new ForwardController(this, this.tgBot, this.tgUser, this.qqClient);
      if (this.workMode === 'group') {
        this.hugController = new HugController(this, this.tgBot, this.qqClient);
      }
      else {
        this.groupNameRefreshController = new GroupNameRefreshController(this, this.tgBot, this.tgUser, this.qqClient);
      }
      this.fileAndFlashPhotoController = new FileAndFlashPhotoController(this, this.tgBot, this.qqClient);
      this.isInit = true;
      this.loadingController.off();
    })()
      .then(() => this.log.info('初始化已完成'));
  }

  private async tryConnectUserBot() {
    if (env.DISABLE_TG_USERBOT) {
      this.log.warn('环境变量 DISABLE_TG_USERBOT 已启用，跳过 TG UserBot 登录');
      await this.notifyOwner('UserBot 已通过环境变量禁用。需要启用时请移除 DISABLE_TG_USERBOT 并重启。');
      return;
    }
    if (!this._userSessionId) {
      this.log.warn('未配置 TG UserBot session，跳过 TG UserBot 登录');
      await this.notifyOwner('UserBot 未登录，部分功能不可用。请发送 /login 扫码登录。');
      return;
    }
    try {
      this.log.debug('正在登录 TG UserBot');
      this.tgUser = await Telegram.connect(this._userSessionId);
      this.log.info('TG UserBot 登录完成');
    }
    catch (e) {
      this.tgUser = undefined;
      this.log.error('TG UserBot 登录失败，继续以 Bot 模式运行', e);
      posthog.capture('TG UserBot 登录失败', { error: e });
      await this.notifyOwner('UserBot 登录失败，程序已继续运行但部分功能不可用。请发送 /login 重新扫码登录。');
    }
  }

  public async loginUserBotWithQrCode() {
    if (this.userBotLoginPromise) {
      await this.notifyOwner('UserBot 扫码登录流程已经在进行中，请扫描最近收到的二维码。');
      return await this.userBotLoginPromise;
    }
    this.userBotLoginPromise = this.doLoginUserBotWithQrCode();
    try {
      return await this.userBotLoginPromise;
    }
    finally {
      this.userBotLoginPromise = undefined;
    }
  }

  private async doLoginUserBotWithQrCode() {
    if (env.DISABLE_TG_USERBOT) {
      await this.notifyOwner('UserBot 已通过环境变量禁用。需要启用时请移除 DISABLE_TG_USERBOT 并重启。');
      return false;
    }
    if (!this.ownerChat) {
      this._ownerChat = await this.tgBot.getChat(this.owner);
    }
    await this.notifyOwner('正在生成 UserBot 登录二维码，请在 Telegram 手机客户端中扫码。');
    const tgUser = await createUserBotByQrCode(this.ownerChat, (err) => this.log.error(err));
    if (this.tgUser) {
      await this.tgUser.disconnect().catch(() => 0);
    }
    this.tgUser = tgUser;
    this.userSessionId = tgUser.sessionId;
    this.forwardPairs && await this.forwardPairs.reload(this.qqClient, this.tgBot, this.tgUser);
    this.configController?.setUserBot(this.tgUser);
    this.deleteMessageController?.setUserBot(this.tgUser);
    this.forwardController?.setUserBot(this.tgUser);
    await this.notifyOwner('UserBot 登录成功。');
    return true;
  }

  private async notifyOwner(message: string) {
    try {
      if (!this.owner) return;
      const ownerChat = this.ownerChat || await this.tgBot.getChat(this.owner);
      await ownerChat.sendMessage({ message, linkPreview: false });
    }
    catch (e) {
      this.log.warn('通知 Owner 失败', e);
    }
  }

  public async login(botToken?: string) {
    await this.load();
    this.init(botToken);
  }

  public static async start(instanceId: number, botToken?: string) {
    const instance = new this(instanceId);
    Instance.instances.push(instance);
    await instance.login(botToken);
    return instance;
  }

  public static async createNew(botToken: string) {
    const dbEntry = await db.instance.create({ data: {} });
    return await this.start(dbEntry.id, botToken);
  }

  private async setupCommands() {
    await this.tgBot.setCommands([], new Api.BotCommandScopeUsers());
    // 设定管理员的
    if (this.id === 0) {
      await this.tgBot.setCommands(
        this.workMode === 'personal' ? commands.personalPrivateSuperAdminCommands : commands.groupPrivateSuperAdminCommands,
        new Api.BotCommandScopePeer({
          peer: (this.ownerChat).inputPeer,
        }),
      );
    }
    else {
      await this.tgBot.setCommands(
        this.workMode === 'personal' ? commands.personalPrivateCommands : commands.groupPrivateCommands,
        new Api.BotCommandScopePeer({
          peer: (this.ownerChat).inputPeer,
        }),
      );
    }
    // 设定群组内的
    await this.tgBot.setCommands(
      this.workMode === 'personal' ? commands.personalInChatCommands : commands.groupInChatCommands,
      // 普通用户其实不需要这些命令，这样可以让用户的输入框少点东西
      new Api.BotCommandScopeChatAdmins(),
    );
  }

  private async waitForOwnerInput(message?: string, buttons?: MarkupLike, remove = false) {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    message && await this.ownerChat.sendMessage({ message, buttons: buttons || Button.clear(), linkPreview: false });
    const reply = await this.ownerChat.waitForInput();
    remove && await reply.delete({ revoke: true });
    return reply.message;
  }

  get owner() {
    return this._owner;
  }

  get qq() {
    return this._qq;
  }

  get qqUin() {
    return this.qqClient.uin;
  }

  get isSetup() {
    return this._isSetup;
  }

  get workMode() {
    return this._workMode as WorkMode;
  }

  get botMe() {
    return this.tgBot.me;
  }

  get userMe() {
    return this.tgUser?.me;
  }

  get ownerChat() {
    return this._ownerChat;
  }

  get botSessionId() {
    return this._botSessionId;
  }

  get userSessionId() {
    return this._userSessionId;
  }

  get flags() {
    return this._flags;
  }

  set owner(owner: number) {
    this._owner = owner;
    db.instance.update({
      data: { owner },
      where: { id: this.id },
    })
      .then(() => this.log.trace(owner));
  }

  set isSetup(isSetup: boolean) {
    this._isSetup = isSetup;
    db.instance.update({
      data: { isSetup },
      where: { id: this.id },
    })
      .then(() => this.log.trace(isSetup));
  }

  set workMode(workMode: WorkMode) {
    this._workMode = workMode;
    db.instance.update({
      data: { workMode },
      where: { id: this.id },
    })
      .then(() => this.log.trace(workMode));
  }

  set botSessionId(sessionId: number) {
    this._botSessionId = sessionId;
    db.instance.update({
      data: { botSessionId: sessionId },
      where: { id: this.id },
    })
      .then(() => this.log.trace(sessionId));
  }

  set userSessionId(sessionId: number) {
    this._userSessionId = sessionId;
    db.instance.update({
      data: { userSessionId: sessionId },
      where: { id: this.id },
    })
      .then(() => this.log.trace(sessionId));
  }

  set qqBotId(id: number) {
    db.instance.update({
      data: { qqBotId: id },
      where: { id: this.id },
    })
      .then(() => this.log.trace(id));
  }

  set flags(value) {
    this._flags = value;
    db.instance.update({
      data: { flags: value },
      where: { id: this.id },
    })
      .then(() => this.log.trace(value));
  }
}
