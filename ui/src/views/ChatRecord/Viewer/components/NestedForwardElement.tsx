import { computed, defineComponent, PropType, ref, inject, type InjectionKey } from 'vue';
import type { ForwardMessage } from '@icqqjs/icqq';
import type { ForwardElemExt, MessageElemExt } from '../types/MessageElemExt';
import { format } from 'date-fns';
import MessageElement from './MessageElement';
import processHistory from '../utils/processHistory';
import noAvatar from '../assets/no-avatar.webp';
import cyrb53 from '../utils/cyrb53';

// ── 常量 ──
const NAME_COLORS = ['#FF516A', '#FFA85C', '#D669ED', '#54CB68', '#28C9B7', '#2A9EF1', '#FF719A'];

function fmtTime(ts: number) {
  return format(new Date(ts * 1000), 'HH:mm');
}

function nameColor(id: number | string) {
  const n = typeof id === 'string' ? cyrb53(id) : id;
  return NAME_COLORS[Math.abs(n) % NAME_COLORS.length];
}

// ── 注入 key ──
export type ForwardPush = (content: ForwardMessage[]) => void;
export const FORWARD_PUSH_KEY: InjectionKey<ForwardPush> = Symbol('forwardPush');

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

// ── 内联预览卡片（主组件导出） ──
export default defineComponent({
  props: {
    content: { required: true, type: Array as PropType<ForwardMessage[]> },
  },
  setup(props) {
    const pushForward = inject(FORWARD_PUSH_KEY);
    const senders = computed(() => senderPreview(props.content));

    return () => (
      <button
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left select-none cursor-pointer my-1"
        style={{
          minHeight: '44px',
          border: '1px solid rgba(128,128,128,0.2)',
          background: 'rgba(128,128,128,0.04)',
          color: 'var(--tg-theme-text-color)',
          WebkitTapHighlightColor: 'transparent',
        }}
        onClick={() => pushForward?.(props.content)}
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
            {senders.value.join('、')}{senders.value.length < props.content.length ? ` 等 ${props.content.length} 位参与` : ''}
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
    );
  },
});

// ═══════════════════════════════════════
//  全屏栈导航覆盖层（ForwardStackOverlay）
// ═══════════════════════════════════════

