import DeleteMessageService from '../services/DeleteMessageService';
import Telegram from '../client/Telegram';
import { Api } from 'telegram';
import { DeletedMessageEvent } from 'telegram/events/DeletedMessage';
import Instance from '../models/Instance';
import { MessageRecallEvent, QQClient } from '../client/QQClient';

export default class DeleteMessageController {
  private readonly deleteMessageService: DeleteMessageService;
  private tgUser: Telegram | undefined;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              tgUser: Telegram | undefined,
              private readonly qqClient: QQClient) {
    this.deleteMessageService = new DeleteMessageService(this.instance, tgBot);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
    tgBot.addEditedMessageEventHandler(this.onTelegramEditMessage);
    this.setUserBot(tgUser);
    qqClient.addMessageRecallEventHandler(this.onQqRecall);
  }

  public setUserBot(tgUser?: Telegram) {
    if (!tgUser || this.tgUser === tgUser) return;
    this.tgUser = tgUser;
    tgUser.addDeletedMessageEventHandler(this.onTgDeletedMessage);
  }

  private onTelegramMessage = async (message: Api.Message) => {
    const pair = this.instance.forwardPairs.find(message.chat);
    if (!pair) return false;
    if (message.message?.split('@')?.[0] === '/rm') {
      // 撤回消息
      await this.deleteMessageService.handleTelegramMessageRm(message, pair);
      return true;
    }
  };

  private onTelegramEditMessage = async (message: Api.Message) => {
    if (message.senderId?.eq(this.instance.botMe.id)) return true;
    const pair = this.instance.forwardPairs.find(message.chat);
    if (!pair) return;
    if (await this.deleteMessageService.isInvalidEdit(message, pair)) {
      return true;
    }
    await this.deleteMessageService.telegramDeleteMessage(message.id, pair);
    return await this.onTelegramMessage(message);
  };

  private onQqRecall = async (event: MessageRecallEvent) => {
    const pair = this.instance.forwardPairs.find(event.chat);
    if (!pair) return;
    await this.deleteMessageService.handleQqRecall(event, pair);
  };

  private onTgDeletedMessage = async (event: DeletedMessageEvent) => {
    if (!(event.peer instanceof Api.PeerChannel)) return;
    // group anonymous bot
    if (event._entities?.get('1087968824')) return;
    const pair = this.instance.forwardPairs.find(event.peer.channelId);
    if (!pair) return;
    for (const messageId of event.deletedIds) {
      await this.deleteMessageService.telegramDeleteMessage(messageId, pair);
    }
  };
}
