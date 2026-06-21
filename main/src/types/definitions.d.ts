import { MessageRet } from '../client/QQClient';

export type WorkMode = 'group' | 'personal';
export type QQMessageSent = MessageRet & { senderId: number, brief: string };
