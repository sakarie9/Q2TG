import { getLogger } from 'log4js';
import env from '../models/env';
import richHeader from './richHeader';
import telegramAvatar from './telegramAvatar';
import '@bogeychan/elysia-polyfills/node/index.js';
import { Elysia } from 'elysia';
import ui from './ui';
import q2tgServlet from './q2tgServlet';

const log = getLogger('Web Api');

let app = new Elysia()
  .onError(({ code, error, request, set }) => {
    const message = error instanceof Error ? error.message : String(error);
    log.error(request.method, request.url, message);
    log.debug(error);
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { message: 'Not Found' };
    }
    if (code === 'VALIDATION') {
      set.status = 400;
      return { message };
    }
    return { message };
  })
  .get('/', () => {
    return { hello: 'Q2TG' };
  })
  .use(telegramAvatar)
  .use(richHeader)
  .use(ui)
  .use(q2tgServlet);

export default {
  startListening() {
    app.listen(env.LISTEN_PORT);
    log.info('Listening on', env.LISTEN_PORT);
  },
};

export type App = typeof app;
