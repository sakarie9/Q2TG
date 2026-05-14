import { defineComponent, type PropType, ref } from 'vue';
import type { ForwardElemExt, MessageElemExt } from '../types/MessageElemExt';
import styles from './MessageElement.module.sass';
import getImageUrlByMd5 from '../utils/getImageUrlByMd5';
import { openImagePreview } from '../utils/imagePreview';
import JsonElement from './JsonElement';
import XmlElement from './XmlElement';
import NestedForwardElement from './NestedForwardElement';
import linkifyStr from 'linkify-string';

export default defineComponent({
  props: {
    elem: { required: true, type: Object as PropType<MessageElemExt> },
  },
  setup(props) {
    const imageError = ref(false);

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
          let url = props.elem.url;
          let md5;
          if (!url && typeof props.elem.file === 'string') {
            md5 = props.elem.file.substring(0, 32);
            if (!/([a-f\d]{32}|[A-F\d]{32})/.test(md5))
              md5 = undefined;
            if (md5) {
              url = getImageUrlByMd5(md5);
            }
          }
          return imageError.value
            ? <div class="mt-1 p-2 text-xs rounded bg-gray-400/10"
                   style={{ color: 'var(--tg-theme-subtitle-text-color)' }}>
                🖼 图片加载失败
              </div>
            : <img
                class="mt-1 rounded max-w-50"
                style={{
                  maxHeight: '300px',
                  objectFit: 'cover',
                  cursor: 'pointer',
                }}
                src={url}
                alt=""
                referrerpolicy="no-referrer"
                loading="lazy"
                decoding="async"
                onClick={() => url && openImagePreview(url)}
                onError={() => { imageError.value = true; }}
              />;
        }
        case 'video-loop':
          return <video src={props.elem.url} autoplay muted loop width={200}/>;
        case 'tgs':
          return <tgs-player autoplay={true} loop={true} mode="normal" src={props.elem.url}
                             style={{ width: 200, height: 200 }}/>;
        case 'video':
          return <div>[视频]</div>;
        case 'record':
          return <div>[语音]</div>;
        case 'file':
          return <div>[文件] {props.elem.name}</div>;
        case 'location':
          return <div>[地址] {props.elem.name}<br/>{props.elem.address}</div>;
        case 'bface': {
          const bfaceUrl = `https://gxh.vip.qq.com/club/item/parcel/item/${props.elem.file.substring(
            0,
            2,
          )}/${props.elem.file.substring(0, 32)}/300x300.png`;
          return <img
            src={bfaceUrl}
            alt={props.elem.text}
            referrerpolicy="no-referrer"
            width={200}
            style={{ cursor: 'pointer' }}
            onClick={() => openImagePreview(bfaceUrl)}
          />;
        }
        case 'rps':
          return <div>[猜拳]</div>;
        case 'dice':
          return <div>[骰子]</div>;
        case 'json':
          return <JsonElement json={props.elem.data}/>;
        case 'xml':
          return <XmlElement xml={props.elem.data}/>;
        case 'forward': {
          const content = (props.elem as ForwardElemExt).content;
          if (Array.isArray(content) && content.length > 0) {
            return <NestedForwardElement content={content}/>;
          }
          return <div>[嵌套合并转发消息]</div>;
        }
        default:
          return <></>;
      }
    };
  },
});
