import { computed, defineComponent, PropType, ref } from 'vue';
import SenderGroup from '../types/SenderGroup';
import styles from './SenderContainer.module.sass';
import bubbleStyles from './Bubble.module.sass';
import MessageBubble from './MessageBubble';
import cyrb53 from '../utils/cyrb53';
import noAvatar from '../assets/no-avatar.webp';

const NAME_COLORS = ['#FF516A', '#FFA85C', '#D669ED', '#54CB68', '#28C9B7', '#2A9EF1', '#FF719A'];

export default defineComponent({
  props: {
    group: { required: true, type: Object as PropType<SenderGroup> },
    sticky: { type: Boolean, default: true },
  },
  setup(props) {
    const avatarError = ref(false);

    const nameColor = computed(() => {
      const id = typeof props.group.senderId === 'string'
        ? cyrb53(props.group.senderId)
        : props.group.senderId;
      return NAME_COLORS[(id as number) % NAME_COLORS.length];
    });

    return () => <div class={styles.container}>
      <div class={styles.avatarContainer}>
        <img
          class={styles.avatar}
          style={{ width: '36px', height: '36px', borderRadius: '50%' }}
          src={avatarError.value ? noAvatar : (props.group.avatar || noAvatar)}
          alt=""
          referrerpolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => { avatarError.value = true; }}
        />
      </div>
      <div class={styles.mainContainer}>
        {/* 发送者名称（内联自 SenderNameBubble） */}
        <div
          style={{ color: nameColor.value }}
          class={`${bubbleStyles.container} ${bubbleStyles.senderName} ${props.sticky ? '' : bubbleStyles.senderNameNoSticky}`}
        >
          {props.group.username}
        </div>
        {props.group.messages.map((e, index) =>
          <MessageBubble message={e} key={index}/>)}
      </div>
    </div>;
  },
});
