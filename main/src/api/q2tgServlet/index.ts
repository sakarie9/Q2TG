import { Elysia, t } from 'elysia';
import db from '../../models/db';
import { Pair } from '../../models/Pair';
import processNestedForward from '../../utils/processNestedForward';
import {
  CachedForwardMessage,
  CachedMessageElem,
  cacheForwardInlineMedia,
  downloadForwardMedia,
  getElemByPath,
  getImageDownloadSources,
  getMediaFile,
  normalizeForwardMessages,
  prepareForwardMessages,
} from '../../utils/forwardMultipleCache';
import type { ImageDownloadSource } from '../../utils/forwardMultipleCache';
import fs from 'fs';
import mime from 'mime-types';
import { fileTypeFromBuffer } from 'file-type';
import { fetchFile } from '../../utils/urls';
import { getLogger } from 'log4js';

const forwardCache = new Map<string, any>();
const forwardCacheTasks = new Map<string, Promise<void>>();
const log = getLogger('Q2tgServlet');

type CachedImageElem = Extract<CachedMessageElem, { type: 'image' | 'flash' }>;

let app = new Elysia()
  .post('/Q2tgServlet/GetForwardMultipleMessageApi', async ({ body }) => {
    const requestBody = body as { uuid: string; opened?: boolean };
    const messages = await loadForwardMessages(requestBody.uuid);
    const cached = isForwardCached(messages);
    if (requestBody.opened && !cached) {
      startOpenedForwardCache(requestBody.uuid, messages);
    }
    return { messages, cached };
  }, {
    body: t.Object({
      // 不许注入
      uuid: t.String({ format: 'uuid' }),
      opened: t.Optional(t.Boolean()),
    }),
  })
  .post('/Q2tgServlet/DownloadForwardMultipleMediaApi', async ({ body, set }) => {
    const requestBody = body as { uuid: string; path: number[] };
    const uuid = requestBody.uuid;
    const indexPath = requestBody.path;
    let messages: CachedForwardMessage[] | undefined;
    try {
      messages = await loadForwardMessages(uuid);
      const data = await db.forwardMultiple.findFirst({
        where: { id: uuid },
      });
      if (!data) throw new Error('消息记录不存在');
      const pair = Pair.getByDbId(data.fromPairId);
      let elem: CachedForwardMessage['message'][number];
      try {
        elem = await downloadForwardMedia(uuid, messages, indexPath, pair.qq);
      }
      catch (e) {
        // Video URLs in forwarded messages can expire. Refresh the forward record once and retry.
        await refreshForwardMedia(uuid, messages, indexPath, data.resId, data.fileName || undefined, data.fromPairId);
        elem = await downloadForwardMedia(uuid, messages, indexPath, pair.qq).catch((retryError) => {
          const message = retryError instanceof Error ? retryError.message : String(retryError);
          throw new Error(`保存媒体失败：${message}`);
        });
      }
      await saveForwardMessages(uuid, messages);
      const cached = isForwardCached(messages);
      return { elem, messages, cached };
    }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error('保存合并转发媒体失败', uuid, indexPath, e);
      if (messages) {
        await saveForwardMessages(uuid, messages).catch(saveError => {
          log.warn('保存合并转发媒体失败状态时出错', uuid, saveError);
        });
      }
      set.status = 500;
      return { message };
    }
  }, {
    body: t.Object({
      uuid: t.String({ format: 'uuid' }),
      path: t.Array(t.Number(), { minItems: 2, maxItems: 2 }),
    }),
  })
  .get('/Q2tgServlet/ForwardMultipleMedia/:uuid/:filename', async ({ params, set }) => {
    const file = await getMediaFile(params.uuid, decodeURIComponent(params.filename));
    set.headers['content-type'] = file.contentType;
    return fs.createReadStream(file.path);
  }, {
    params: t.Object({
      uuid: t.String({ format: 'uuid' }),
      filename: t.String(),
    }),
  })
  .get('/Q2tgServlet/ForwardMultipleMediaDownload/:uuid/:messageIndex/:elemIndex', async ({ params, set }) => {
    const uuid = params.uuid;
    const indexPath = [Number(params.messageIndex), Number(params.elemIndex)];
    if (indexPath.some(Number.isNaN)) throw new Error('非法媒体路径');
    const messages = await loadForwardMessages(uuid);
    const elem = getElemByPath(messages, indexPath);
    if (!elem) throw new Error('媒体不存在');
    if (elem.type !== 'image' && elem.type !== 'flash') throw new Error('此消息元素不支持图片下载');

    const imageElem = elem as CachedImageElem;
    const localFilename = getLocalCachedFilename(uuid, imageElem);
    const fallbackFilename = localFilename || `${elem.type}-${indexPath.join('-')}.jpg`;
    if (localFilename && elem.storage !== 'r2') {
      const file = await getMediaFile(uuid, localFilename);
      set.headers['content-type'] = file.contentType;
      set.headers['content-disposition'] = contentDisposition(fallbackFilename);
      return fs.createReadStream(file.path);
    }

    const buffer = await fetchImageFromSources(getImageDownloadSources(imageElem));
    const detectedType = await fileTypeFromBuffer(buffer).catch(() => undefined);
    const filename = ensureFilenameExt(fallbackFilename, detectedType?.ext);
    set.headers['content-type'] = detectedType?.mime || mime.lookup(filename) || 'application/octet-stream';
    set.headers['content-disposition'] = contentDisposition(filename);
    return buffer;
  }, {
    params: t.Object({
      uuid: t.String({ format: 'uuid' }),
      messageIndex: t.Numeric(),
      elemIndex: t.Numeric(),
    }),
  });

