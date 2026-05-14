import { ref } from 'vue'

/** 全局图片预览状态 */
export const previewImageUrl = ref<string | null>(null)

export function openImagePreview(url: string) {
  previewImageUrl.value = url
}

export function closeImagePreview() {
  previewImageUrl.value = null
}
