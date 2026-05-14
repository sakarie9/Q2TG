import { computed, defineComponent, ref } from 'vue';
import styles from './index.module.sass';
import Viewer from './Viewer';
import testScenarios, { type TestScenario } from './Viewer/testData';
import { NSelect, NDynamicInput, NButton, NSpace, NTag, NCard, NText } from 'naive-ui';

export default defineComponent({
  setup() {
    const selectedId = ref(testScenarios[0].id);
    const selectedScenario = computed(() => {
      return testScenarios.find(s => s.id === selectedId.value) || testScenarios[0];
    });
    const showInfo = ref(true);

    return () => (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* 顶部控制栏 */}
        <div style={{
          padding: '12px 16px',
          background: 'var(--tg-theme-bg-color, #fff)',
          borderBottom: '1px solid rgba(128,128,128,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--tg-theme-text-color, #000)' }}>
            🧪 ChatRecord 测试台
          </div>
          <div style={{ width: '280px' }}>
            <NSelect
              value={selectedId.value}
              onUpdateValue={(val) => { selectedId.value = val; }}
              options={testScenarios.map(s => ({
                label: s.name,
                value: s.id,
              }))}
              consistentMenuWidth={false}
            />
          </div>
          <NButton size="small" onClick={() => { showInfo.value = !showInfo.value; }}>
            {showInfo.value ? '隐藏信息' : '显示信息'}
          </NButton>
          <NTag type="info" size="small">
            {selectedScenario.value.messages.length} 条消息
          </NTag>
          <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--tg-theme-hint-color, #999)' }}>
            独立测试模式 · 无需后端
          </div>
        </div>

        {/* 场景描述 */}
        {showInfo.value && (
          <div style={{
            padding: '8px 16px',
            background: 'rgba(128,128,128,0.05)',
            borderBottom: '1px solid rgba(128,128,128,0.1)',
            fontSize: '13px',
            color: 'var(--tg-theme-hint-color, #666)',
            flexShrink: 0,
          }}>
            <NText depth="3">{selectedScenario.value.description}</NText>
          </div>
        )}

        {/* 消息预览区域 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Viewer messages={selectedScenario.value.messages} />
        </div>
      </div>
    );
  },
});
