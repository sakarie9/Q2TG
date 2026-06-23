import { Elysia, t } from 'elysia';
import db from '../../models/db';
import { Pair } from '../../models/Pair';
import processNestedForward from '../../utils/processNestedForward';
import {
  CachedForwardMessage,
  cacheForwardInlineMedia,
  downloadForwardMedia,
  getMediaFile,
  prepareForwardMessages,
} from '../../utils/forwardMultipleCache';
import fs from 'fs';

const forwardCache = new Map<string, any>();

let app = new Elysia()
  .post('/Q2tgServlet/GetForwardMultipleMessageApi', async ({ body }) => {
    const requestBody = body as { uuid: string; opened?: boolean };
    const messages = await loadForwardMessages(requestBody.uuid);
    const cached = requestBody.opened ? await cacheOpenedForwardMessages(requestBody.uuid, messages) : isForwardCached(messages);
    return { messages, cached };
  }, {
    body: t.Object({
      // 不许注入
      uuid: t.String({ format: 'uuid' }),
      opened: t.Optional(t.Boolean()),
    }),
  })
  .post('/Q2tgServlet/DownloadForwardMultipleMediaApi', async ({ body }) => {
    const requestBody = body as { uuid: string; path: number[] };
    const uuid = requestBody.uuid;
    const indexPath = requestBody.path;
    const messages = await loadForwardMessages(uuid);
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
    const cached = await cacheOpenedForwardMessages(uuid, messages, data);
    return { elem, messages, cached };
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
  });

const loadForwardMessages = async (uuid: string): Promise<CachedForwardMessage[]> => {
  if (!forwardCache.has(uuid)) {
    const data = await db.forwardMultiple.findFirst({
      where: { id: uuid },
    });
    if (!data) throw new Error('消息记录不存在');

    if (data.cachedMessages) {
      forwardCache.set(uuid, data.cachedMessages);
    }
    else {
      const pair = Pair.getByDbId(data.fromPairId);
      const messages = await pair.qq.getForwardMsg(data.resId, data.fileName || undefined);
      await processNestedForward(messages, data.fromPairId);
      const cachedMessages = prepareForwardMessages(messages, uuid);
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

const isForwardCached = (messages: CachedForwardMessage[]) =>
  messages.every(message => message.message.every(elem => {
    if (elem.type !== 'image' && elem.type !== 'flash' && elem.type !== 'record' && elem.type !== 'video') return true;
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

export default app;
