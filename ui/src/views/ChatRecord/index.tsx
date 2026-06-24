import { computed, defineComponent, onMounted, onUnmounted, provide, ref, watchEffect } from 'vue';
import styles from './index.module.sass';
import { useBrowserLocation } from '@vueuse/core';
import Viewer from './Viewer';
import client from '@/utils/client';
import type { ForwardMessage } from './Viewer/types/ForwardMessage';

type ForwardPage = {
  uuid: string;
  messages: ForwardMessage[] | null;
  cached: boolean;
  loading: boolean;
  error: string;
};

type BrowserLocationValue = {
  search?: string;
  hash?: string;
  pathname?: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          start_param?: string;
          startParam?: string;
        };
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

export default defineComponent({
  setup() {
    const location = useBrowserLocation();
    const telegramStartParam = ref('');
    const initialUuid = computed(() => {
      return getForwardUuidFromSources(location.value, telegramStartParam.value);
    });
    const stack = ref<ForwardPage[]>([]);
    const currentPage = computed(() => stack.value[stack.value.length - 1]);
    const currentUuid = computed(() => currentPage.value?.uuid || '');
    let cacheRefreshTimer: number | undefined;

    provide('forwardMultipleUpdate', (messages: ForwardMessage[], isCached: boolean) => {
      if (!currentPage.value) return;
      currentPage.value.messages = messages;
      currentPage.value.cached = isCached;
    });

    const updatePage = (uuid: string, patch: Partial<ForwardPage>) => {
      stack.value = stack.value.map(page => page.uuid === uuid ? { ...page, ...patch } : page);
    };

    const loadPage = async (uuid: string, opened = true) => {
      try {
        updatePage(uuid, { loading: true, error: '' });
        const result = await withTimeout(
          client.Q2tgServlet.GetForwardMultipleMessageApi.post({ uuid, opened }),
          30000,
          '加载超时，请重新打开页面',
        );
        updatePage(uuid, {
          messages: result.data?.messages || null,
          cached: Boolean(result.data?.cached),
          error: result.error?.value?.message || result.error?.message || '',
        });
      }
      catch (e: any) {
        updatePage(uuid, { error: e.message || String(e) });
      }
      finally {
        updatePage(uuid, { loading: false });
      }
    };

    const refreshPageCache = async (uuid: string) => {
      const page = stack.value.find(item => item.uuid === uuid);
      if (!page || page.loading || page.cached) return;
      try {
        const result = await client.Q2tgServlet.GetForwardMultipleMessageApi.post({ uuid, opened: false });
        if (!result.data) return;
        updatePage(uuid, {
          messages: result.data.messages || page.messages,
          cached: Boolean(result.data.cached),
          error: result.error?.value?.message || result.error?.message || page.error,
        });
      }
      catch {
      }
    };

    const openForward = async (uuid: string) => {
      if (!uuid) return;
      const page = stack.value.find(item => item.uuid === uuid);
      if (page) {
        stack.value = stack.value.slice(0, stack.value.indexOf(page) + 1);
        return;
      }
      const nextPage: ForwardPage = { uuid, messages: null, cached: false, loading: true, error: '' };
      stack.value = [...stack.value, nextPage];
      const params = new URLSearchParams(location.value.search);
      setForwardUuid(params, uuid);
      history.replaceState(null, '', `${location.value.pathname}?${params.toString()}${location.value.hash || ''}`);
      await loadPage(uuid);
    };

    const goBack = () => {
      if (stack.value.length <= 1) return;
      stack.value = stack.value.slice(0, -1);
      const params = new URLSearchParams(location.value.search);
      setForwardUuid(params, currentUuid.value);
      history.replaceState(null, '', `${location.value.pathname}?${params.toString()}${location.value.hash || ''}`);
    };

    provide('openForwardMultiple', openForward);

    const refreshTelegramStartParam = () => {
      telegramStartParam.value = getTelegramStartParam();
    };
    let telegramRefreshTimers: number[] = [];

    onMounted(() => {
      window.Telegram?.WebApp?.ready?.();
      window.Telegram?.WebApp?.expand?.();
      refreshTelegramStartParam();
      telegramRefreshTimers = [100, 500, 1500].map(delay => window.setTimeout(refreshTelegramStartParam, delay));
      window.addEventListener('hashchange', refreshTelegramStartParam);
      window.addEventListener('popstate', refreshTelegramStartParam);
    });

    onUnmounted(() => {
      telegramRefreshTimers.forEach(timer => window.clearTimeout(timer));
      if (cacheRefreshTimer) window.clearInterval(cacheRefreshTimer);
      window.removeEventListener('hashchange', refreshTelegramStartParam);
      window.removeEventListener('popstate', refreshTelegramStartParam);
    });

    watchEffect(() => {
      if (cacheRefreshTimer) {
        window.clearInterval(cacheRefreshTimer);
        cacheRefreshTimer = undefined;
      }
      const page = currentPage.value;
      if (!page || page.loading || page.cached || !page.messages) return;
      cacheRefreshTimer = window.setInterval(() => refreshPageCache(page.uuid), 2500);
    });

    watchEffect(async () => {
      if (!initialUuid.value) {
        stack.value = [{ uuid: '', messages: null, cached: false, loading: false, error: '未指定消息记录 ID' }];
        return;
      }
      if (stack.value[0]?.uuid === initialUuid.value) return;
      const page: ForwardPage = { uuid: initialUuid.value, messages: null, cached: false, loading: true, error: '' };
      stack.value = [page];
      await loadPage(page.uuid);
    });

    return () => {
      const page = currentPage.value;
      if (!page || page.loading)
        return <div class={styles.tip}>
          加载中...
        </div>;
      if (page.error || !page.messages)
        return <div class={styles.tip}>
          {page.error || '出错了'}
        </div>;
      const hasNavigation = stack.value.length > 1;
      const hasTopBar = hasNavigation || page.cached;
      return <div class={[styles.container, hasNavigation && styles.withTopBar].filter(Boolean).join(' ')}>
        {hasTopBar && <div class={styles.topBar}>
          {hasNavigation && <button class={styles.backButton} type="button" onClick={goBack} aria-label="返回上层">
            <svg viewBox="0 0 24 24" class={styles.backIcon} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            <span>返回上层</span>
          </button>}
          {page.cached && <div class={styles.cacheBadge} aria-label="已缓存">
            <span class={styles.cacheCheck}/>
          </div>}
        </div>}
        <Viewer messages={page.messages} uuid={page.uuid}/>
      </div>;
    };
  },
});

