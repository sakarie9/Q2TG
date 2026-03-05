import { defineComponent, PropType } from 'vue';
import styles from './DateContainer.module.sass';
import DateGroup from '../types/DateGroup';
import SenderContainer from './SenderContainer';

export default defineComponent({
  props: {
    group: { required: true, type: Object as PropType<DateGroup> },
    sticky: { type: Boolean, default: true },
  },
  setup(props) {
    return () => <div>
      <div class={props.sticky ? styles.date : styles.dateNoSticky}>
            <span>
                {props.group.date}
            </span>
      </div>
      {props.group.messages.map(e => <SenderContainer group={e} sticky={props.sticky} key={e.id}/>)}
    </div>;
  },
});