const loadForwardMessages = async (uuid: string): Promise<CachedForwardMessage[]> => {
  if (!forwardCache.has(uuid)) {
    const data = await db.forwardMultiple.findFirst({
      where: { id: uuid },
    });
    if (!data) throw new Error('消息记录不存在');

    if (data.cachedMessages) {
      const cachedMessages = data.cachedMessages as unknown as CachedForwardMessage[];
      if (normalizeForwardMessages(cachedMessages)) {
        await db.forwardMultiple.update({
          where: { id: uuid },
          data: { cachedMessages: JSON.parse(JSON.stringify(cachedMessages)) },
        });
      }
      forwardCache.set(uuid, cachedMessages);
    }
    else {
      const pair = Pair.getByDbId(data.fromPairId);
      const messages = await pair.qq.getForwardMsg(data.resId, data.fileName || undefined);
      await processNestedForward(messages, data.fromPairId);
      const cachedMessages = prepareForwardMessages(messages, uuid);
      normalizeForwardMessages(cachedMessages);
      await db.forwardMultiple.update({
        where: { id: uuid },
        data: { cachedMessages: JSON.parse(JSON.stringify(cachedMessages)) },
      });
      forwardCache.set(uuid, cachedMessages);
    }

    setTimeout(() => {
      forwardCache.delete(uuid);
    }, 1000 * 60 * 10);
  }
  return forwardCache.get(uuid);
};

const cacheOpenedForwardMessages = async (
  uuid: string,
  messages: CachedForwardMessage[],
  data?: NonNullable<Awaited<ReturnType<typeof db.forwardMultiple.findFirst>>>,
) => {
  data ||= await db.forwardMultiple.findFirst({
    where: { id: uuid },
  });
  if (!data) throw new Error('消息记录不存在');
  const pair = Pair.getByDbId(data.fromPairId);
  await cacheForwardInlineMedia(uuid, messages, pair.qq);
  await saveForwardMessages(uuid, messages);
  return isForwardCached(messages);
};