/** 栈内消息行 — 转发元素渲染为可点击按钮 */
const StackMessageRow = defineComponent({
  props: {
    message: { required: true, type: Object as PropType<ForwardMessage> },
    onForwardClick: { type: Function as PropType<(c: ForwardMessage[]) => void> },
  },
  setup(props) {
    const avatarError = ref(false);
    const forwardElems = computed(() =>
      props.message.message.filter(e => (e as ForwardElemExt).type === 'forward')
    );
    const nonForwardElems = computed(() =>
      props.message.message.filter(e => (e as ForwardElemExt).type !== 'forward')
    );

    return () => {
      const m = props.message;
      return (
        <div style={{
          display: 'flex',
          gap: '10px',
          padding: '10px 14px',
          borderBottom: '1px solid rgba(128,128,128,0.07)',
        }}>
          <img
            src={avatarError.value ? noAvatar : (m.avatar || noAvatar)}
            style={{
              width: '36px', height: '36px', borderRadius: '50%',
              flexShrink: 0, marginTop: '2px',
            }}
            alt="" referrerpolicy="no-referrer" loading="lazy"
            onError={() => { avatarError.value = true; }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px',
            }}>
              <span style={{
                color: nameColor(m.user_id), fontSize: '14px', fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: '160px',
              }}>
                {m.nickname}
              </span>
              <span style={{
                fontSize: '11px', color: 'var(--tg-theme-subtitle-text-color, #999)',
                opacity: 0.6, flexShrink: 0,
              }}>
                {fmtTime(m.time)}
              </span>
            </div>
            {nonForwardElems.value.length > 0 && (
              <div style={{ fontSize: '14px', lineHeight: 1.45 }}>
                {nonForwardElems.value.map((elem, i) => (
                  <MessageElement elem={elem as MessageElemExt} key={i} />
                ))}
              </div>
            )}
            {forwardElems.value.map((elem, i) => {
              const fwd = (elem as ForwardElemExt).content as ForwardMessage[] | undefined;
              if (!fwd?.length) return null;
              return (
                <button
                  class="w-full flex items-center gap-2 mt-1.5 px-3 py-2 rounded-lg text-left text-sm select-none cursor-pointer"
                  style={{
                    border: '1px solid rgba(128,128,128,0.18)',
                    background: 'rgba(128,128,128,0.05)',
                    color: 'var(--tg-theme-link-color, #2A9EF1)',
                    minHeight: '40px',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                  onClick={() => props.onForwardClick?.(fwd)}
                >
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>📨</span>
                  <span style={{ flex: 1 }}>查看 {fwd.length} 条转发消息</span>
                  <span style={{ fontSize: '14px', opacity: 0.6 }}>›</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    };
  },
});

/** 按日期分组 */
const StackDateGroup = defineComponent({
  props: {
    messages: { required: true, type: Array as PropType<ForwardMessage[]> },
    date: { type: String, default: '' },
    onForwardClick: { type: Function as PropType<(c: ForwardMessage[]) => void> },
  },
  setup(props) {
    return () => (
      <div>
        {props.date && (
          <div style={{ margin: '10px auto 6px', width: 'max-content' }}>
            <span style={{
              display: 'block', padding: '2px 10px',
              background: 'rgba(128,128,128,0.15)',
              borderRadius: '10px',
              color: 'var(--tg-theme-subtitle-text-color, #666)',
              fontSize: '12px',
            }}>
              {props.date}
            </span>
          </div>
        )}
        {props.messages.map((msg, i) => (
          <StackMessageRow message={msg} onForwardClick={props.onForwardClick} key={i} />
        ))}
      </div>
    );
  },
});

// ── 全屏栈导航 ──
export const ForwardStackOverlay = defineComponent({
  props: {
    messages: { required: true, type: Array as PropType<ForwardMessage[]> },
    onClose: { type: Function as PropType<() => void> },
  },
  setup(props, { emit }) {
    const stack = ref<ForwardMessage[][]>([props.messages]);
    const currentMessages = computed(() => stack.value[stack.value.length - 1]);
    const grouped = computed(() => {
      const raw = processHistory(currentMessages.value);
      return raw.map(dg => ({
        date: dg.date,
        messages: dg.messages.flatMap(sg => sg.messages),
      }));
    });

    function pushForward(content: ForwardMessage[]) {
      stack.value = [...stack.value, content];
    }

    function popBack() {
      if (stack.value.length <= 1) { emit('close'); return; }
      stack.value = stack.value.slice(0, -1);
    }

    function popToTop() {
      stack.value = [stack.value[0]];
    }

    return () => (
      <div
        class="fixed inset-0 z-50 flex flex-col"
        style={{
          background: 'var(--tg-theme-bg-color, #fff)',
          color: 'var(--tg-theme-text-color)',
          WebkitTapHighlightColor: 'transparent',
          animation: 'q2tg-stack-in 0.25s ease',
        }}
      >
        {/* 导航栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '8px 12px',
          paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
          borderBottom: '1px solid rgba(128,128,128,0.12)',
          flexShrink: 0, minHeight: '52px',
        }}>
          <button
            class="flex items-center justify-center border-none cursor-pointer"
            style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'rgba(128,128,128,0.08)',
              color: 'var(--tg-theme-text-color)',
              fontSize: '20px', flexShrink: 0,
            }}
            onClick={popBack}
          >
            ←
          </button>

          <div style={{ flex: 1, textAlign: 'center', minWidth: 0, padding: '0 4px' }}>
            <div style={{
              fontSize: '15px', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              📨 合并转发 · {currentMessages.value.length} 条
            </div>
            {stack.value.length > 1 && (
              <div style={{
                fontSize: '11px', color: 'var(--tg-theme-subtitle-text-color, #999)',
                marginTop: '1px',
              }}>
                第 {stack.value.length} 层
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {stack.value.length > 1 && (
              <button
                class="flex items-center justify-center border-none cursor-pointer"
                style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: 'rgba(128,128,128,0.08)',
                  color: 'var(--tg-theme-link-color, #2A9EF1)',
                  fontSize: '18px', fontWeight: 600, flexShrink: 0,
                }}
                onClick={popToTop}
                title="回到顶层"
              >
                ⇈
              </button>
            )}
            <button
              class="flex items-center justify-center border-none cursor-pointer"
              style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: 'rgba(128,128,128,0.08)',
                color: 'var(--tg-theme-text-color)',
                fontSize: '18px', flexShrink: 0,
              }}
              onClick={() => emit('close')}
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div style={{
          flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {grouped.value.map((g, i) => (
            <StackDateGroup
              messages={g.messages}
              date={g.date}
              onForwardClick={pushForward}
              key={i}
            />
          ))}
        </div>

        <style>{`
          @keyframes q2tg-stack-in {
            from { transform: translateX(30px); opacity: 0; }
            to   { transform: translateX(0); opacity: 1; }
          }
        `}</style>
      </div>
    );
  },
});