import { computed, defineComponent, PropType, ref, watch, onUnmounted } from 'vue';
import type { ForwardMessage } from '@icqqjs/icqq';
import type { ForwardElemExt, MessageElemExt } from '../types/MessageElemExt';
import { format } from 'date-fns';
import MessageElement from './MessageElement';
import cyrb53 from '../utils/cyrb53';
import noAvatar from '../assets/no-avatar.webp';

// ── 常量 ──
const DEPTH_COLORS = ['transparent', '#2A9EF1', '#D669ED', '#FFA85C', '#FF516A', '#54CB68'];
const NAME_COLORS = ['#FF516A', '#FFA85C', '#D669ED', '#54CB68', '#28C9B7', '#2A9EF1', '#FF719A'];

// ── 类型 ──
type FlatItem = {
  message: ForwardMessage;
  depth: number;
}

// ── 递归展平嵌套转发消息 ──
function flattenMessages(messages: ForwardMessage[], depth = 0): FlatItem[] {
  const result: FlatItem[] = [];
  for (const msg of messages) {
    result.push({ message: msg, depth });
    for (const elem of msg.message) {
      const e = elem as ForwardElemExt;
      if (e.type === 'forward' && Array.isArray(e.content) && e.content.length > 0) {
        result.push(...flattenMessages(e.content as ForwardMessage[], depth + 1));
      }
    }
  }
  return result;
}

function fmtTime(ts: number) {
  return format(new Date(ts * 1000), 'HH:mm');
}

function nameColor(id: number | string) {
  const n = typeof id === 'string' ? cyrb53(id) : id;
  return NAME_COLORS[Math.abs(n) % NAME_COLORS.length];
}

/** 提取不重复的发送者名列表（用于预览） */
function senderPreview(messages: ForwardMessage[], max = 3): string[] {
  const seen = new Set<number | string>();
  const names: string[] = [];
  for (const m of messages) {
    if (!seen.has(m.user_id)) {
      seen.add(m.user_id);
      names.push(m.nickname);
      if (names.length >= max) break;
    }
  }
  return names;
}

// ── 单条扁平消息行 ──
const FlatMessageRow = defineComponent({
  props: {
    message: { required: true, type: Object as PropType<ForwardMessage> },
    depth: { type: Number, default: 0 },
  },
  setup(props) {
    const avatarError = ref(false);

    return () => {
      const m = props.message;
      const d = props.depth;
      const borderC = DEPTH_COLORS[Math.min(d, DEPTH_COLORS.length - 1)];
      const hasNested = m.message.some(e => (e as ForwardElemExt).type === 'forward');

      return (
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '8px 12px',
          paddingLeft: `${12 + d * 20}px`,
          borderLeft: d > 0 ? `3px solid ${borderC}` : 'none',
          borderBottom: '1px solid rgba(128,128,128,0.06)',
        }}>
          {d === 0 && (
            <img
              src={avatarError.value ? noAvatar : (m.avatar || noAvatar)}
              style={{
                width: '24px', height: '24px', borderRadius: '50%',
                marginTop: '2px', flexShrink: 0,
              }}
              alt=""
              referrerpolicy="no-referrer"
              loading="lazy"
              onError={() => { avatarError.value = true; }}
            />
          )}
          {d > 0 && <div style={{ width: '24px', flexShrink: 0 }} />}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
              marginBottom: '3px',
            }}>
              <span style={{
                color: nameColor(m.user_id),
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '140px',
              }}>
                {m.nickname}
              </span>
              <span style={{
                fontSize: '10px',
                color: 'var(--tg-theme-subtitle-text-color, #999)',
                opacity: 0.6,
                flexShrink: 0,
              }}>
                {fmtTime(m.time)}
              </span>
            </div>

            <div style={{ fontSize: '14px', lineHeight: 1.45 }}>
              {m.message
                .filter(e => (e as ForwardElemExt).type !== 'forward')
                .length > 0
                ? m.message
                    .filter(e => (e as ForwardElemExt).type !== 'forward')
                    .map((elem, i) => <MessageElement elem={elem as MessageElemExt} key={i} />)
                : hasNested && (
                    <span style={{ fontSize: '12px', opacity: 0.6, color: 'var(--tg-theme-link-color, #2A9EF1)' }}>
                      📎 包含嵌套转发消息
                    </span>
                  )
              }
            </div>
          </div>
        </div>
      );
    };
  },
});

