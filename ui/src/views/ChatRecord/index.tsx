import { computed, defineComponent, effect, provide, ref } from 'vue';
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

export default defineComponent({
  setup() {
    const location = useBrowserLocation();
    const initialUuid = computed(() => {
      const params = new URLSearchParams(location.value.search);
      return params.get('tgWebAppStartParam');
    });
    const stack = ref<ForwardPage[]>([]);
    const currentPage = computed(() => stack.value[stack.value.length - 1]);
    const currentUuid = computed(() => currentPage.value?.uuid || '');

    provide('forwardMultipleUpdate', (messages: ForwardMessage[], isCached: boolean) => {
      if (!currentPage.value) return;
      currentPage.value.messages = messages;
      currentPage.value.cached = isCached;
    });

    const loadPage = async (page: ForwardPage, opened = true) => {
      try {
        page.loading = true;
        page.error = '';
        const result = await client.Q2tgServlet.GetForwardMultipleMessageApi.post({ uuid: page.uuid, opened });
        page.messages = result.data?.messages || null;
        page.cached = Boolean(result.data?.cached);
        page.error = result.error?.value?.message || result.error?.message || '';
      }
      catch (e: any) {
        page.error = e.message;
      }
      finally {
        page.loading = false;
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
      params.set('tgWebAppStartParam', uuid);
      history.replaceState(null, '', `${location.value.pathname}?${params.toString()}${location.value.hash || ''}`);
      await loadPage(nextPage);
    };

    const goBack = () => {
      if (stack.value.length <= 1) return;
      stack.value = stack.value.slice(0, -1);
      const params = new URLSearchParams(location.value.search);
      params.set('tgWebAppStartParam', currentUuid.value);
      history.replaceState(null, '', `${location.value.pathname}?${params.toString()}${location.value.hash || ''}`);
    };

    provide('openForwardMultiple', openForward);

    effect(async () => {
      if (!initialUuid.value) {
        stack.value = [{ uuid: '', messages: null, cached: false, loading: false, error: '未指定消息记录 ID' }];
        return;
      }
      if (stack.value[0]?.uuid === initialUuid.value) return;
      const page: ForwardPage = { uuid: initialUuid.value, messages: null, cached: false, loading: true, error: '' };
      stack.value = [page];
      await loadPage(page);
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
        {hasNavigation && <div class={styles.layerTitle}>
          嵌套合并转发
        </div>}
        <Viewer messages={page.messages} uuid={page.uuid}/>
      </div>;
    };
  },
});
