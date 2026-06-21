import { defineComponent, PropType } from 'vue';
import styles from './DateContainer.module.sass';
import DateGroup from '../types/DateGroup';
import SenderContainer from './SenderContainer';

export default defineComponent({
  props: {
    group: { required: true, type: Object as PropType<DateGroup> },
    uuid: { required: true, type: String },
  },
  setup(props) {
    return () => <div>
      <div class={styles.date}>
            <span>
                {props.group.date}
            </span>
      </div>
      {props.group.messages.map(e => <SenderContainer group={e} uuid={props.uuid} key={e.id}/>)}
    </div>;
  },
});