// ── 弹窗组件 ──
const ForwardModal = defineComponent({
  props: {
    content: { required: true, type: Array as PropType<ForwardMessage[]> },
    show: { type: Boolean, default: false },
  },
  emits: ['close'],
  setup(props, { emit }) {
    const flatItems = computed(() => flattenMessages(props.content));
    const bodyScroll = ref('');

    // 阻止背景滚动
    watch(() => props.show, (v) => {
      if (v) {
        bodyScroll.value = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = bodyScroll.value;
      }
    });

    onUnmounted(() => {
      document.body.style.overflow = bodyScroll.value;
    });

    function close() {
      emit('close');
    }

    function onBackdropClick(e: MouseEvent) {
      if (e.target === e.currentTarget) close();
    }

    return () => props.show ? (
      <div
        class="fixed inset-0 z-50 flex flex-col"
        style={{
          background: 'rgba(0,0,0,0.55)',
          WebkitTapHighlightColor: 'transparent',
        }}
        onClick={onBackdropClick}
      >
        {/* 弹窗卡片 */}
        <div
          class="flex flex-col w-full max-w-lg mx-auto mt-auto sm:mt-12"
          style={{
            maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
            background: 'var(--tg-theme-bg-color, #fff)',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            overflow: 'hidden',
            animation: 'q2tg-forward-modal-in 0.3s ease',
          }}
        >
          {/* 标题栏 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(128,128,128,0.15)',
            flexShrink: 0,
            minHeight: '52px',
          }}>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--tg-theme-text-color)',
            }}>
              📨 合并转发 · {props.content.length} 条
            </span>
            <button
              class="flex items-center justify-center border-none cursor-pointer"
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'rgba(128,128,128,0.1)',
                color: 'var(--tg-theme-text-color)',
                fontSize: '18px',
                flexShrink: 0,
              }}
              onClick={close}
            >
              ✕
            </button>
          </div>

          {/* 消息列表 */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}>
            {flatItems.value.map((item, idx) => (
              <FlatMessageRow message={item.message} depth={item.depth} key={idx} />
            ))}
          </div>
        </div>

        {/* 入场动画 keyframes */}
        <style>{`
          @keyframes q2tg-forward-modal-in {
            from { transform: translateY(60px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>
      </div>
    ) : null;
  },
});

// ── 主组件 ──
export default defineComponent({
  props: {
    content: { required: true, type: Array as PropType<ForwardMessage[]> },
  },
  setup(props) {
    const open = ref(false);
    const senders = computed(() => senderPreview(props.content));

    return () => (
      <>
        {/* 内联预览卡片 — 点击弹窗 */}
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left select-none cursor-pointer my-1"
          style={{
            minHeight: '44px',
            border: '1px solid rgba(128,128,128,0.2)',
            background: 'rgba(128,128,128,0.04)',
            color: 'var(--tg-theme-text-color)',
            WebkitTapHighlightColor: 'transparent',
          }}
          onClick={() => { open.value = true; }}
        >
          <span style={{ fontSize: '20px', flexShrink: 0 }}>📨</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              合并转发 · {props.content.length} 条消息
            </div>
            <div style={{
              fontSize: '12px',
              color: 'var(--tg-theme-subtitle-text-color, #999)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '2px',
            }}>
              {senders.value.join('、')} 等 {senders.value.length < props.content.length ? `${props.content.length} 位参与` : ''}
            </div>
          </div>
          <span style={{
            fontSize: '16px',
            color: 'var(--tg-theme-subtitle-text-color, #999)',
            flexShrink: 0,
          }}>
            ›
          </span>
        </button>

        {/* 弹窗 */}
        <ForwardModal content={props.content} show={open.value} onClose={() => { open.value = false; }} />
      </>
    );
  },
});
