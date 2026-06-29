import fs from 'fs';
import fsP from 'fs/promises';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import mime from 'mime-types';
import { file as createTempFile, FileResult } from 'tmp-promise';
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
  downloadError?: string;
};

export type ImageDownloadSource =
  | { type: 'buffer'; data: Buffer; fallbackExt: string }
  | { type: 'url'; url: string; fallbackExt: string }
  | { type: 'file'; path: string; fallbackExt: string };

type ImageMessageElem = Extract<MessageElem, { type: 'image' | 'flash' }>;

const cacheRoot = path.join(env.CACHE_DIR, 'forward-multiple');

const forwardDir = (uuid: string) => path.join(cacheRoot, uuid);

if (env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
}
if (env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(env.FFPROBE_PATH);
}

const createCacheTempFile = async (options: Parameters<typeof createTempFile>[0] = {}) => {
  await fsP.mkdir(env.CACHE_DIR, { recursive: true });
  return createTempFile({
    tmpdir: env.CACHE_DIR,
    ...options,
  });
};

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

const getPathExt = (value: string) => {
  try {
    return path.extname(new URL(value).pathname);
  }
  catch {
    return path.extname(value);
  }
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

  const cachedElem = elem as CachedMessageElem;
  if (cachedElem.downloadStatus === 'cached' && cachedElem.localUrl) {
    return {
      ...cachedElem,
      cacheKey,
    };
  }

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

export const normalizeForwardMessages = (messages: CachedForwardMessage[]) => {
  let changed = false;
  for (const message of messages) {
    for (const elem of message.message) {
      if (elem.type !== 'video' || elem.localUrl || hasHttpMediaSource(elem)) continue;
      const sourcePath = getLocalMediaSource(elem);
      if (!sourcePath) continue;
      if (fs.existsSync(sourcePath)) {
        if (elem.downloadStatus === 'unsupported') {
          elem.downloadStatus = 'idle';
          delete elem.downloadError;
          changed = true;
        }
        continue;
      }
      const error = missingVideoSourceMessage(sourcePath);
      if (elem.downloadStatus !== 'unsupported' || elem.downloadError !== error) {
        elem.downloadStatus = 'unsupported';
        elem.downloadError = error;
        changed = true;
      }
    }
  }
  return changed;
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

const saveVideoUrl = async (uuid: string, cacheKey: string, url: string, useR2: boolean) => {
  const tempFiles: FileResult[] = [];
  try {
    const source = await createCacheTempFile({ postfix: getPathExt(url) || '.mp4' });
    tempFiles.push(source);
    await fsP.writeFile(source.path, await fetchFile(url));
    return await saveVideoFile(uuid, cacheKey, source.path, useR2);
  }
  finally {
    await Promise.allSettled(tempFiles.map(item => item.cleanup()));
  }
};

const saveVideoFile = async (uuid: string, cacheKey: string, sourcePath: string, useR2: boolean) => {
  const tempFiles: FileResult[] = [];
  try {
    sourcePath = sourcePath.replace(/^file:\/\//, '');
    await assertReadableMediaFile(sourcePath, '视频');
    const output = await transcodeVideoForWeb(sourcePath);
    tempFiles.push(output);
    const filename = filenameByKey(cacheKey, 'mp4');
    if (useR2) {
      const key = buildR2MediaKey(uuid, filename);
      await uploadFileToR2(key, output.path, 'video/mp4');
      return {
        filename,
        localUrl: getR2PublicUrl(key),
        storage: 'r2' as const,
      };
    }

    await fsP.mkdir(forwardDir(uuid), { recursive: true });
    await fsP.copyFile(output.path, path.join(forwardDir(uuid), filename));
    return {
      filename,
      localUrl: '',
      storage: 'local' as const,
    };
  }
  finally {
    await Promise.allSettled(tempFiles.map(item => item.cleanup()));
  }
};

const assertReadableMediaFile = async (filePath: string, mediaName: string) => {
  try {
    const stat = await fsP.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`${mediaName}源不是文件：${filePath}`);
    }
  }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') {
      throw new Error(mediaName === '视频' ? missingVideoSourceMessage(filePath) : `${mediaName}源文件不存在或 q2tg 无法访问：${filePath}`);
    }
    throw e;
  }
};

