import { ref } from 'vue'

/** 全局图片预览状态 */
export const previewImageUrl = ref<string | null>(null)

export function openImagePreview(url: string) {
  previewImageUrl.value = url
}

export function closeImagePreview() {
  previewImageUrl.value = null
}

/**
 * 通过 <a> 标签 + referrerpolicy="no-referrer" 触发浏览器下载。
 * QQ 多媒体 CDN 会检查 Referer 请求头 —— 带 Referer 时返回 invalid url 错误，
 * 不带 Referer 时正常返回图片。使用 no-referrer 策略可绕过此检查。
 * 相比 canvas 方案，不会因跨域图片导致画布污染（tainted canvas）。
 */
export function downloadImageByUrl(url: string, filename?: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `q2tg_image_${Date.now()}.png`
  a.referrerPolicy = 'no-referrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
