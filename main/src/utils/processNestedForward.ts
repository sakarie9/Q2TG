import { ForwardMessage } from '../client/QQClient';
import forwardHelper from '../helpers/forwardHelper';
import db from '../models/db';
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
        const entity = await getForwardEntity(parsed.resId, undefined, fromPairId);
        message.message[i] = { type: 'json', data: JSON.stringify({ type: 'forward', uuid: entity.id }) };
      }
      else if (elem.type === 'forward') {
        const entity = await getForwardEntity(elem.id, undefined, fromPairId, elem.content);
        message.message[i] = { type: 'json', data: JSON.stringify({ type: 'forward', uuid: entity.id }) };
      }
    }
  }
}

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