const transcodeVideoForWeb = async (sourcePath: string) => {
  const output = await createCacheTempFile({ postfix: '.mp4' });
  await fsP.unlink(output.path).catch(() => undefined);
  await new Promise<void>((resolve, reject) => {
    ffmpeg(sourcePath)
      .outputOptions([
        '-map', '0:v:0',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-f', 'mp4',
      ])
      .on('end', () => resolve())
      .on('error', reject)
      .save(output.path);
  });
  return output;
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
      ({ filename, localUrl, storage } = await saveImageFromSources(uuid, cacheKey, getImageDownloadSources(elem), useR2));
      break;
    }
    case 'video': {
      const url = elem.url || (elem.fid ? await qq.getVideoUrl(elem.fid, elem.md5 || '') : typeof elem.file === 'string' ? elem.file : '');
      if (!url) throw new Error('视频下载地址为空');
      if (!/^https?:\/\//.test(url)) {
        const sourcePath = normalizeFilePath(url);
        if (sourcePath && !fs.existsSync(sourcePath)) {
          const message = missingVideoSourceMessage(sourcePath);
          elem.downloadStatus = 'unsupported';
          elem.downloadError = message;
          throw new Error(message);
        }
      }
      ({ filename, localUrl, storage } = /^https?:\/\//.test(url)
        ? await saveVideoUrl(uuid, cacheKey, url, useR2)
        : await saveVideoFile(uuid, cacheKey, url, useR2));
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
  delete elem.downloadError;
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

const saveImageFromSources = async (uuid: string, cacheKey: string, sources: ImageDownloadSource[], useR2: boolean) => {
  let lastError: unknown;
  for (const source of sources) {
    try {
      if (source.type === 'buffer') {
        if (useR2) {
          const result = await writeBufferToR2(uuid, cacheKey, source.data, source.fallbackExt);
          return { ...result, storage: 'r2' as const };
        }
        return { filename: await writeBuffer(uuid, cacheKey, source.data, source.fallbackExt), localUrl: '', storage: 'local' as const };
      }
      if (source.type === 'file') {
        if (useR2) {
          const result = await copyFileToR2(uuid, cacheKey, source.path, source.fallbackExt);
          return { ...result, storage: 'r2' as const };
        }
        return { filename: await copyFile(uuid, cacheKey, source.path, source.fallbackExt), localUrl: '', storage: 'local' as const };
      }
      if (useR2) {
        const result = await saveUrlToR2(uuid, cacheKey, source.url, source.fallbackExt);
        return { ...result, storage: 'r2' as const };
      }
      return { filename: await saveFromUrl(uuid, cacheKey, source.url, source.fallbackExt), localUrl: '', storage: 'local' as const };
    }
    catch (e) {
      lastError = e;
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError || '无可用下载源');
  throw new Error(`图片下载失败：${message}`);
};

export const getImageDownloadSources = (elem: ImageMessageElem) => {
  const sources: ImageDownloadSource[] = [];
  const seen = new Set<string>();
  const pushUrl = (url: string | undefined, fallbackExt = 'jpg') => {
    if (!url || seen.has(`url:${url}`)) return;
    seen.add(`url:${url}`);
    sources.push({ type: 'url', url, fallbackExt });
  };
  const pushFile = (filePath: string | undefined, fallbackExt = 'jpg') => {
    if (!filePath || seen.has(`file:${filePath}`)) return;
    seen.add(`file:${filePath}`);
    sources.push({ type: 'file', path: filePath, fallbackExt });
  };
  const pushMd5 = (md5: string) => {
    if (/^[a-f\d]{32}$/i.test(md5)) {
      pushUrl(getImageUrlByMd5(md5));
    }
  };
  if (Buffer.isBuffer(elem.file)) {
    sources.push({ type: 'buffer', data: elem.file, fallbackExt: 'jpg' });
  }
  if (typeof elem.file === 'string' && /^https?:\/\//.test(elem.file)) {
    pushUrl(elem.file);
  }
  if (typeof elem.file === 'string' && (/^file:\/\//.test(elem.file) || path.isAbsolute(elem.file))) {
    pushFile(elem.file);
  }
  pushUrl(elem.url);
  if (typeof elem.file === 'string') {
    pushMd5(elem.file.substring(0, 32));
  }
  const md5 = typeof elem.md5 === 'string' ? elem.md5 : Buffer.isBuffer(elem.md5) ? elem.md5.toString('hex') : '';
  pushMd5(md5);
  return sources;
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

export const getElemByPath = (messages: CachedForwardMessage[], indexPath: number[]) => {
  if (indexPath.length < 2) return undefined;
  const [messageIndex, elemIndex] = indexPath;
  return messages[messageIndex]?.message?.[elemIndex] as CachedMessageElem | undefined;
};

const hasHttpMediaSource = (elem: CachedMessageElem) =>
  isHttpUrl(getStringField(elem, 'url'))
  || isHttpUrl(getStringField(elem, 'file'))
  || isHttpUrl(getStringField(elem, 'fid'));

const getLocalMediaSource = (elem: CachedMessageElem) =>
  normalizeFilePath(getStringField(elem, 'url'))
  || normalizeFilePath(getStringField(elem, 'file'))
  || normalizeFilePath(getStringField(elem, 'fid'));

const getStringField = (elem: CachedMessageElem, key: string) => {
  const value = (elem as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
};

const normalizeFilePath = (value?: string) => {
  if (!value || isHttpUrl(value)) return '';
  const filePath = value.replace(/^file:\/\//, '');
  return path.isAbsolute(filePath) ? filePath : '';
};

const isHttpUrl = (value?: string) =>
  typeof value === 'string' && /^https?:\/\//i.test(value);

const missingVideoSourceMessage = (filePath: string) =>
  `视频源文件不存在或已被 QQ/NapCat 清理，无法保存到服务器：${filePath}`;
