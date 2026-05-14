import type { ForwardMessage } from '@icqqjs/icqq';

/** 图文混合消息测试：包含图片、视频、文件等多种媒体类型 */
const mixedMediaMessages: ForwardMessage[] = [
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746810000,
    seq: 2001,
    raw_message: '发张图给大家看看',
    message: [
      { type: 'text', text: '发张图给大家看看' },
    ],
  },
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746810010,
    seq: 2002,
    raw_message: '[图片]',
    message: [
      {
        type: 'image',
        file: 'deadbeef1234567890abcdef1234567890',
        url: 'https://picsum.photos/seed/q2tg1/400/300',
      },
    ],
  },
  {
    user_id: 87654321,
    uid: 'u_87654321',
    nickname: '小红',
    time: 1746810020,
    seq: 2003,
    raw_message: '好漂亮！我也发一张',
    message: [
      { type: 'text', text: '好漂亮！我也发一张' },
    ],
  },
  {
    user_id: 87654321,
    uid: 'u_87654321',
    nickname: '小红',
    time: 1746810030,
    seq: 2004,
    raw_message: '[图片]',
    message: [
      {
        type: 'image',
        file: '223344556677889900aabbccddeeff00',
        url: 'https://picsum.photos/seed/q2tg2/400/300',
      },
    ],
  },
  {
    user_id: 87654321,
    uid: 'u_87654321',
    nickname: '小红',
    time: 1746810035,
    seq: 2005,
    raw_message: '[图片]',
    message: [
      {
        type: 'image',
        file: 'ffeeddccbbaa00998877665544332211',
        url: 'https://picsum.photos/seed/q2tg3/400/300',
      },
    ],
  },
  {
    user_id: 55556666,
    uid: 'u_55556666',
    nickname: '大毛',
    time: 1746810100,
    seq: 2006,
    raw_message: '[图片]',
    message: [
      {
        type: 'image',
        file: 'aabbccdd11223344556677889900aabb',
      },
    ],
  },
  {
    user_id: 55556666,
    uid: 'u_55556666',
    nickname: '大毛',
    time: 1746810110,
    seq: 2007,
    raw_message: '[闪照]',
    message: [
      {
        type: 'flash',
        file: 'flash1234567890abcdef1234567890ab',
        url: 'https://picsum.photos/seed/q2tg4/400/300',
      },
    ],
  },
  {
    user_id: 77778888,
    uid: 'u_77778888',
    nickname: '群机器人小助手',
    time: 1746810200,
    seq: 2008,
    raw_message: '[文件] 项目计划书.pdf',
    message: [
      { type: 'file', name: '项目计划书.pdf', size: 2048576 },
    ],
  },
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746810300,
    seq: 2009,
    raw_message: '[位置] 市中心公园',
    message: [
      {
        type: 'location',
        name: '市中心公园',
        address: '市中心区湖滨路88号',
        lat: 31.2304,
        lng: 121.4737,
      },
    ],
  },
];

export default mixedMediaMessages;
