import { Api, TelegramClient } from 'telegram';
import { BotAuthParams, QrCodeAuthParams, UserAuthParams } from 'telegram/client/auth';
import { NewMessage, NewMessageEvent, Raw } from 'telegram/events';
import { EditedMessage, EditedMessageEvent } from 'telegram/events/EditedMessage';
import { DeletedMessage, DeletedMessageEvent } from 'telegram/events/DeletedMessage';
import { EntityLike } from 'telegram/define';
import WaitForMessageHelper from '../helpers/WaitForMessageHelper';
import CallbackQueryHelper from '../helpers/CallbackQueryHelper';
import { CallbackQuery, CallbackQueryEvent } from 'telegram/events/CallbackQuery';
import os from 'os';
import TelegramChat from './TelegramChat';
import TelegramSession from '../models/TelegramSession';
import { LogLevel } from 'telegram/extensions/Logger';
import { BigInteger } from 'big-integer';
import { IterMessagesParams } from 'telegram/client/messages';
import { PromisedNetSockets, PromisedWebSockets } from 'telegram/extensions';
import { ConnectionTCPFull, ConnectionTCPObfuscated } from 'telegram/network';
import env from '../models/env';
import { getLogger } from 'log4js';

type MessageHandler = (message: Api.Message) => Promise<boolean | void>;
type ServiceMessageHandler = (message: Api.MessageService) => Promise<boolean | void>;
type ChannelUserTypingHandler = (event: Api.UpdateChannelUserTyping) => Promise<boolean | void>;

export default class Telegram {
  private readonly client: TelegramClient;
  private botAuthToken?: string;
  private recoveryPromise?: Promise<void>;
  private recovering = false;
  private configured = false;
  private waitForMessageHelper: WaitForMessageHelper;
  private callbackQueryHelper: CallbackQueryHelper = new CallbackQueryHelper();
  private readonly onMessageHandlers: Array<MessageHandler> = [];
  private readonly onEditedMessageHandlers: Array<MessageHandler> = [];
  private readonly onServiceMessageHandlers: Array<ServiceMessageHandler> = [];
  private readonly onChannelUserTypingHandlers: Array<ChannelUserTypingHandler> = [];
  public me: Api.User;

  private static existedBots = {} as { [id: number]: Telegram };
  private static readonly log = getLogger('Telegram');

  public get sessionId() {
    return (this.client.session as TelegramSession).dbId;
  }

  public get isOnline() {
    return this.client.connected;
  }

  private constructor(appName: string, sessionId?: number) {
    this.client = new TelegramClient(
      new TelegramSession(sessionId),
      env.TG_API_ID,
      env.TG_API_HASH,
      {
        connectionRetries: 20,
        langCode: 'zh',
        deviceModel: `${appName} On ${os.hostname()}`,
        appVersion: 'sleepyfox',
        useIPV6: !!env.IPV6,
        proxy: env.PROXY_IP ? {
          socksType: 5,
          ip: env.PROXY_IP,
          port: env.PROXY_PORT,
          username: env.PROXY_USERNAME,
          password: env.PROXY_PASSWORD,
        } : undefined,
        autoReconnect: true,
        networkSocket: env.TG_CONNECTION === 'websocket' ? PromisedWebSockets : PromisedNetSockets,
        connection: env.TG_CONNECTION === 'websocket' ? ConnectionTCPObfuscated : ConnectionTCPFull,
        testServers: env.TG_USE_TEST_DC,
      },
    );
    this.client.logger.setLevel(env.TG_LOG_LEVEL as LogLevel);
    this.installRuntimeRecovery();
  }

  public static async create(startArgs: UserAuthParams | BotAuthParams, appName = 'Q2TG') {
    const bot = new this(appName);
    bot.botAuthToken = 'botAuthToken' in startArgs && typeof startArgs.botAuthToken === 'string'
      ? startArgs.botAuthToken
      : undefined;
    try {
      await bot.client.start(startArgs);
      await bot.config();
      this.existedBots[bot.sessionId] = bot;
      return bot;
    }
    catch (e) {
      await bot.disconnect().catch(() => 0);
      throw e;
    }
  }

  public static async createWithQrCode(startArgs: QrCodeAuthParams, appName = 'Q2TG') {
    const bot = new this(appName);
    try {
      await bot.client.connect();
      await bot.client.signInUserWithQrCode({
        apiId: env.TG_API_ID,
        apiHash: env.TG_API_HASH,
      }, startArgs);
      await bot.config();
      this.existedBots[bot.sessionId] = bot;
      return bot;
    }
    catch (e) {
      await bot.disconnect().catch(() => 0);
      throw e;
    }
  }

