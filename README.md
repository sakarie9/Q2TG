# Q2TG
QQ 群与 Telegram 群相互转发的 bot

交流 https://t.me/+XkF-96lLnFU3ZTM1

## 安装方法

请看 [手册](https://kb.0w.al/文档/Q2TG/安装部署)，[从 V3 更新到 V4](https://kb.0w.al/文档/Q2TG/从%20V3%20更新到%20V4)

v2.x 及以上版本需要 Telegram Bot 账号，并且需要自己注册 Telegram API ID。Telegram UserBot 默认通过二维码登录；如果只使用不依赖 UserBot 的功能，也可以通过 `DISABLE_TG_USERBOT=1` 禁用。

本分支已经移除 icqq 后端，QQ 侧使用 NapCat 连接。Docker 镜像发布到 GitHub Packages：`ghcr.io/qi-mooo/q2tg:sleepyfox`。

## 常用配置

### Telegram UserBot 登录

- `/login` 会智能判断当前掉线的是 QQ 还是 Telegram UserBot：QQ 掉线时重新登录 QQ，UserBot 掉线时重新生成 Telegram 二维码。
- UserBot 登录失效后不会卡死主程序，只会在 Bot 里提示；可以再次使用 `/login` 获取二维码。
- 设置 `DISABLE_TG_USERBOT=1` 可以跳过 UserBot 登录。禁用后部分依赖 UserBot 的能力会不可用，例如部分撤回检测、Rich Header 回测、个人模式自动管理等。

### 合并转发网页

合并转发查看器使用 `WEB_ENDPOINT` 对外提供页面，Telegram Mini App 的 `startapp` 链接也支持。页面打开后会缓存消息记录，避免每次重新向 QQ 获取导致链接过期。

- 图片、闪照和语音会在真正打开页面后后台缓存，不阻塞页面首屏。
- 视频默认只在线播放，不会在打开页面时自动下载到服务器或 R2。
- 视频只有点击“保存到服务器”后才会下载缓存；配置 R2 时会上传到 R2。
- 图片预览支持手势操作、下载图片、显示图片链接。
- 视频支持显示当前视频链接；保存前是在线源地址，保存后是缓存/R2 地址。
- 嵌套合并转发支持预览和返回上层。

### Cloudflare R2 媒体缓存

配置 R2 后，合并转发里打开后缓存的图片/闪照，以及手动保存的视频，会保存到 R2 并使用 `R2_PUBLIC_URL` 生成公网链接。未配置 R2 时会保存到本地缓存目录。

需要的环境变量：

```env
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com/<bucket>
# 如果 R2_ENDPOINT 末尾没有 bucket 路径，则需要单独设置 R2_BUCKET
R2_BUCKET=<bucket>
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_PUBLIC_URL=https://r2.example.com
```

不要把真实 `R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、Cloudflare API Token、Telegram Token、数据库密码提交到 GitHub。compose 示例只应保留占位符。

## 支持的消息类型

- [x] 文字（双向）
- [x] 图片（双向）
  - [x] GIF
  - [x] 闪照
    闪照每个 TG 用户也只能查看 5 秒
- [x] 图文混排消息（双向）
- [x] 大表情（双向）
  - [x] TG 中的动态 Sticker<br>
    目前是[转换成 GIF](https://github.com/ed-asriyan/tgs-to-gif) 发送的，并且可能有些[问题](https://github.com/ed-asriyan/tgs-to-gif/issues/13#issuecomment-633244547)
- [x] 视频（双向）
- [x] 语音（双向）
  - [x] AMR / Silk 语音转换
- [x] 小表情（可显示为文字）
- [x] 红包提示（QQ -> TG）
- [x] 链接（双向）
- [x] JSON/XML 卡片<br>
  （包括部分转化为小程序的链接）
- [x] 位置（TG -> QQ）
- [x] 群公告
- [x] 回复（双平台原生回复）
- [x] 文件<br>
  QQ -> TG 按需获取下载地址<br>
  TG -> QQ 将自动转发 20M 以下的小文件
- [x] 转发多条消息记录
  - [x] 合并转发网页查看、媒体缓存、嵌套转发预览
- [x] TG 编辑消息（撤回再重发）
- [x] 双向撤回消息
- [x] 戳一戳

## 关于模式

### 群组模式

群组模式就是 1.x 版本唯一的模式，是给群主使用的。如果群组想要使自己的 QQ 群和 Telegram 群联通起来，就使用这个模式。群组模式只可以给群聊配置转发，并且转发消息时会带上用户在当前平台的发送者名称。

### 个人模式

个人模式适合 QQ 轻度使用者，TG 重度使用者。可以把 QQ 的好友和群聊搬到 Telegram 中。个人模式一定要登录机器人主人自己的 Telegram 账号作为 UserBot。可以自动为 QQ 中的好友和群组创建对应的 Telegram 群组，并同步头像简介等信息。当有没有创建关联的好友发起私聊的时候会自动创建 Telegram 中的对应群组。个人模式在初始化的时候会自动在 Telegram 个人账号中创建一个文件夹来存储所有来自 QQ 的对应群组。消息在从 TG 转发到 QQ 时不会带上发送者昵称，因为默认发送者只有一个人。

## 如何撤回消息

在 QQ 中，直接撤回相应的消息，撤回操作会同步到 TG

在 TG 中，可以选择以下操作之一：

- 将消息内容编辑为 `/rm`
- 回复要撤回的消息，内容为 `/rm`。如果操作者在 TG 群组中没有「删除消息」权限，则只能撤回自己的消息
- 如果正确配置了个人账号的 User Bot，可以直接删除消息

为了使撤回功能正常工作，TG 机器人需要具有「删除消息」权限，QQ 机器人需要为管理员或群主

即使 QQ 机器人为管理员，也无法撤回其他管理员在 QQ 中发送的消息

## 免责声明

一切开发旨在学习，请勿用于非法用途。本项目完全免费开源，不会收取任何费用，无任何担保。请勿将本项目用于商业用途。由于使用本程序造成的任何问题，由使用者自行承担，项目开发者不承担任何责任。

本项目基于 AGPL 发行。修改、再发行和运行服务需要遵守 AGPL 许可证，源码需要和服务一起提供。

## 许可证

```
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```
