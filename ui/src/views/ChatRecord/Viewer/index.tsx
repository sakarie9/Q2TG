import { computed, defineComponent, PropType, ref, provide } from 'vue';
import { ForwardMessage } from '@icqqjs/icqq';
import processHistory from './utils/processHistory';
import DateContainer from './components/DateContainer';
import ImagePreviewOverlay from './components/ImagePreviewOverlay';
import NestedForwardElement, { FORWARD_PUSH_KEY, ForwardStackOverlay } from './components/NestedForwardElement';

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