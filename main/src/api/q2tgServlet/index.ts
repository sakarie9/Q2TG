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
    // @ts-ignore
    const uuid = body.uuid;
    await loadForwardMessages(uuid);
    return forwardCache.get(uuid);
  }, {
    body: t.Object({
      // 不许注入
      uuid: t.String({ format: 'uuid' }),
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
    await saveForwardMessages(uuid, messages);
    return elem;
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

    const messages = forwardCache.get(uuid) as CachedForwardMessage[];
    const pair = Pair.getByDbId(data.fromPairId);
    if (await cacheForwardInlineMedia(uuid, messages, pair.qq)) {
      await saveForwardMessages(uuid, messages);
    }

    setTimeout(() => {
      forwardCache.delete(uuid);
    }, 1000 * 60 * 10);
  }
  return forwardCache.get(uuid);
};

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
  messages[messageIndex].message[elemIndex] = {
    ...freshElem,
    localUrl: messages[messageIndex].message[elemIndex].localUrl,
    downloadStatus: messages[messageIndex].message[elemIndex].downloadStatus,
    downloadName: messages[messageIndex].message[elemIndex].downloadName,
  };
};

export default app;
