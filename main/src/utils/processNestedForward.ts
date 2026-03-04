import { ForwardMessage } from '../client/QQClient';
import forwardHelper from '../helpers/forwardHelper';
import db from '../models/db';

const processNestedForward = async (messages: ForwardMessage[], fromPairId: number): Promise<void> => {
  for (const message of messages) {
    for (const elem of message.message) {
      if (elem.type === 'json') {
        const parsed = forwardHelper.processJson(elem.data);
        if (parsed.type !== 'forward') continue;
        let entity = await db.forwardMultiple.findFirst({ where: { resId: parsed.resId } });
        if (!entity) {
          entity = await db.forwardMultiple.create({
            data: {
              resId: parsed.resId,
              fileName: parsed.fileName,
              fromPairId,
            },
          });
        }
        elem.data = JSON.stringify({ type: 'forward', uuid: entity.id });
      }
      // 处理 forward 类型元素（嵌套合并转发，content 字段中已包含消息内容）
      else if (elem.type === 'forward' && Array.isArray((elem as any).content)) {
        await processNestedForward((elem as any).content as ForwardMessage[], fromPairId);
      }
    }
  }
};

export default processNestedForward;
