import { defineComponent, ref } from 'vue';
import { previewImageUrl, closeImagePreview, downloadImageByUrl } from '../utils/imagePreview';

/** 全屏图片预览浮层（可复用） */
const ImagePreviewOverlay = defineComponent({
  setup() {
    const imgRef = ref<HTMLImageElement | null>(null);

    function handleDownload() {
      if (previewImageUrl.value) {
        downloadImageByUrl(previewImageUrl.value, `q2tg_image_${Date.now()}.png`);
      }
    }

    return () => previewImageUrl.value ? (
      <div
        class="fixed inset-0 flex items-center justify-center"
        style={{
          zIndex: 70,
          background: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(4px)',
          WebkitTapHighlightColor: 'transparent',
        }}
        onClick={closeImagePreview}
      >
        {/* 关闭按钮 */}
        <button
          class="absolute top-4 right-4 flex items-center justify-center border-none text-white"
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            fontSize: '22px', cursor: 'pointer', zIndex: 1,
          }}
          onClick={closeImagePreview}
        >
          ✕
        </button>

        {/* 下载按钮 */}
        <button
          class="absolute top-4 left-4 flex items-center justify-center border-none text-white"
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            fontSize: '20px', cursor: 'pointer', zIndex: 1,
          }}
          onClick={(e: MouseEvent) => { e.stopPropagation(); handleDownload(); }}
          title="下载图片"
        >
          ⬇
        </button>

        <img
          ref={imgRef}
          src={previewImageUrl.value}
          class="max-w-[90vw] max-h-[90vh]"
          style={{
            objectFit: 'contain',
            borderRadius: '8px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          referrerpolicy="no-referrer"
          onClick={(e: MouseEvent) => e.stopPropagation()}
          draggable={false}
        />
      </div>
    ) : null;
  },
});

export default ImagePreviewOverlay;
