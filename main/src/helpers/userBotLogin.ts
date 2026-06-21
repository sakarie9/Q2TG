import Telegram from '../client/Telegram';
import TelegramChat from '../client/TelegramChat';
import { CustomFile } from 'telegram/client/uploads';
import qrcode from 'qrcode';

export default async function createUserBotByQrCode(owner: TelegramChat, onError: (err: Error) => void) {
  return await Telegram.createWithQrCode({
    qrCode: async ({ token, expires }) => {
      const url = `tg://login?token=${token.toString('base64url')}`;
      const png = await qrcode.toBuffer(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
      });
      const expiresAt = new Date(expires * 1000).toLocaleString('zh-CN', {
        hour12: false,
        timeZone: 'Asia/Shanghai',
      });
      await owner.sendMessage({
        message: `请使用 Telegram 手机客户端扫描二维码登录 UserBot。\n二维码过期时间：${expiresAt}`,
        file: new CustomFile('telegram-userbot-login.png', png.length, '', png),
        linkPreview: false,
      });
    },
    password: async (hint?: string) => {
      const reply = await owner.sendMessage({
        message: `请输入你的二步验证密码${hint ? '\n密码提示：' + hint : ''}`,
      });
      const password = await owner.waitForInput();
      await reply.delete({ revoke: true });
      await password.delete({ revoke: true });
      return password.message;
    },
    onError,
  });
}
