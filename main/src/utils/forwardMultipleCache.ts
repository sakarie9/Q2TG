import fs from 'fs';
import fsP from 'fs/promises';
import path from 'path';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import mime from 'mime-types';
import { MessageElem, ForwardMessage, QQEntity } from '../client/QQClient';
import { fetchFile, getImageUrlByMd5 } from './urls';
import env from '../models/env';
import { md5Hex } from './hashing';
import silk from '../encoding/silk';

export type CachedForwardMessage = ForwardMessage & {
  message: CachedMessageElem[];
};

export type CachedMessageElem = MessageElem & {
  localUrl?: string;
  cacheKey?: string;
  downloadStatus?: 'idle' | 'cached' | 'unsupported';
  downloadName?: string;
};

const cacheRoot = path.join(env.CACHE_DIR, 'forward-multiple');

const forwardDir = (uuid: string) => path.join(cacheRoot, uuid);

const publicUrl = (uuid: string, filename: string) =>
  `/Q2tgServlet/ForwardMultipleMedia/${uuid}/${encodeURIComponent(filename)}`;

const getFileExt = async (filePath: string, fallback = 'bin') => {
  const type = await fileTypeFromFile(filePath).catch(() => undefined);
  return type?.ext || path.extname(filePath).replace(/^\./, '') || fallback;
};

const getBufferExt = async (buffer: Buffer, fallback = 'bin') => {
  const type = await fileTypeFromBuffer(buffer).catch(() => undefined);
  return type?.ext || fallback;
};

export const buildMediaKey = (elem: MessageElem) => {
  switch (elem.type) {
    case 'image':
    case 'flash':
    case 'record':
    case 'video': {
      const direct = elem.url || (typeof elem.file === 'string' ? elem.file : '');
      const md5 = typeof elem.md5 === 'string' ? elem.md5 : Buffer.isBuffer(elem.md5) ? elem.md5.toString('hex') : '';
      const fid = elem.type === 'video' ? elem.fid || '' : '';
      return `${elem.type}:${fid}:${md5}:${direct}`;
    }
    case 'file':
      return `file:${elem.fid}:${elem.name}:${elem.size}`;
    default:
      return '';
  }
};

export const prepareForwardMessages = (messages: ForwardMessage[], uuid: string): CachedForwardMessage[] =>
  messages.map(message => ({
    ...message,
    message: message.message.map(elem => prepareElem(elem, uuid)),
  }));

const prepareElem = (elem: MessageElem, uuid: string): CachedMessageElem => {
  const cacheKey = buildMediaKey(elem);
  if (!cacheKey) return elem as CachedMessageElem;

  const existing = findCachedMedia(uuid, cacheKey);
  if (existing) {
    return {
      ...elem,
      cacheKey,
      downloadStatus: 'cached',
      localUrl: publicUrl(uuid, existing),
      downloadName: existing,
    } as CachedMessageElem;
  }

  return {
    ...elem,
    cacheKey,
    downloadStatus: 'idle',
  } as CachedMessageElem;
};

export const findCachedMedia = (uuid: string, cacheKey: string) => {
  const dir = forwardDir(uuid);
  if (!fs.existsSync(dir)) return '';
  const prefix = md5Hex(cacheKey);
  return fs.readdirSync(dir).find(name => name.startsWith(prefix)) || '';
};

const writeBuffer = async (uuid: string, cacheKey: string, buffer: Buffer, fallbackExt: string) => {
  await fsP.mkdir(forwardDir(uuid), { recursive: true });
  const ext = await getBufferExt(buffer, fallbackExt);
  const filename = `${md5Hex(cacheKey)}.${ext}`;
  const filePath = path.join(forwardDir(uuid), filename);
  await fsP.writeFile(filePath, buffer);
  return filename;
};

