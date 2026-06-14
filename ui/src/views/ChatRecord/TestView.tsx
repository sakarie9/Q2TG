import { computed, defineComponent, ref } from 'vue';
import Viewer from './Viewer';
import testScenarios, { type TestScenario } from './Viewer/testData';

export default defineComponent({
  setup() {
    const selectedId = ref(testScenarios[0].id);
    const selectedScenario = computed(() => {
      return testScenarios.find(s => s.id === selectedId.value) || testScenarios[0];
    });
    const showInfo = ref(true);

    const selectStyle = {
      padding: '6px 12px',
      borderRadius: '6px',
      border: '1px solid rgba(128,128,128,0.3)',
      background: 'var(--tg-theme-bg-color, #fff)',
      color: 'var(--tg-theme-text-color, #000)',
      fontSize: '14px',
      minWidth: '200px',
      outline: 'none',
      WebkitAppearance: 'none',
    };

    const btnStyle = {
      padding: '6px 14px',
      borderRadius: '6px',
      border: '1px solid rgba(128,128,128,0.3)',
      background: 'var(--tg-theme-section-bg-color, #f5f5f5)',
      color: 'var(--tg-theme-text-color, #000)',
      fontSize: '13px',
      cursor: 'pointer',
      minHeight: '36px',
    };

    const tagStyle = {
      padding: '2px 10px',
      borderRadius: '10px',
      background: 'var(--tg-theme-link-color, #2A9EF1)',
      color: '#fff',
      fontSize: '12px',
      fontWeight: '500',
    };

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
          <select
            style={selectStyle}
            value={selectedId.value}
            onChange={(e) => { selectedId.value = (e.target as HTMLSelectElement).value; }}
          >
            {testScenarios.map(s => (
              <option value={s.id} key={s.id}>{s.name}</option>
            ))}
          </select>
          <button style={btnStyle} onClick={() => { showInfo.value = !showInfo.value; }}>
            {showInfo.value ? '隐藏信息' : '显示信息'}
          </button>
          <span style={tagStyle}>
            {selectedScenario.value.messages.length} 条消息
          </span>
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
            {selectedScenario.value.description}
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
