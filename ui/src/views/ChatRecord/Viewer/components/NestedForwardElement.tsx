import { computed, defineComponent, PropType, ref } from 'vue';
import { ForwardMessage } from '@icqqjs/icqq';
import processHistory from '../utils/processHistory';
import DateContainer from './DateContainer';

export default defineComponent({
  props: {
    content: { required: true, type: Array as PropType<ForwardMessage[]> },
  },
  setup(props) {
    const expanded = ref(false);
    const groupedHistory = computed(() => processHistory(props.content));

    return () => (
      <div style={{
        border: '1px solid rgba(128,128,128,0.3)',
        borderRadius: '8px',
        margin: '4px 0',
        overflow: 'hidden',
      }}>
        <div
          style={{
            padding: '6px 10px',
            background: 'rgba(128,128,128,0.08)',
            cursor: 'pointer',
            fontSize: 'small',
            userSelect: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          onClick={() => expanded.value = !expanded.value}
        >
          <span>[嵌套合并转发消息 · {props.content.length} 条]</span>
          <span style={{ fontSize: '10px', opacity: 0.7 }}>{expanded.value ? '▲ 收起' : '▼ 展开'}</span>
        </div>
        {expanded.value && (
          <div style={{
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '4px',
            borderTop: '1px solid rgba(128,128,128,0.2)',
          }}>
            {groupedHistory.value.map(e => <DateContainer group={e} sticky={false} key={e.date}/>)}
          </div>
        )}
      </div>
    );
  },
});
