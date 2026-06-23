import { computed, defineComponent, inject, ref, watchEffect } from 'vue';
import type BilibiliMiniApp from '../types/BilibiliMiniApp';
import type StructMessageCard from '../types/StructMessageCard';
import { NSpace } from 'naive-ui';
import client from '@/utils/client';
import type { ForwardMessage } from '../types/ForwardMessage';
import styles from './MessageElement.module.sass';

type OpenForwardMultiple = (uuid: string) => void | Promise<void>;

export default defineComponent({
  props: {
    json: { required: true, type: String },
  },
  setup(props) {
    const jsonObj = computed(() => JSON.parse(props.json));
    const openForwardMultiple = inject<OpenForwardMultiple | undefined>('openForwardMultiple', undefined);
    const previewLoading = ref(false);
    const previewError = ref('');
    const previewMessages = ref<ForwardMessage[] | null>(null);
    let previewRequestId = 0;

    const openForward = (uuid: string) => {
      openForwardMultiple?.(uuid);
    };

    watchEffect(async () => {
      const uuid = jsonObj.value?.type === 'forward' ? jsonObj.value.uuid : '';
      const requestId = ++previewRequestId;
      previewMessages.value = null;
      previewError.value = '';
      if (!uuid) return;
      previewLoading.value = true;
      try {
        const result = await client.Q2tgServlet.GetForwardMultipleMessageApi.post({ uuid, opened: false });
        if (requestId !== previewRequestId) return;
        previewMessages.value = result.data?.messages || null;
        previewError.value = result.error?.value?.message || result.error?.message || '';
      }
      catch (e: any) {
        if (requestId !== previewRequestId) return;
        previewError.value = e.message;
      }
      finally {
        if (requestId === previewRequestId) previewLoading.value = false;
      }
    });

    return () => {
      if (jsonObj.value.type === 'forward') {
        const messages = previewMessages.value || [];
        const previewItems = buildForwardPreview(messages);
        return <button class={styles.forwardPreviewCard} type="button" onClick={() => openForward(jsonObj.value.uuid)}>
          <div class={styles.forwardPreviewHeader}>
            <span>合并转发</span>
            <svg class={styles.forwardPreviewIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
          {previewLoading.value && <div class={styles.forwardPreviewHint}>加载预览中...</div>}
          {previewError.value && <div class={styles.forwardPreviewHint}>{previewError.value}</div>}
          {!previewLoading.value && !previewError.value && previewItems.length > 0 && <div class={styles.forwardPreviewList}>
            {previewItems.map((item, index) => <div class={styles.forwardPreviewItem} key={index}>
              <span class={styles.forwardPreviewSender}>{item.sender}</span>
              <span class={styles.forwardPreviewText}>{item.text}</span>
            </div>)}
          </div>}
          {!previewLoading.value && !previewError.value && <div class={styles.forwardPreviewFooter}>
            共 {messages.length} 条消息
          </div>}
        </button>;
      }
      if (jsonObj.value.app === 'com.tencent.mannounce') {
        try {
          const title = atob(jsonObj.value.meta.mannounce.title);
          const content = btoa(jsonObj.value.meta.mannounce.text);
          return <div>
            <p><strong>{title}</strong></p>
            <p>{content}</p>
          </div>;
        }
        catch (err) {
          return <div>[群公告]</div>;
        }
      }
      const biliRegex = /(https?:\\?\/\\?\/b23\.tv\\?\/\w*)\??/;
      const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?zhihu\.com\\?\/[^?"=]*)\??/;
      const biliRegex2 = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?"=]*)\??/;
      const jsonLinkRegex = /{.*"app":"com.tencent.structmsg".*"jumpUrl":"(https?:\\?\/\\?\/[^",]*)".*}/;
      const jsonAppLinkRegex = /"contentJumpUrl": ?"(https?:\\?\/\\?\/[^",]*)"/;
      let appurl = '';
      if (biliRegex.test(props.json))
        appurl = props.json.match(biliRegex)![1].replace(/\\\//g, '/');
      else if (biliRegex2.test(props.json))
        appurl = props.json.match(biliRegex2)![1].replace(/\\\//g, '/');
      else if (zhihuRegex.test(props.json))
        appurl = props.json.match(zhihuRegex)![1].replace(/\\\//g, '/');
      else if (jsonLinkRegex.test(props.json))
        appurl = props.json.match(jsonLinkRegex)![1].replace(/\\\//g, '/');
      else if (jsonAppLinkRegex.test(props.json))
        appurl = props.json.match(jsonAppLinkRegex)![1].replace(/\\\//g, '/');
      if (appurl) {
        try {
          const meta = (jsonObj.value as BilibiliMiniApp).meta.detail_1 || (jsonObj.value as StructMessageCard).meta.news;
          let previewUrl = meta.preview;
          if (!previewUrl.toLowerCase().startsWith('http')) {
            previewUrl = 'https://' + previewUrl;
          }
          return <a href={appurl} class="c-blue-5" target="_blank">
            <NSpace vertical>
              <p class="font-600">[{meta.title}]</p>
              <img src={previewUrl} alt={meta.title} referrerpolicy="no-referrer" width={200}/>
              <p>{meta.desc}</p>
            </NSpace>
          </a>;
        }
        catch (e) {
        }
      }
      return <div>[JSON 卡片]</div>;
    };
  },
});

const buildForwardPreview = (messages: ForwardMessage[]) =>
  messages.slice(0, 4).map(message => ({
    sender: message.nickname || String(message.user_id),
    text: summarizeMessage(message),
  })).filter(item => item.text);

const summarizeMessage = (message: ForwardMessage) => {
  const raw = message.raw_message?.trim();
  if (raw) return truncate(raw);
  const parts = message.message.map(elem => {
    switch (elem.type) {
      case 'text':
      case 'at':
        return elem.text || '';
      case 'image':
      case 'flash':
        return '[图片]';
      case 'video':
      case 'video-loop':
        return '[视频]';
      case 'record':
        return '[语音]';
      case 'file':
        return `[文件] ${elem.name}`;
      case 'json':
        try {
          const json = JSON.parse(elem.data);
          return json.type === 'forward' ? '[合并转发]' : '[JSON 卡片]';
        }
        catch {
          return '[JSON 卡片]';
        }
      case 'xml':
        return '[XML 卡片]';
      case 'location':
        return `[位置] ${elem.name || elem.address || ''}`;
      default:
        return `[${elem.type}]`;
    }
  }).filter(Boolean).join(' ');
  return truncate(parts || '[消息]');
};

const truncate = (text: string) => text.length > 56 ? `${text.slice(0, 56)}...` : text;
