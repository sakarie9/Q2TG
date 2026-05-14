import { defineComponent } from 'vue';
import { NButton, NSpace } from 'naive-ui';
import { useRouter } from 'vue-router';

export default defineComponent({
  setup() {
    const router = useRouter();
    return () => (
      <div class="bg-zinc-1 c-zinc-4 h-100vh flex flex-col items-center justify-center gap-8">
        <div class="text-12 font-500">Q2TG WebUI</div>
        <NSpace>
          <NButton type="primary" onClick={() => router.push('/ui/chatRecord')}>
            聊天记录
          </NButton>
          <NButton type="warning" onClick={() => router.push('/ui/testChatRecord')}>
            🧪 测试聊天记录
          </NButton>
        </NSpace>
      </div>
    );
  },
});
