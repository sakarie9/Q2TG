import type { ForwardMessage } from '@icqqjs/icqq';
import type { ForwardElemExt } from '../../types/MessageElemExt';

/** 第一层嵌套转发：群聊精华消息合并转发 */
const innerNestedMessages: ForwardMessage[] = [
  {
    user_id: 11111111,
    uid: 'u_11111111',
    nickname: '群友A',
    time: 1746820000,
    seq: 3001,
    raw_message: '有人知道这个怎么用吗？[图片]',
    message: [
      { type: 'text', text: '有人知道这个怎么用吗？' },
      {
        type: 'image',
        file: 'nested_img_11111111111111111111111111',
        url: 'https://picsum.photos/seed/nested1/300/300',
      },
    ],
  },
  {
    user_id: 22222222,
    uid: 'u_22222222',
    nickname: '群友B',
    time: 1746820010,
    seq: 3002,
    raw_message: '这个简单，我来教你',
    message: [
      { type: 'text', text: '这个简单，我来教你' },
    ],
  },
  {
    user_id: 22222222,
    uid: 'u_22222222',
    nickname: '群友B',
    time: 1746820020,
    seq: 3003,
    raw_message: '首先你需要打开设置，然后找到这个选项',
    message: [
      { type: 'text', text: '首先你需要打开设置，然后找到这个选项' },
    ],
  },
  {
    user_id: 33333333,
    uid: 'u_33333333',
    nickname: '群友C',
    time: 1746820100,
    seq: 3004,
    raw_message: '哈哈我也刚想问这个',
    message: [
      { type: 'text', text: '哈哈我也刚想问这个' },
      { type: 'face', text: '/呲牙', id: 13 },
    ],
  },
];

/** 创建嵌套转发元素 */
function makeForwardElem(id: string, content: ForwardMessage[]): ForwardElemExt {
  return {
    type: 'forward',
    id,
    content,
  };
}

/** 嵌套合并转发测试：包含多层嵌套转发消息 */
const nestedForwardMessages: ForwardMessage[] = [
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746830000,
    seq: 4001,
    raw_message: '给大家看个有趣的群聊记录',
    message: [
      { type: 'text', text: '给大家看个有趣的群聊记录' },
    ],
  },
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746830010,
    seq: 4002,
    raw_message: '[合并转发]',
    message: [
      makeForwardElem('forward_inner_1', [
        {
          user_id: 44444444,
          uid: 'u_44444444',
          nickname: '技术群群友X',
          time: 1746825000,
          seq: 5001,
          raw_message: '这段代码报错，有大佬看看吗？',
          message: [
            { type: 'text', text: '这段代码报错，有大佬看看吗？' },
          ],
        },
        {
          user_id: 55555555,
          uid: 'u_55555555',
          nickname: '技术大佬',
          time: 1746825010,
          seq: 5002,
          raw_message: '你这里少了个分号，第42行',
          message: [
            { type: 'text', text: '你这里少了个分号，第42行' },
          ],
        },
        {
          user_id: 44444444,
          uid: 'u_44444444',
          nickname: '技术群群友X',
          time: 1746825020,
          seq: 5003,
          raw_message: '还真是！谢谢大佬',
          message: [
            { type: 'text', text: '还真是！谢谢大佬' },
            { type: 'face', text: '/抱拳', id: 32 },
          ],
        },
      ]),
    ],
  },
  {
    user_id: 87654321,
    uid: 'u_87654321',
    nickname: '小红',
    time: 1746830020,
    seq: 4003,
    raw_message: '哈哈这个有意思',
    message: [
      { type: 'text', text: '哈哈这个有意思' },
    ],
  },
  {
    user_id: 87654321,
    uid: 'u_87654321',
    nickname: '小红',
    time: 1746830030,
    seq: 4004,
    raw_message: '我也分享一个[合并转发]',
    message: [
      { type: 'text', text: '我也分享一个' },
      makeForwardElem('forward_inner_2', innerNestedMessages),
    ],
  },
  {
    user_id: 55556666,
    uid: 'u_55556666',
    nickname: '大毛',
    time: 1746830100,
    seq: 4005,
    raw_message: '你们这都是哪来的聊天记录😂',
    message: [
      { type: 'text', text: '你们这都是哪来的聊天记录' },
      { type: 'sface', text: '😂', id: 15 },
    ],
  },
  {
    user_id: 12345678,
    uid: 'u_12345678',
    nickname: '小明',
    time: 1746830200,
    seq: 4006,
    raw_message: '再来一个双层嵌套的[合并转发]',
    message: [
      { type: 'text', text: '再来一个双层嵌套的' },
      makeForwardElem('forward_deep_nested', [
        {
          user_id: 66666666,
          uid: 'u_66666666',
          nickname: '层主1',
          time: 1746828000,
          seq: 6001,
          raw_message: '今天看到一个超好笑的帖子',
          message: [
            { type: 'text', text: '今天看到一个超好笑的帖子' },
          ],
        },
        {
          user_id: 77777777,
          uid: 'u_77777777',
          nickname: '层主2',
          time: 1746828010,
          seq: 6002,
          raw_message: '是什么？发出来看看',
          message: [
            { type: 'text', text: '是什么？发出来看看' },
          ],
        },
        {
          user_id: 66666666,
          uid: 'u_66666666',
          nickname: '层主1',
          time: 1746828020,
          seq: 6003,
          raw_message: '看这个转发[合并转发]',
          message: [
            { type: 'text', text: '看这个转发' },
            makeForwardElem('forward_leaf', [
              {
                user_id: 88888888,
                uid: 'u_88888888',
                nickname: '原始发文人',
                time: 1746827000,
                seq: 7001,
                raw_message: '笑死我了哈哈哈[图片]',
                message: [
                  { type: 'text', text: '笑死我了哈哈哈' },
                  {
                    type: 'image',
                    url: 'https://picsum.photos/seed/deepnested/400/300',
                  },
                ],
              },
              {
                user_id: 99999999,
                uid: 'u_99999999',
                nickname: '路人甲',
                time: 1746827010,
                seq: 7002,
                raw_message: '确实好笑😂😂😂',
                message: [
                  { type: 'text', text: '确实好笑' },
                  { type: 'sface', text: '😂', id: 15 },
                  { type: 'sface', text: '😂', id: 15 },
                  { type: 'sface', text: '😂', id: 15 },
                ],
              },
            ]),
          ],
        },
      ]),
    ],
  },
  {
    user_id: 55556666,
    uid: 'u_55556666',
    nickname: '大毛',
    time: 1746830300,
    seq: 4007,
    raw_message: '好家伙，套娃是吧',
    message: [
      { type: 'text', text: '好家伙，套娃是吧' },
    ],
  },
];

export default nestedForwardMessages;