const startOpenedForwardCache = (uuid: string, messages: CachedForwardMessage[]) => {
  if (forwardCacheTasks.has(uuid)) return;
  const task = cacheOpenedForwardMessages(uuid, messages)
    .then(() => undefined)
    .catch(e => {
      log.warn('后台缓存合并转发媒体失败', uuid, e);
    })
    .finally(() => {
      forwardCacheTasks.delete(uuid);
    });
  forwardCacheTasks.set(uuid, task);
};

const isForwardCached = (messages: CachedForwardMessage[]) =>
  messages.every(message => message.message.every(elem => {
    if (elem.type !== 'image' && elem.type !== 'flash' && elem.type !== 'record') return true;
    const cachedElem = elem as CachedForwardMessage['message'][number];
    return cachedElem.downloadStatus === 'cached' && Boolean(cachedElem.localUrl);
  }));

const saveForwardMessages = async (uuid: string, messages: CachedForwardMessage[]) => {
  await db.forwardMultiple.update({
    where: { id: uuid },
    data: { cachedMessages: JSON.parse(JSON.stringify(messages)) },
  });
  forwardCache.set(uuid, messages);
};

const refreshForwardMedia = async (
  uuid: string,
  messages: CachedForwardMessage[],
  indexPath: number[],
  resId: string,
  fileName: string | undefined,
  fromPairId: number,
) => {
  const [messageIndex, elemIndex] = indexPath;
  const pair = Pair.getByDbId(fromPairId);
  const freshMessages = await pair.qq.getForwardMsg(resId, fileName);
  await processNestedForward(freshMessages, fromPairId);
  const freshCachedMessages = prepareForwardMessages(freshMessages, uuid);
  const freshElem = freshCachedMessages[messageIndex]?.message?.[elemIndex];
  if (!freshElem) throw new Error('刷新媒体地址失败：消息元素不存在');
  const oldElem = messages[messageIndex].message[elemIndex];
  messages[messageIndex].message[elemIndex] = {
    ...freshElem,
    localUrl: oldElem.localUrl,
    downloadStatus: oldElem.downloadStatus,
    downloadName: oldElem.downloadName,
    storage: oldElem.storage,
  };
};

const getLocalCachedFilename = (uuid: string, elem: CachedImageElem) => {
  const filenameFromUrl = getLocalMediaFilenameFromUrl(uuid, elem.localUrl);
  if (filenameFromUrl) return filenameFromUrl;
  if (/^https?:\/\//i.test(elem.localUrl || '')) return '';
  return elem.storage === 'r2' ? '' : elem.downloadName || '';
};

const getLocalMediaFilenameFromUrl = (uuid: string, url?: string) => {
  if (!url) return '';
  const marker = `/Q2tgServlet/ForwardMultipleMedia/${uuid}/`;
  try {
    const { pathname } = new URL(url, 'http://q2tg.local');
    if (!pathname.startsWith(marker)) return '';
    return decodeURIComponent(pathname.slice(marker.length));
  }
  catch {
    return '';
  }
};

const fetchImageFromSources = async (sources: ImageDownloadSource[]) => {
  let lastError: unknown;
  for (const source of sources) {
    try {
      if (source.type === 'buffer') return source.data;
      if (source.type === 'file') return await fs.promises.readFile(source.path.replace(/^file:\/\//, ''));
      return await fetchFile(source.url);
    }
    catch (e) {
      lastError = e;
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError || '无可用下载源');
  throw new Error(`图片下载失败：${message}`);
};

const ensureFilenameExt = (filename: string, ext?: string) => {
  if (!ext || /\.[a-z\d]{1,8}$/i.test(filename)) return filename;
  return `${filename}.${ext}`;
};

const contentDisposition = (filename: string) => {
  const safeFilename = (filename || 'download').replace(/[\r\n"]/g, '_').replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeRFC5987ValueChars(filename)}`;
};

const encodeRFC5987ValueChars = (value: string) =>
  encodeURIComponent(value).replace(/['()*]/g, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

export default app;
