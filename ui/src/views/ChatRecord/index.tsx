import { computed, defineComponent, effect, ref } from 'vue';
import styles from './index.module.sass';
import { useBrowserLocation } from '@vueuse/core';
import Viewer from './Viewer';
import client from '@/utils/client';

export default defineComponent({
  setup() {
    const location = useBrowserLocation();
    const uuid = computed(() => {
      const params = new URLSearchParams(location.value.search);
      return params.get('tgWebAppStartParam');
    });
    const loading = ref(true);
    const data = ref(null);
    const error = ref<string>('');
    effect(async () => {
      if (!uuid.value) {
        error.value = '未指定消息记录 ID';
        loading.value = false;
        return;
      }
      try {
        const result = await client.Q2tgServlet.GetForwardMultipleMessageApi.post({ uuid: uuid.value! });
        console.log(result);
        data.value = result.data;
        error.value = result.error?.value?.message || result.error?.message;
      }
      catch (e: any) {
        error.value = e.message;
      }
      loading.value = false;
    });

    return () => {
      if (loading.value)
        return <div class={styles.tip}>
          加载中...
        </div>;
      if (error.value || !data.value)
        return <div class={styles.tip}>
          {error.value || '出错了'}
        </div>;
      return <div class={styles.container}>
        <Viewer messages={data.value} uuid={uuid.value!}/>
      </div>;
    };
  },
});