const copyFile = async (uuid: string, cacheKey: string, sourcePath: string, fallbackExt: string) => {
  await fsP.mkdir(forwardDir(uuid), { recursive: true });
  sourcePath = sourcePath.replace(/^file:\/\//, '');
  const ext = await getFileExt(sourcePath, fallbackExt);
  const filename = `${md5Hex(cacheKey)}.${ext}`;
  const filePath = path.join(forwardDir(uuid), filename);
  await fsP.copyFile(sourcePath, filePath);
  return filename;
};

const saveFromUrl = async (uuid: string, cacheKey: string, url: string, fallbackExt: string) => {
  const buffer = await fetchFile(url);
  return await writeBuffer(uuid, cacheKey, buffer, fallbackExt);
};

const writeVoiceAsOgg = async (uuid: string, cacheKey: string, buffer: Buffer) => {
  await fsP.mkdir(forwardDir(uuid), { recursive: true });
  const filename = `${md5Hex(cacheKey)}.ogg`;
  const filePath = path.join(forwardDir(uuid), filename);
  await silk.decodeVoice(buffer, filePath);
  return filename;
};

const saveVoiceUrlAsOgg = async (uuid: string, cacheKey: string, url: string) => {
  const buffer = await fetchFile(url);
  return await writeVoiceAsOgg(uuid, cacheKey, buffer);
};

const copyVoiceAsOgg = async (uuid: string, cacheKey: string, sourcePath: string) => {
  sourcePath = sourcePath.replace(/^file:\/\//, '');
  const buffer = await fsP.readFile(sourcePath);
  return await writeVoiceAsOgg(uuid, cacheKey, buffer);
};

export const downloadForwardMedia = async (uuid: string, messages: CachedForwardMessage[], indexPath: number[], qq: QQEntity) => {
  const elem = getElemByPath(messages, indexPath);
  if (!elem) throw new Error('媒体不存在');
  const cacheKey = buildMediaKey(elem);
  if (!cacheKey) throw new Error('此消息元素不支持下载');

  const existing = findCachedMedia(uuid, cacheKey);
  if (existing) {
    elem.localUrl = publicUrl(uuid, existing);
    elem.downloadStatus = 'cached';
    elem.downloadName = existing;
    return elem;
  }

  let filename = '';
  switch (elem.type) {
    case 'image':
    case 'flash': {
      if (Buffer.isBuffer(elem.file)) {
        filename = await writeBuffer(uuid, cacheKey, elem.file, 'jpg');
      }
      else if (typeof elem.file === 'string' && /^https?:\/\//.test(elem.file)) {
        filename = await saveFromUrl(uuid, cacheKey, elem.file, 'jpg');
      }
      else if (typeof elem.file === 'string' && (/^file:\/\//.test(elem.file) || path.isAbsolute(elem.file))) {
        filename = await copyFile(uuid, cacheKey, elem.file, 'jpg');
      }
      else if (elem.url) {
        filename = await saveFromUrl(uuid, cacheKey, elem.url, 'jpg');
      }
      else if (typeof elem.file === 'string') {
        const md5 = elem.file.substring(0, 32);
        filename = await saveFromUrl(uuid, cacheKey, getImageUrlByMd5(md5), 'jpg');
      }
      break;
    }
    case 'video': {
      const url = elem.url || (elem.fid ? await qq.getVideoUrl(elem.fid, elem.md5 || '') : typeof elem.file === 'string' ? elem.file : '');
      if (!url) throw new Error('视频下载地址为空');
      filename = /^https?:\/\//.test(url) ? await saveFromUrl(uuid, cacheKey, url, 'mp4') : await copyFile(uuid, cacheKey, url, 'mp4');
      break;
    }
    case 'record': {
      const url = elem.url || (typeof elem.file === 'string' ? elem.file : '');
      if (!url) throw new Error('语音下载地址为空');
      filename = /^https?:\/\//.test(url) ? await saveVoiceUrlAsOgg(uuid, cacheKey, url) : await copyVoiceAsOgg(uuid, cacheKey, url);
      break;
    }
    case 'file': {
      const filePath = await qq.getFileUrl(elem.fid);
      filename = await copyFile(uuid, cacheKey, filePath, path.extname(elem.name).replace(/^\./, '') || 'bin');
      break;
    }
  }

  if (!filename) throw new Error('此媒体没有可下载的文件地址');
  elem.localUrl = publicUrl(uuid, filename);
  elem.downloadStatus = 'cached';
  elem.downloadName = filename;
  return elem;
};

export const cacheForwardInlineMedia = async (uuid: string, messages: CachedForwardMessage[], qq: QQEntity) => {
  const tasks: number[][] = [];
  let changed = false;

  for (const [messageIndex, message] of messages.entries()) {
    for (const [elemIndex, elem] of message.message.entries()) {
      if (elem.type !== 'image' && elem.type !== 'flash' && elem.type !== 'record') continue;
      const cacheKey = buildMediaKey(elem);
      if (!cacheKey) continue;
      const cachedElem = elem as CachedMessageElem;

      const existing = findCachedMedia(uuid, cacheKey);
      if (existing) {
        const localUrl = publicUrl(uuid, existing);
        if (
          cachedElem.cacheKey !== cacheKey ||
          cachedElem.localUrl !== localUrl ||
          cachedElem.downloadStatus !== 'cached' ||
          cachedElem.downloadName !== existing
        ) {
          cachedElem.cacheKey = cacheKey;
          cachedElem.localUrl = localUrl;
          cachedElem.downloadStatus = 'cached';
          cachedElem.downloadName = existing;
          changed = true;
        }
        continue;
      }

      tasks.push([messageIndex, elemIndex]);
    }
  }

  for (let i = 0; i < tasks.length; i += 4) {
    const batch = tasks.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map(path => downloadForwardMedia(uuid, messages, path, qq)));
    if (results.some(result => result.status === 'fulfilled')) {
      changed = true;
    }
  }

  return changed;
};

export const getMediaFile = async (uuid: string, filename: string) => {
  const resolved = path.resolve(forwardDir(uuid), filename);
  const root = path.resolve(forwardDir(uuid));
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('非法文件路径');
  }
  await fsP.access(resolved);
  return {
    path: resolved,
    contentType: mime.lookup(resolved) || 'application/octet-stream',
  };
};

const getElemByPath = (messages: CachedForwardMessage[], indexPath: number[]) => {
  if (indexPath.length < 2) return undefined;
  const [messageIndex, elemIndex] = indexPath;
  return messages[messageIndex]?.message?.[elemIndex] as CachedMessageElem | undefined;
};
