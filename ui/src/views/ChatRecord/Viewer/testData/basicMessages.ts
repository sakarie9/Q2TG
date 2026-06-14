import type { ForwardMessage } from '@icqqjs/icqq';

/** 基础文本消息测试：多人对话，包含文字、表情、@等 */
const basicMessages: ForwardMessage[] = [
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746800000,
    seq: 1001,
    raw_message: '大家好！今天天气真不错',
    message: [
      { type: 'text', text: '大家好！今天天气真不错' },
    ],
  },
  {
    user_id: 87654321,
    uid: 'u_87654321',
    nickname: '小红',
    time: 1746800010,
    seq: 1002,
    raw_message: '是啊，适合出去玩',
    message: [
      { type: 'text', text: '是啊，适合出去玩' },
    ],
  },
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746800020,
    seq: 1003,
    raw_message: '@小红 一起去公园吗？',
    message: [
      { type: 'at', text: '@小红', qq: '87654321' },
      { type: 'text', text: ' 一起去公园吗？' },
    ],
  },
  {
    user_id: 87654321,
    uid: 'u_87654321',
    nickname: '小红',
    time: 1746800030,
    seq: 1004,
    raw_message: '好呀好呀😊',
    message: [
      { type: 'text', text: '好呀好呀' },
      { type: 'sface', text: '😊', id: 14 },
    ],
  },
  {
    user_id: 55556666,
    uid: 'u_55556666',
    nickname: '大毛',
    time: 1746800100,
    seq: 1005,
    raw_message: '带我一个！',
    message: [
      { type: 'text', text: '带我一个！' },
      { type: 'face', text: '/得意', id: 9 },
    ],
  },
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746800200,
    seq: 1006,
    raw_message: 'ok 下午三点见',
    message: [
      { type: 'text', text: 'ok 下午三点见' },
    ],
  },
  {
    user_id: 87654321,
    uid: 'u_87654321',
    nickname: '小红',
    time: 1746800300,
    seq: 1007,
    raw_message: '收到',
    message: [
      { type: 'text', text: '收到' },
    ],
  },
  {
    user_id: 77778888,
    uid: 'u_77778888',
    nickname: '群机器人小助手',
    time: 1746800400,
    seq: 1008,
    raw_message: '天气预报：明天晴，20-25℃',
    message: [
      { type: 'text', text: '天气预报：明天晴，20-25℃' },
    ],
  },
  {
    user_id: 1094950020,
    uid: 'u_1094950020',
    nickname: '某人',
    time: 1746800500,
    seq: 1009,
    raw_message: '刚刚那条消息我撤回了',
    message: [
      { type: 'text', text: '刚刚那条消息我撤回了' },
    ],
    avatar: 'https://p.qlogo.cn/gh/1094950020/1094950020/140',
  },
];

export default basicMessages;
