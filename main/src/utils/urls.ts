import axios from 'axios';
import { Friend, Group } from '../client/QQClient';
import * as https from 'node:https';

/**
 * 生成 QQ 用户头像 URL
 * @param uin QQ 号
 * @param size 头像尺寸，默认 0
 */
export function getQQUserAvatarUrl(uin: number | string, size = 0): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=${size}`;
}

/**
 * 获取经过验证的 QQ 用户头像 URL。
 * 仅当使用默认 size（s=0）时，通过 HEAD 请求检查 Last-Modified 头；
 * 若异常（年份 ≤ 1990）则 fallback 到 s=100。
 * 若调用者传入了非默认的 size，则不做检查直接返回。
 */
export async function getValidQQUserAvatarUrl(uin: number | string, size = 0): Promise<string> {
  // 传入了非默认 size，直接保留不做检查
  if (size !== 0) {
    return getQQUserAvatarUrl(uin, size);
  }

  const url = getQQUserAvatarUrl(uin, 0);

  try {
    const res = await axios.head(url, { httpsAgent });
    const lastModified = res.headers['last-modified'];

    if (lastModified) {
      const d = new Date(lastModified);
      // Last-Modified: Mon, 01 Jan 1990 00:00:00 GMT 表示头像不存在
      if (d.getFullYear() <= 1990) {
        return getQQUserAvatarUrl(uin, 100);
      }
    }
  } catch {
    // HEAD 请求失败，fallback 到 s=100
    return getQQUserAvatarUrl(uin, 100);
  }

  return url;
}

export function getAvatarUrl(room: number | bigint | Friend | Group): string {
  if (!room) return '';
  if (typeof room === 'object' && 'uin' in room) {
    room = room.uin;
  }
  if (typeof room === 'object' && 'gid' in room) {
    room = -room.gid;
  }
  return room < 0 ?
    `https://p.qlogo.cn/gh/${-room}/${-room}/0` :
    getQQUserAvatarUrl(Number(room));
}

export function getImageUrlByMd5(md5: string) {
  return 'https://gchat.qpic.cn/gchatpic_new/0/0-0-' + md5.toUpperCase() + '/0';
}

export function getBigFaceUrl(file: string) {
  return `https://gxh.vip.qq.com/club/item/parcel/item/${file.substring(0, 2)}/${file.substring(0, 32)}/300x300.png`;
}

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export async function fetchFile(url: string): Promise<Buffer> {
  if (!url) return Buffer.alloc(0);
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    httpsAgent,
  });
  return res.data;
}

function resolveUin(room: number | Friend | Group): number {
  if (typeof room === 'object' && 'uin' in room) {
    return Number(room.uin);
  }
  if (typeof room === 'object' && 'gid' in room) {
    return -room.gid;
  }
  return Number(room);
}

export async function getAvatar(room: number | Friend | Group) {
  const uin = resolveUin(room);
  if (uin > 0) {
    // 用户头像：使用验证后的 URL
    const url = await getValidQQUserAvatarUrl(uin);
    return fetchFile(url);
  }
  return fetchFile(getAvatarUrl(room));
}

export function isContainsUrl(msg: string): boolean {
  return msg.includes('https://') || msg.includes('http://');
}

/**
 * 将 b23.tv 短链接转换为 bilibili BV 链接
 * @param url b23.tv 链接
 * @returns bilibili.com/video/BV... 链接，如果转换失败则返回原链接
 */
export async function convertB23ToBv(url: string): Promise<string> {
  try {
    const res = await axios.head(url, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
      httpsAgent,
    });
    const location = res.headers.location;
    if (location && location.includes('bilibili.com/video/')) {
      // 提取 BV 链接部分，只保留 https://www.bilibili.com/video/BVxxx
      const match = location.match(/(https:\/\/www\.bilibili\.com\/video\/[A-Za-z0-9]+)/);
      if (match) {
        return match[1];
      }
    }
    return url;
  } catch {
    return url;
  }
}
