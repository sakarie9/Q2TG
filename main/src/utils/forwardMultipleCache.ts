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
import {
  buildR2MediaKey,
  getR2PublicUrl,
  isR2StorageEnabled,
  uploadBufferToR2,
  uploadFileToR2,
} from './r2Storage';

export type CachedForwardMessage = ForwardMessage & {
  message: CachedMessageElem[];
};

export type CachedMessageElem = MessageElem & {
  localUrl?: string;
  cacheKey?: string;
  downloadStatus?: 'idle' | 'cached' | 'unsupported';
  downloadName?: string;
  storage?: 'local' | 'r2';
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

const contentTypeByExt = (ext: string) => mime.lookup(ext) || 'application/octet-stream';

const filenameByKey = (cacheKey: string, ext: string) => `${md5Hex(cacheKey)}.${ext}`;

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
      storage: 'local',
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
  const filename = filenameByKey(cacheKey, ext);
  const filePath = path.join(forwardDir(uuid), filename);
  await fsP.writeFile(filePath, buffer);
  return filename;
};

const writeBufferToR2 = async (uuid: string, cacheKey: string, buffer: Buffer, fallbackExt: string) => {
  const ext = await getBufferExt(buffer, fallbackExt);
  const filename = filenameByKey(cacheKey, ext);
  const key = buildR2MediaKey(uuid, filename);
  await uploadBufferToR2(key, buffer, contentTypeByExt(ext));
  return {
    filename,
    localUrl: getR2PublicUrl(key),
  };
};

const copyFile = async (uuid: string, cacheKey: string, sourcePath: string, fallbackExt: string) => {
  await fsP.mkdir(forwardDir(uuid), { recursive: true });
  sourcePath = sourcePath.replace(/^file:\/\//, '');
  const ext = await getFileExt(sourcePath, fallbackExt);
  const filename = filenameByKey(cacheKey, ext);
  const filePath = path.join(forwardDir(uuid), filename);
  await fsP.copyFile(sourcePath, filePath);
  return filename;
};

const copyFileToR2 = async (uuid: string, cacheKey: string, sourcePath: string, fallbackExt: string) => {
  sourcePath = sourcePath.replace(/^file:\/\//, '');
  const ext = await getFileExt(sourcePath, fallbackExt);
  const filename = filenameByKey(cacheKey, ext);
  const key = buildR2MediaKey(uuid, filename);
  await uploadFileToR2(key, sourcePath, contentTypeByExt(ext));
  return {
    filename,
    localUrl: getR2PublicUrl(key),
  };
};

const saveFromUrl = async (uuid: string, cacheKey: string, url: string, fallbackExt: string) => {
  const buffer = await fetchFile(url);
  return await writeBuffer(uuid, cacheKey, buffer, fallbackExt);
};

const saveUrlToR2 = async (uuid: string, cacheKey: string, url: string, fallbackExt: string) => {
  const buffer = await fetchFile(url);
  return await writeBufferToR2(uuid, cacheKey, buffer, fallbackExt);
};

const writeVoiceAsOgg = async (uuid: string, cacheKey: string, buffer: Buffer) => {
  await fsP.mkdir(forwardDir(uuid), { recursive: true });
  const filename = filenameByKey(cacheKey, 'ogg');
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
    elem.storage = 'local';
    return elem;
  }

  let filename = '';
  let localUrl = '';
  let storage: CachedMessageElem['storage'] = 'local';
  const useR2 = isR2StorageEnabled() && isR2Cacheable(elem.type);
  switch (elem.type) {
    case 'image':
    case 'flash': {
      if (Buffer.isBuffer(elem.file)) {
        if (useR2) {
          ({ filename, localUrl } = await writeBufferToR2(uuid, cacheKey, elem.file, 'jpg'));
          storage = 'r2';
        }
        else {
          filename = await writeBuffer(uuid, cacheKey, elem.file, 'jpg');
        }
      }
      else if (typeof elem.file === 'string' && /^https?:\/\//.test(elem.file)) {
        if (useR2) {
          ({ filename, localUrl } = await saveUrlToR2(uuid, cacheKey, elem.file, 'jpg'));
          storage = 'r2';
        }
        else {
          filename = await saveFromUrl(uuid, cacheKey, elem.file, 'jpg');
        }
      }
      else if (typeof elem.file === 'string' && (/^file:\/\//.test(elem.file) || path.isAbsolute(elem.file))) {
        if (useR2) {
          ({ filename, localUrl } = await copyFileToR2(uuid, cacheKey, elem.file, 'jpg'));
          storage = 'r2';
        }
        else {
          filename = await copyFile(uuid, cacheKey, elem.file, 'jpg');
        }
      }
      else if (elem.url) {
        if (useR2) {
          ({ filename, localUrl } = await saveUrlToR2(uuid, cacheKey, elem.url, 'jpg'));
          storage = 'r2';
        }
        else {
          filename = await saveFromUrl(uuid, cacheKey, elem.url, 'jpg');
        }
      }
      else if (typeof elem.file === 'string') {
        const md5 = elem.file.substring(0, 32);
        if (useR2) {
          ({ filename, localUrl } = await saveUrlToR2(uuid, cacheKey, getImageUrlByMd5(md5), 'jpg'));
          storage = 'r2';
        }
        else {
          filename = await saveFromUrl(uuid, cacheKey, getImageUrlByMd5(md5), 'jpg');
        }
      }
      break;
    }
    case 'video': {
      const url = elem.url || (elem.fid ? await qq.getVideoUrl(elem.fid, elem.md5 || '') : typeof elem.file === 'string' ? elem.file : '');
      if (!url) throw new Error('视频下载地址为空');
      if (useR2) {
        ({ filename, localUrl } = /^https?:\/\//.test(url)
          ? await saveUrlToR2(uuid, cacheKey, url, 'mp4')
          : await copyFileToR2(uuid, cacheKey, url, 'mp4'));
        storage = 'r2';
      }
      else {
        filename = /^https?:\/\//.test(url) ? await saveFromUrl(uuid, cacheKey, url, 'mp4') : await copyFile(uuid, cacheKey, url, 'mp4');
      }
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
  elem.localUrl = localUrl || publicUrl(uuid, filename);
  elem.downloadStatus = 'cached';
  elem.downloadName = filename;
  elem.storage = storage;
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
      if (cachedElem.storage === 'r2' && cachedElem.cacheKey === cacheKey && cachedElem.localUrl && cachedElem.downloadStatus === 'cached') {
        continue;
      }

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
          cachedElem.storage = 'local';
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

const isR2Cacheable = (type: MessageElem['type']) =>
  type === 'image' || type === 'flash' || type === 'video';

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
