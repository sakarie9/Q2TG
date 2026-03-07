import type { Receive, SendMessageSegment, WSSendReturn } from 'node-napcat-ts';
import { FaceElem, ForwardMessage, ImageElem, MessageElem, SendableElem } from '../QQClient';
import { file as createTempFileBase, FileResult } from 'tmp-promise';
import fsP from 'fs/promises';
import env from '../../models/env';
import fs from 'fs';
import { Readable } from 'node:stream';

const createTempFile = (options: Parameters<typeof createTempFileBase>[0] = {}) => createTempFileBase({
  tmpdir: env.CACHE_DIR,
  ...options,
});

export const messageElemToNapCatSendable = async (elem: SendableElem): Promise<{ elem: SendMessageSegment, tempFiles: FileResult[] }> => {
  const noTmp = (elem: SendMessageSegment) => ({
    elem,
    tempFiles: [],
  });
  switch (elem.type) {
    case 'at':
    case 'text':
    case 'face':
      return noTmp({
        type: elem.type,
        data: elem,
      } as any);
    case 'rps':
    case 'dice':
      return noTmp({
        type: elem.type,
        data: {
          result: elem.id,
        },
      });
    case 'image':
    case 'record':
    case 'video':
      const tempFiles: FileResult[] = [];
      if (Buffer.isBuffer(elem.file)) {
        const file = await createTempFile({ postfix: '.tmp' });
        tempFiles.push(file);
        await fsP.writeFile(file.path, elem.file);
        elem.file = file.path;
      }
      else if (typeof elem.file === 'object' && 'pipe' in elem.file) {
        const file = await createTempFile({ postfix: '.tmp' });
        tempFiles.push(file);
        await new Promise((resolve, reject) => {
          const writeStream = fs.createWriteStream(file.path);
          writeStream.on('error', reject);
          writeStream.on('finish', resolve);
          (elem.file as Readable).pipe(writeStream);
        });
        elem.file = file.path;
      }
      if (!/^(https?|file):\/\//.test(elem.file) && elem.file.startsWith('/')) {
        elem.file = `file://${elem.file}`;
      }
      const mediaData: any = {
        ...elem,
        file: elem.file,
        name: elem.type,
      };
      if (elem.type === 'image') {
        mediaData.summary = ('brief' in elem && elem.brief) || env.IMAGE_SUMMARY || '[图片]';
        mediaData.sub_type = ('asface' in elem && elem.asface) ? 7 : 0;
      }
      return {
        elem: {
          type: elem.type,
          data: mediaData,
        } as any,
        tempFiles,
      };
    case 'node': {
      let message = elem.message;
      if (!Array.isArray(message)) {
        message = [message];
      }
      const forward = await Promise.all(message.map(it => messageElemToNapCatSendable(typeof it === 'string' ? { type: 'text', text: it } : it as SendableElem)));
      return {
        elem: {
          type: 'node',
          data: {
            user_id: elem.user_id,
            nickname: elem.nickname,
            content: forward.map(it => it.elem),
          },
        } as any,
        tempFiles: forward.flatMap(it => it.tempFiles),
      };
    }
    case 'sface':
    default:
      throw new Error('不支持此元素');
  }
};

export type NapCatForwardElem = {
  type: 'forward',
  id: string,
  content: ForwardMessage[],
}

export type FaceElemEx = FaceElem & {
  resultId?: string,
  chainCount?: number,
}

export type ImageElemEx = ImageElem & {
  brief?: string,
}

