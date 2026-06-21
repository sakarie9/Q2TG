import { computed, defineComponent, PropType } from 'vue';
import { dateZhCN, NConfigProvider, zhCN } from 'naive-ui';
import type { ForwardMessage } from './types/ForwardMessage';
import processHistory from './utils/processHistory';
import DateContainer from './components/DateContainer';

export default defineComponent({
  props: {
    messages: { required: true, type: Object as PropType<ForwardMessage[]> },
    uuid: { required: true, type: String },
  },
  setup(props) {
    const groupedHistory = computed(() => processHistory(props.messages));

    return () => (
      <NConfigProvider locale={zhCN} dateLocale={dateZhCN}>
        {groupedHistory.value.map(e => <DateContainer group={e} uuid={props.uuid} key={e.date}/>)}
      </NConfigProvider>
    );
  },
});
