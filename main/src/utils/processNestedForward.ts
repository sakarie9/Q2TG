import { ForwardMessage } from '../client/QQClient';
import forwardHelper from '../helpers/forwardHelper';
import db from '../models/db';
import { Pair } from '../models/Pair';
import { prepareForwardMessages } from './forwardMultipleCache';

export default async function processNestedForward(messages: ForwardMessage[], fromPairId: number) {
  for (const message of messages) {
    for (let i = 0; i < message.message.length; i++) {
      const elem = message.message[i];
      if (elem.type === 'json') {
        const parsed = await forwardHelper.processJson(elem.data);
        if (parsed.type !== 'forward') continue;
        const entity = await getForwardEntity(parsed.resId, parsed.fileName, fromPairId);
        elem.data = JSON.stringify({ type: 'forward', uuid: entity.id });
      }
      else if (elem.type === 'xml') {
        const parsed = forwardHelper.processXml(elem.data);
        if (parsed.type !== 'forward') continue;
        let resId = parsed.resId;
        let content: ForwardMessage[] | undefined;
        // m_resid 缺失时 processXml 会回退到 m_fileName，需要实际探测哪个 id 可用。
        // 兼容 SnowLuma：其 get_forward_msg 返回的嵌套转发卡片只有 m_fileName。
        if (parsed.fileName && parsed.resId === parsed.fileName) {
          const resolved = await tryResolveForward(parsed.resId, parsed.fileName, message.seq, fromPairId);
          if (!resolved) continue;
          resId = resolved.resId;
          content = resolved.messages;
        }
        const entity = await getForwardEntity(resId, parsed.fileName, fromPairId, content);
        message.message[i] = { type: 'json', data: JSON.stringify({ type: 'forward', uuid: entity.id }) };
      }
      else if (elem.type === 'forward') {
        const entity = await getForwardEntity(elem.id, undefined, fromPairId, elem.content);
        message.message[i] = { type: 'json', data: JSON.stringify({ type: 'forward', uuid: entity.id }) };
      }
    }
  }
}

const tryResolveForward = async (
  resId: string,
  fileName: string,
  messageId: number,
  fromPairId: number,
): Promise<{ resId: string, messages: ForwardMessage[] } | undefined> => {
  const pair = Pair.getByDbId(fromPairId);
  if (!pair) return undefined;
  const candidates = new Set<string>();
  if (resId) candidates.add(resId);
  if (!/^MultiMsg_/i.test(fileName)) candidates.add(`MultiMsg_${fileName}`);
  // SnowLuma 支持通过 message_id 反查转发内容，放在 file name 之后兜底
  if (messageId > 0) candidates.add(String(messageId));
  for (const candidate of candidates) {
    try {
      const messages = await pair.qq.getForwardMsg(candidate, fileName);
      if (messages?.length) return { resId: candidate, messages };
    }
    catch {
      // 该候选不可用，继续尝试下一个
    }
  }
  return undefined;
};

const getForwardEntity = async (resId: string, fileName: string | undefined, fromPairId: number, content?: ForwardMessage[]) => {
  let entity = await db.forwardMultiple.findFirst({
    where: { resId, fromPairId },
  });
  if (!entity) {
    entity = await db.forwardMultiple.create({
      data: {
        resId,
        fileName,
        fromPairId,
      },
    });
  }
  if (content) {
    await processNestedForward(content, fromPairId);
    const cachedMessages = JSON.parse(JSON.stringify(prepareForwardMessages(content, entity.id)));
    entity = await db.forwardMultiple.update({
      where: { id: entity.id },
      data: { cachedMessages },
    });
  }
  return entity;
};

const tryProcessJson = (json: string) => {
  try {
    return forwardHelper.processJson(json);
  }
  catch {
    return undefined;
  }
};
