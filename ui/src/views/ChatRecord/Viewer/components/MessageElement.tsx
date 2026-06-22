import { defineComponent, ref, type PropType } from 'vue';
import type { MessageElemExt } from '../types/MessageElemExt';
import styles from './MessageElement.module.sass';
import getImageUrlByMd5 from '../utils/getImageUrlByMd5';
import { NButton, NImage, NSpace } from 'naive-ui';
import JsonElement from './JsonElement';
import XmlElement from './XmlElement';
import linkifyStr from 'linkify-string';
import client from '@/utils/client';

export default defineComponent({
  props: {
    elem: { required: true, type: Object as PropType<MessageElemExt> },
    uuid: { required: true, type: String },
    path: { required: true, type: Object as PropType<number[]> },
  },
  setup(props) {
    const saving = ref(false);
    const error = ref('');

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
        Object.assign(props.elem, result.data);
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
          return mediaWrap(<NImage
              class="mt-4px"
              width={200}
              src={url}
              imgProps={{ referrerpolicy: 'no-referrer' }}
            />,
          );
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
          return mediaWrap(props.elem.localUrl || props.elem.url ?
            <audio src={props.elem.localUrl || props.elem.url} controls/> :
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
