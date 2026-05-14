import { defineComponent } from 'vue';
import { useRouter } from 'vue-router';

const btnBase = {
  padding: '10px 24px',
  borderRadius: '8px',
  border: 'none',
  fontSize: '15px',
  fontWeight: '500',
  cursor: 'pointer',
  minHeight: '44px',
};

export default defineComponent({
  setup() {
    const router = useRouter();
    return () => (
      <div class="bg-zinc-1 c-zinc-4 h-100vh flex flex-col items-center justify-center gap-8">
        <div class="text-12 font-500">Q2TG WebUI</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            style={{ ...btnBase, background: '#2A9EF1', color: '#fff' }}
            onClick={() => router.push('/ui/chatRecord')}
          >
            聊天记录
          </button>
          <button
            style={{ ...btnBase, background: '#F0A020', color: '#fff' }}
            onClick={() => router.push('/ui/testChatRecord')}
          >
            🧪 测试聊天记录
          </button>
        </div>
      </div>
    );
  },
});
