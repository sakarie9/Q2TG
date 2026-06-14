import type { ForwardMessage } from '@icqqjs/icqq';
import basicMessages from './basicMessages';
import mixedMediaMessages from './mixedMedia';
import nestedForwardMessages from './nestedForward';

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  messages: ForwardMessage[];
}

const testScenarios: TestScenario[] = [
  {
    id: 'basic',
    name: '基础文本消息',
    description: '多人对话，包含文字、表情、@提及等基础消息类型',
    messages: basicMessages,
  },
  {
    id: 'mixed-media',
    name: '图文混合消息',
    description: '包含图片、闪照、文件、位置等多种媒体类型',
    messages: mixedMediaMessages,
  },
  {
    id: 'nested-forward',
    name: '嵌套合并转发',
    description: '包含多层嵌套合并转发消息，测试展开/收起功能',
    messages: nestedForwardMessages,
  },
];

export default testScenarios;
