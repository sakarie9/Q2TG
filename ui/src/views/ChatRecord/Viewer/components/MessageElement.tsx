import { defineComponent, inject, ref, type PropType } from 'vue';
import type { MessageElemExt } from '../types/MessageElemExt';
import styles from './MessageElement.module.sass';
import getImageUrlByMd5 from '../utils/getImageUrlByMd5';
import { NButton, NCard, NImage, NModal, NSpace } from 'naive-ui';
import JsonElement from './JsonElement';
import XmlElement from './XmlElement';
import linkifyStr from 'linkify-string';
import client from '@/utils/client';
import type { ForwardMessage } from '../types/ForwardMessage';

type ForwardMultipleUpdate = (messages: ForwardMessage[], cached: boolean) => void;

const DownloadIcon = () => <svg
  class={styles.imageToolbarIcon}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" y1="15" x2="12" y2="3"/>
</svg>;

const LinkIcon = () => <svg
  class={styles.imageToolbarIcon}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
  <path d="M15 7h2a5 5 0 1 1 0 10h-2"/>
  <line x1="8" y1="12" x2="16" y2="12"/>
</svg>;

export default defineComponent({
  props: {
    elem: { required: true, type: Object as PropType<MessageElemExt> },
    uuid: { required: true, type: String },
    path: { required: true, type: Object as PropType<number[]> },
  },
  setup(props) {
    const saving = ref(false);
    const imageDownloading = ref(false);
    const error = ref('');
    const imageUrlModalVisible = ref(false);
    const currentImageUrl = ref('');
    const updateForwardMultiple = inject<ForwardMultipleUpdate | undefined>('forwardMultipleUpdate', undefined);

    const saveMedia = async () => {
      saving.value = true;
      error.value = '';
      try {
        const result = await client.Q2tgServlet.DownloadForwardMultipleMediaApi.post({
          uuid: props.uuid,
          path: props.path,
        });
        if (result.error) {
          error.value = result.error.value?.message || result.error.message;
          return;
        }
        Object.assign(props.elem, result.data.elem);
        if (result.data.messages) {
          updateForwardMultiple?.(result.data.messages, Boolean(result.data.cached));
        }
      }
      catch (e: any) {
        error.value = e.message;
      }
      finally {
        saving.value = false;
      }
    };

    const saveButton = () => {
      if (props.elem.type !== 'video' || props.elem.localUrl) {
        return null;
      }
      return <NButton class="mt-4px" size="tiny" loading={saving.value} onClick={saveMedia}>
        保存到服务端
      </NButton>;
    };

    const mediaWrap = (content: any) => <NSpace vertical size={4}>
      {content}
      {saveButton()}
      {error.value && <div class="text-red-5 text-12px">{error.value}</div>}
    </NSpace>;

    const showImageUrl = (url: string | undefined, event: MouseEvent) => {
      event.stopPropagation();
      if (!url) return;
      currentImageUrl.value = url;
      imageUrlModalVisible.value = true;
    };

    const imageDownloadUrl = () =>
      `/Q2tgServlet/ForwardMultipleMediaDownload/${encodeURIComponent(props.uuid)}/${props.path[0]}/${props.path[1]}`;

    const downloadImage = async (event: MouseEvent) => {
      event.stopPropagation();
      if (imageDownloading.value) return;
      imageDownloading.value = true;
      error.value = '';
      try {
        const response = await fetch(imageDownloadUrl());
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = getFilenameFromDisposition(response.headers.get('content-disposition')) || 'image';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
      catch (e: any) {
        const message = e.message || String(e);
        error.value = message;
        window.alert(`下载图片失败：${message}`);
      }
      finally {
        imageDownloading.value = false;
      }
    };

    const getFilenameFromDisposition = (disposition: string | null) => {
      const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      if (encoded) {
        try {
          return decodeURIComponent(encoded);
        }
        catch {
          return encoded;
        }
      }
      return disposition?.match(/filename="([^"]+)"/i)?.[1] || '';
    };

    const imageLinkModal = () => <NModal v-model:show={imageUrlModalVisible.value}>
      <NCard class={styles.imageUrlCard} title="图片链接" bordered={false}>
        <div class={styles.imageUrlText}>{currentImageUrl.value}</div>
      </NCard>
    </NModal>;

    return () => {
      switch (props.elem.type) {
        case 'text':
        case 'face':
        case 'sface':
        case 'at':
          // will not xss
          return <div class={styles.messageContent} innerHTML={linkifyStr(props.elem.text || '', {
            nl2br: true,
            target: '_blank',
          })}></div>;
        case 'image':
        case 'flash': {
          let url = props.elem.localUrl || props.elem.url;
          let md5;
          if (!url && typeof props.elem.file === 'string') {
            md5 = props.elem.file.substring(0, 32);
            if (!/([a-f\d]{32}|[A-F\d]{32})/.test(md5))
              md5 = undefined;
            if (md5) {
              url = getImageUrlByMd5(md5);
            }
          }
          return mediaWrap(<>
            <NImage
              class="mt-4px"
              width={200}
              src={url}
              previewSrc={url}
              imgProps={{ referrerpolicy: 'no-referrer' }}
              renderToolbar={({ nodes }) => <>
                {nodes.rotateCounterclockwise}
                {nodes.rotateClockwise}
                {nodes.resizeToOriginalSize}
                {nodes.zoomOut}
                {nodes.zoomIn}
                <button
                  class={styles.imageToolbarButton}
                  title="下载图片"
                  type="button"
                  aria-label="下载图片"
                  disabled={imageDownloading.value}
                  onClick={downloadImage}
                >
                  <DownloadIcon/>
                </button>
                <button
                  class={styles.imageToolbarButton}
                  title="显示图片链接"
                  type="button"
                  aria-label="显示图片链接"
                  onClick={(event) => showImageUrl(url, event)}
                >
                  <LinkIcon/>
                </button>
                {nodes.close}
              </>}
            />
            {imageLinkModal()}
          </>);
        }
        case 'video-loop':
          return <video src={props.elem.url} autoplay muted loop width={200}/>;
        case 'tgs':
          return <tgs-player autoplay={true} loop={true} mode="normal" src={props.elem.url}
                             style={{ width: 200, height: 200 }}/>;
        case 'video':
          return mediaWrap(props.elem.localUrl || props.elem.url ?
            <video src={props.elem.localUrl || props.elem.url} controls width={240}/> :
            <div>[视频]</div>);
        case 'record':
          return mediaWrap(props.elem.localUrl ?
            <audio src={props.elem.localUrl} controls/> :
            <div>[语音]</div>);
        case 'file':
          return mediaWrap(props.elem.localUrl ?
            <a class="c-blue-5" href={props.elem.localUrl} target="_blank">[文件] {props.elem.name}</a> :
            <div>[文件] {props.elem.name}</div>);
        case 'location':
          return <div>[地址] {props.elem.name}<br/>{props.elem.address}</div>;
        case 'bface':
          let url = `https://gxh.vip.qq.com/club/item/parcel/item/${props.elem.file.substring(
            0,
            2,
          )}/${props.elem.file.substring(0, 32)}/300x300.png`;
          return <img src={url} alt={props.elem.text} referrerpolicy="no-referrer" width={200}/>;
        case 'rps':
          return <div>[猜拳]</div>;
        case 'dice':
          return <div>[骰子]</div>;
        case 'json':
          return <JsonElement json={props.elem.data}/>;
        case 'xml':
          return <XmlElement xml={props.elem.data}/>;
        default:
          return <></>;
      }
    };
  },
});