  public static async connect(sessionId: number, appName = 'Q2TG') {
    if (this.existedBots[sessionId]) {
      // 已经创建过就不会再次创建，可用于两个 instance 共享 user bot
      return this.existedBots[sessionId];
    }
    const bot = new this(appName, sessionId);
    try {
      await bot.client.connect();
      await bot.config();
      this.existedBots[sessionId] = bot;
      return bot;
    }
    catch (e) {
      delete this.existedBots[sessionId];
      await bot.disconnect().catch(() => 0);
      throw e;
    }
  }

  public static async connectBot(sessionId: number, botAuthToken: string, appName = 'Q2TG') {
    try {
      const bot = await this.connect(sessionId, appName);
      bot.botAuthToken = botAuthToken;
      return bot;
    }
    catch (e) {
      if (!this.isAuthKeyDuplicated(e)) throw e;
      this.log.warn(`Bot session ${sessionId} 的 auth key 已重复，正在重新授权`);
    }

    const bot = new this(appName, sessionId);
    bot.botAuthToken = botAuthToken;
    try {
      await (bot.client.session as TelegramSession).resetAuthKey();
      await bot.client.start({ botAuthToken });
      await bot.config();
      this.existedBots[sessionId] = bot;
      this.log.info(`Bot session ${sessionId} 已自动恢复`);
      return bot;
    }
    catch (e) {
      delete this.existedBots[sessionId];
      await bot.disconnect().catch(() => 0);
      throw e;
    }
  }

  private static isAuthKeyDuplicated(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const rpcError = error as { errorMessage?: unknown; message?: unknown };
    return rpcError.errorMessage === 'AUTH_KEY_DUPLICATED'
      || (typeof rpcError.message === 'string' && rpcError.message.includes('AUTH_KEY_DUPLICATED'));
  }

  private installRuntimeRecovery() {
    const client = this.client as any;
    const methods = [
      'invoke', 'sendMessage', 'sendFile', 'uploadFile', 'getEntity', 'getInputEntity',
      'getMessages', 'downloadFile', 'downloadProfilePhoto', 'getMe',
    ];
    for (const method of methods) {
      const original = client[method];
      if (typeof original !== 'function') continue;
      client[method] = async (...args: any[]) => this.runWithRecovery(() => original.apply(client, args));
    }
  }

