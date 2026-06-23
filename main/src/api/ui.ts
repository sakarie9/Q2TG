import { Elysia } from 'elysia';
import env from '../models/env';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

let app = new Elysia();

const proxyUi = (req: Request, pathnamePrefix = '/ui') => {
  const url = new URL(req.url);
  const baseUrl = new URL(env.UI_PROXY!);
  url.hostname = baseUrl.hostname;
  url.port = baseUrl.port;
  url.protocol = baseUrl.protocol;
  url.pathname = pathnamePrefix + url.pathname;
  return fetch(url.toString(), req);
};

if (env.UI_PROXY) {
  app = app
    .mount('/ui/', req => proxyUi(req))
    .get('/viewer', ({ request }) => proxyUi(request, ''))
    .get('/viewer/*', ({ request }) => proxyUi(request, ''));
}
else if (env.UI_PATH) {
  const uiPath = env.UI_PATH;
  const serveIndex = ({ set }: { set: { headers: Record<string, string> } }) => {
    set.headers['content-type'] = 'text/html';
    set.headers['cache-control'] = 'no-store';
    return fs.createReadStream(path.join(uiPath, 'index.html'));
  };

  for (const asset of fs.readdirSync(path.join(uiPath, 'assets'))) {
    app = app.get('/ui/assets/' + asset, ({ set }) => {
      set.headers['content-type'] = mime.lookup(asset) || undefined;
      return fs.createReadStream(path.join(uiPath, 'assets', asset));
    });
  }
  app = app
    .get('/ui/*', serveIndex)
    .get('/viewer', serveIndex)
    .get('/viewer/*', serveIndex);
}

export default app;
