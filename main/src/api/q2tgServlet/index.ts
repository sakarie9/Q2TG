import { Elysia, t } from 'elysia';
import db from '../../models/db';
import { Pair } from '../../models/Pair';
import OicqClient from '../../client/OicqClient';
import processNestedForward from '../../utils/processNestedForward';

const forwardCache = new Map<string, any>();

let app = new Elysia()
  .post('/Q2tgServlet/GetForwardMultipleMessageApi', async ({ body }) => {
    // @ts-ignore
    const uuid = body.uuid;
    if (!forwardCache.has(uuid)) {
      const data = await db.forwardMultiple.findFirst({
        where: { id: uuid },
      });
      if (!data) {
        throw new Error('未找到该转发消息记录');
      }
      const pair = Pair.getByDbId(data.fromPairId);
      if (!pair) {
        throw new Error('未找到对应的转发对，请检查 Bot 是否已完成初始化');
      }
      let messages;
      try {
        messages = await pair.qq.getForwardMsg(data.resId, data.fileName);
      }
      catch (e) {
        throw new Error(`获取转发消息失败，QQ 资源可能已过期: ${e.message}`);
      }
      if (pair.qqClient instanceof OicqClient) {
        await pair.qqClient.refreshImageRKey(messages);
      }
      await processNestedForward(messages, data.fromPairId);
      forwardCache.set(uuid, messages);

      setTimeout(() => {
        forwardCache.delete(uuid);
      }, 1000 * 60);
    }
    return forwardCache.get(uuid);
  }, {
    body: t.Object({
      // 不许注入
      uuid: t.String({ format: 'uuid' }),
    }),
  });

export default app;