  private async runWithRecovery<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    }
    catch (e) {
      if (this.recovering || !this.botAuthToken || !Telegram.isAuthKeyDuplicated(e)) throw e;
      await this.recoverAuthKey();
      return await operation();
    }
  }

  private async recoverAuthKey() {
    if (this.recoveryPromise) return await this.recoveryPromise;
    this.recoveryPromise = (async () => {
      this.recovering = true;
      Telegram.log.warn(`Bot session ${this.sessionId} 运行中检测到重复 auth key，正在自动恢复`);
      await this.client.disconnect().catch(() => 0);
      await (this.client.session as TelegramSession).resetAuthKey();
      await this.client.start({ botAuthToken: this.botAuthToken! });
      await this.config();
      Telegram.log.info(`Bot session ${this.sessionId} 运行时自动恢复完成`);
      this.recovering = false;
    })();
    try {
      await this.recoveryPromise;
    }
    finally {
      this.recovering = false;
      this.recoveryPromise = undefined;
    }
  }

  public async disconnect() {
    await this.client.disconnect();
  }

  private async config() {
    this.client.setParseMode('html');
    this.waitForMessageHelper = new WaitForMessageHelper(this);
    if (this.configured) {
      this.me = await this.client.getMe() as Api.User;
      return;
    }
    this.client.addEventHandler(this.onMessage, new NewMessage({}));
    this.client.addEventHandler(this.onEditedMessage, new EditedMessage({}));
    this.client.addEventHandler(this.onServiceMessage, new Raw({
      types: [Api.UpdateNewMessage],
      func: (update: Api.UpdateNewMessage) => update.message instanceof Api.MessageService,
    }));
    this.client.addEventHandler(this.onChannelUserTyping, new Raw({
      types: [Api.UpdateChannelUserTyping],
    }));
    this.client.addEventHandler(this.callbackQueryHelper.onCallbackQuery, new CallbackQuery());
    this.configured = true;
    this.me = await this.client.getMe() as Api.User;
  }

  private onMessage = async (event: NewMessageEvent) => {
    // 能用的东西基本都在 message 里面，直接调用 event 里的会 undefined
    for (const handler of this.onMessageHandlers) {
      const res = await handler(event.message);
      if (res) return;
    }
  };

  private onEditedMessage = async (event: EditedMessageEvent) => {
    for (const handler of this.onEditedMessageHandlers) {
      const res = await handler(event.message);
      if (res) return;
    }
  };

  private onServiceMessage = async (event: Api.UpdateNewMessage) => {
    for (const handler of this.onServiceMessageHandlers) {
      const res = await handler(event.message as Api.MessageService);
      if (res) return;
    }
  };

  private onChannelUserTyping = async (event: Api.UpdateChannelUserTyping) => {
    for (const handler of this.onChannelUserTypingHandlers) {
      const res = await handler(event);
      if (res) return;
    }
  };

  /**
   * 注册消息处理器
   * @param handler 此方法返回 true 可以阻断下面的处理器
   */
  public addNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.push(handler);
  }

  public removeNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.includes(handler) &&
    this.onMessageHandlers.splice(this.onMessageHandlers.indexOf(handler), 1);
  }

  public addEditedMessageEventHandler(handler: MessageHandler) {
    this.onEditedMessageHandlers.push(handler);
  }

  public removeEditedMessageEventHandler(handler: MessageHandler) {
    this.onEditedMessageHandlers.includes(handler) &&
    this.onEditedMessageHandlers.splice(this.onEditedMessageHandlers.indexOf(handler), 1);
  }

  public addNewServiceMessageEventHandler(handler: ServiceMessageHandler) {
    this.onServiceMessageHandlers.push(handler);
  }

  public removeNewServiceMessageEventHandler(handler: ServiceMessageHandler) {
    this.onServiceMessageHandlers.includes(handler) &&
    this.onServiceMessageHandlers.splice(this.onServiceMessageHandlers.indexOf(handler), 1);
  }

  public addChannelUserTypingHandler(handler: ChannelUserTypingHandler) {
    this.onChannelUserTypingHandlers.push(handler);
  }

  public removeChannelUserTypingHandler(handler: ChannelUserTypingHandler) {
    this.onChannelUserTypingHandlers.includes(handler) &&
    this.onChannelUserTypingHandlers.splice(this.onChannelUserTypingHandlers.indexOf(handler), 1);
  }

  public addDeletedMessageEventHandler(handler: (event: DeletedMessageEvent) => any) {
    this.client.addEventHandler(handler, new DeletedMessage({}));
  }

  public addChannelParticipantEventHandler(handler: (event: Api.UpdateChannelParticipant) => any) {
    this.client.addEventHandler(handler, new Raw({
      types: [Api.UpdateChannelParticipant],
    }));
  }

  public async getChat(entity: EntityLike) {
    return new TelegramChat(this, this.client, await this.client.getEntity(entity), this.waitForMessageHelper);
  }

  public async setCommands(commands: Api.BotCommand[], scope: Api.TypeBotCommandScope) {
    return await this.client.invoke(
      new Api.bots.SetBotCommands({
        commands,
        langCode: '',
        scope,
      }),
    );
  }

  public registerCallback(cb: (event: CallbackQueryEvent) => any) {
    return this.callbackQueryHelper.registerCallback(cb);
  }

  public async getDialogFilters() {
    return await this.client.invoke(new Api.messages.GetDialogFilters());
  }

  public async updateDialogFilter(params: Partial<Partial<{ id: number; filter?: Api.DialogFilter; }>>) {
    return await this.client.invoke(new Api.messages.UpdateDialogFilter(params));
  }

  public async createChat(title: string, about = '') {
    const updates = await this.client.invoke(new Api.channels.CreateChannel({
      title, about,
      megagroup: true,
      forImport: true,
    })) as Api.Updates;
    const newChat = updates.chats[0];
    return new TelegramChat(this, this.client, newChat, this.waitForMessageHelper);
  }

  public async getCustomEmoji(documentId: BigInteger) {
    const ids = await this.client.invoke(new Api.messages.GetCustomEmojiDocuments({
      documentId: [documentId],
    }));
    const document = ids[0] as Api.Document;
    return await this.client.downloadFile(new Api.InputDocumentFileLocation({
      id: document.id,
      accessHash: document.accessHash,
      fileReference: document.fileReference,
      thumbSize: '',
    }), {
      dcId: document.dcId,
    });
  }

  public async getInputPeerUserFromMessage(chatId: EntityLike, userId: BigInteger, msgId: number) {
    const inputPeerOfChat = await this.client.getInputEntity(chatId);
    return new Api.InputUserFromMessage({
      peer: inputPeerOfChat,
      userId, msgId,
    });
  }

  public getMessage(entity: EntityLike | undefined, getMessagesParams?: Partial<IterMessagesParams>) {
    return this.client.getMessages(entity, getMessagesParams);
  }

  public downloadEntityPhoto(entity: EntityLike, isBig = false) {
    return this.client.downloadProfilePhoto(entity, { isBig });
  }

  public downloadThumb(document: Api.Document, thumbSize = 'm') {
    return this.client.downloadFile(new Api.InputDocumentFileLocation({
      id: document.id,
      accessHash: document.accessHash,
      fileReference: document.fileReference,
      thumbSize,
    }), {
      dcId: document.dcId,
    });
  }

  public async getStickerSet(handle: string) {
    return await this.client.invoke(new Api.messages.GetStickerSet({
      stickerset: new Api.InputStickerSetShortName({ shortName: handle }),
    })) as Api.messages.StickerSet;
  }

  public async uploadFile(fileParams: Parameters<typeof this.client.uploadFile>[0]) {
    return await this.client.uploadFile(fileParams);
  }
}