export const napCatReceiveToMessageElem = (data: Receive[keyof Receive] | any): MessageElem | NapCatForwardElem | FaceElemEx => {
  switch (data.type) {
    case 'text':
    case 'face':
    case 'image':
    case 'record':
    case 'json':
    case 'markdown':
      return {
        ...data.data,
        type: data.type,
        asface: 'sub_type' in data.data && parseInt(String(data.data.sub_type)) > 0,
      } as any;
    case 'xml':
      return {
        type: 'xml',
        data: data.data?.data || data.data?.xml || data.data?.content || '',
      };
    case 'redbag':
    case 'red_packet':
    case 'hongbao':
    case 'gift':
      return {
        type: 'text',
        text: buildRedPacketText(data),
      };
    // @ts-ignore
    case 'mface':
      return {
        type: 'image',
        url: (data as any).data.url,
        file: (data as any).data.url,
      };
    case 'at':
      const qqNum = Number(data.data.qq);
      return {
        type: data.type,
        qq: isNaN(qqNum) ? data.data.qq as any : qqNum,
      };
    case 'file':
      return {
        ...data.data,
        type: 'file',
        duration: 0,
        name: data.data.file,
        fid: data.data.file_id,
        size: Number(data.data.file_size),
        md5: '',
      };
    case 'video':
      return {
        type: data.type,
        // 我们不需要 fileId，直接能拿到 url，url 进 getVideoUrl 转一圈拿回来自己，保持兼容性
        fid: data.data.url,
        file: data.data.url,
      };
    case 'dice':
    case 'rps':
      return {
        id: Number(data.data.result),
        type: data.type,
      };
    case 'forward':
      return {
        type: 'forward',
        id: data.data.id as any,
        content: 'content' in data.data ? napCatForwardMultiple(data.data.content as any) : undefined,
      };
    case 'reply':
      return {
        type: 'reply',
        id: data.data.id,
      };
    default:
      return {
        type: 'text',
        text: buildUnsupportedSegmentText(data),
      };
  }
};

export const napCatReceiveToMessageElems = (segments: Array<Receive[keyof Receive] | any> | undefined, rawMessage = '') => {
  const messages = (segments || [])
    .map(segment => {
      try {
        return napCatReceiveToMessageElem(segment);
      }
      catch {
        return {
          type: 'text',
          text: buildUnsupportedSegmentText(segment),
        } as MessageElem;
      }
    });
  if (!messages.length && rawMessage.trim()) {
    messages.push({
      type: 'text',
      text: rawMessage.trim(),
    });
  }
  return messages;
};

export const napCatForwardMultiple = (messages: WSSendReturn['get_forward_msg']['messages']): ForwardMessage[] => messages.map(it => ({
  group_id: it.message_type === 'group' ? it.group_id : undefined,
  nickname: it.sender.card || it.sender.nickname,
  time: it.time,
  user_id: it.sender.user_id,
  seq: it.message_id,
  raw_message: it.raw_message,
  message: napCatReceiveToMessageElems((it as any).content || (it as any).message, it.raw_message),
}));

const buildRedPacketText = (segment: any) => {
  const text = pickSegmentText(segment?.data);
  if (!text) return '[QQ红包]';
  if (/红包/.test(text)) return text;
  return `[QQ红包] ${text}`;
};

const buildUnsupportedSegmentText = (segment: any) => {
  if (isRedPacketSegment(segment)) return buildRedPacketText(segment);
  const text = pickSegmentText(segment?.data);
  if (text) return text;
  return `[QQ消息: ${String(segment?.type || 'unknown')}]`;
};

const isRedPacketSegment = (segment: any) =>
  /red.?bag|red.?packet|hong.?bao|红包|qwallet/i.test(`${segment?.type || ''} ${safeStringify(segment?.data)}`);

const pickSegmentText = (data: any): string => {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const text = pickSegmentText(item);
      if (text) return text;
    }
    return '';
  }
  for (const key of ['text', 'content', 'title', 'prompt', 'summary', 'brief', 'name', 'desc', 'description', 'alt', 'message']) {
    const value = data[key];
    const text = pickSegmentText(value);
    if (text) return text;
  }
  if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (['app', 'view', 'ver', 'config', 'extra', 'sourceAd'].includes(key)) continue;
      const text = pickSegmentText(value);
      if (text) return text;
    }
  }
  return '';
};

const safeStringify = (value: any) => {
  try {
    return JSON.stringify(value);
  }
  catch {
    return '';
  }
};
