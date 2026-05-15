import { computed, defineComponent, PropType, ref, provide } from 'vue';
import { ForwardMessage } from '@icqqjs/icqq';
import processHistory from './utils/processHistory';
import DateContainer from './components/DateContainer';
import { previewImageUrl, closeImagePreview } from './utils/imagePreview';
import NestedForwardElement, { FORWARD_PUSH_KEY, ForwardStackOverlay } from './components/NestedForwardElement';

/** 全屏图片预览浮层 */
const ImagePreviewOverlay = defineComponent({
  setup() {
    return () => previewImageUrl.value ? (
      <div
        class="fixed inset-0 flex items-center justify-center"
        style={{
          zIndex: 60,
          background: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(4px)',
          WebkitTapHighlightColor: 'transparent',
        }}
        onClick={closeImagePreview}
      >
        <button
          class="absolute top-4 right-4 flex items-center justify-center border-none text-white"
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            fontSize: '22px', cursor: 'pointer', zIndex: 1,
          }}
          onClick={closeImagePreview}
        >
          ✕
        </button>
        <img
          src={previewImageUrl.value}
          class="max-w-[90vw] max-h-[90vh]"
          style={{
            objectFit: 'contain',
            borderRadius: '8px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          onClick={(e: MouseEvent) => e.stopPropagation()}
          draggable={false}
        />
      </div>
    ) : null;
  },
});

export default defineComponent({
  props: {
    messages: { required: true, type: Object as PropType<ForwardMessage[]> },
  },
  setup(props) {
    const groupedHistory = computed(() => processHistory(props.messages));

    // ── 转发栈导航 ──
    const forwardStack = ref<ForwardMessage[] | null>(null);
    provide(FORWARD_PUSH_KEY, (content: ForwardMessage[]) => {
      forwardStack.value = content;
    });

    function onStackClose() {
      forwardStack.value = null;
    }

    return () => (
      <>
        {forwardStack.value
          ? <ForwardStackOverlay messages={forwardStack.value} onClose={onStackClose} />
          : groupedHistory.value.map(e => <DateContainer group={e} key={e.date}/>)
        }
        <ImagePreviewOverlay />
      </>
    );
  },
});