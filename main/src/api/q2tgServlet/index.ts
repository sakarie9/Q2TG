import { Elysia, t } from 'elysia';
import db from '../../models/db';
import { Pair } from '../../models/Pair';
import processNestedForward from '../../utils/processNestedForward';
import {
  CachedForwardMessage,
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
    // @ts-ignore
    const uuid = body.uuid;
    const messages = await loadForwardMessages(uuid);
    const data = await db.forwardMultiple.findFirst({
      where: { id: uuid },
    });
    if (!data) throw new Error('消息记录不存在');
    const pair = Pair.getByDbId(data.fromPairId);
    // @ts-ignore
    const elem = await downloadForwardMedia(uuid, messages, body.path, pair.qq);
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

export default app;