const getForwardUuid = (params: URLSearchParams) =>
  params.get('tgWebAppStartParam')
  || params.get('startapp')
  || params.get('startApp')
  || params.get('start_param')
  || params.get('startParam')
  || params.get('hash');

const getForwardUuidFromSources = (locationValue: BrowserLocationValue, telegramStartParam: string) => {
  const candidates = [
    telegramStartParam,
    getForwardUuid(new URLSearchParams(locationValue.search || '')),
    getForwardUuid(new URLSearchParams(window.location.search)),
    getForwardUuid(getHashParams(locationValue.hash || '')),
    getForwardUuid(getHashParams(window.location.hash)),
    getForwardUuidFromTelegramInitData(),
  ];
  return candidates.find(isForwardUuid) || candidates.find(Boolean) || '';
};

const getHashParams = (hash: string) => {
  const rawHash = hash.replace(/^#/, '').replace(/^\?/, '');
  const params = new URLSearchParams(rawHash);
  const webAppData = params.get('tgWebAppData');
  if (webAppData) {
    const nestedParams = new URLSearchParams(webAppData);
    for (const [key, value] of nestedParams) params.set(key, value);
  }
  return params;
};

const getTelegramStartParam = () =>
  window.Telegram?.WebApp?.initDataUnsafe?.start_param
  || window.Telegram?.WebApp?.initDataUnsafe?.startParam
  || getForwardUuidFromTelegramInitData()
  || '';

const getForwardUuidFromTelegramInitData = () =>
  getForwardUuid(new URLSearchParams(window.Telegram?.WebApp?.initData || '')) || '';

const isForwardUuid = (value?: string | null) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const setForwardUuid = (params: URLSearchParams, uuid: string) => {
  params.set(params.has('startapp') ? 'startapp' : 'tgWebAppStartParam', uuid);
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string) => {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  }
  finally {
    if (timer) window.clearTimeout(timer);
  }
};
