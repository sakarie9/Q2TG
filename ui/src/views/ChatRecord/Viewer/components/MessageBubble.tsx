import { defineComponent, PropType } from 'vue';
import MessageElement from './MessageElement';
import styles from './Bubble.module.sass';
import { format } from 'date-fns';
import type { ForwardMessage } from '@icqqjs/icqq';

export default defineComponent({
  props: {
    message: { required: true, type: Object as PropType<ForwardMessage> },
  },
  setup(props) {
    return () => <div class={styles.container}>
      {props.message.message.map((i, k) => <MessageElement elem={i} key={k}/>)}
      <div class={styles.time}>
        {format((props.message.time) * 1000, 'HH:mm')}
      </div>
    </div>;
  },
});
