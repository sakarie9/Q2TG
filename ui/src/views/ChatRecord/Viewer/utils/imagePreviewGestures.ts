type Point = {
  x: number;
  y: number;
};

type PreviewTransform = {
  x: number;
  y: number;
  scale: number;
  rotate: number;
};

type GestureState = {
  preview: HTMLImageElement;
  mode: 'pan' | 'pinch';
  startPoint: Point;
  startCenter: Point;
  startDistance: number;
  base: PreviewTransform;
  current: PreviewTransform;
  moved: boolean;
  startTime: number;
};

const PREVIEW_SELECTOR = '.n-image-preview';
const TOOLBAR_SELECTOR = '.n-image-preview-toolbar';
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_MS = 300;
const TAP_MOVE_LIMIT = 12;
const CLOSE_DISTANCE = 120;

let installed = false;
let state: GestureState | null = null;
let lastTap: { time: number; point: Point; preview: HTMLImageElement } | null = null;

export const installImagePreviewGestures = () => {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  injectGestureStyle();

  const listenerOptions: AddEventListenerOptions = { capture: true, passive: false };
  document.addEventListener('touchstart', handleTouchStart, listenerOptions);
  document.addEventListener('touchmove', handleTouchMove, listenerOptions);
  document.addEventListener('touchend', handleTouchEnd, listenerOptions);
  document.addEventListener('touchcancel', handleTouchCancel, listenerOptions);
};

const handleTouchStart = (event: TouchEvent) => {
  const preview = getPreviewImage(event.target);
  if (!preview) return;

  if (event.touches.length >= 2) {
    state = createPinchState(preview, event);
    prevent(event);
    return;
  }

  const point = touchPoint(event.touches[0]);
  const base = readTransform(preview);
  state = {
    preview,
    mode: 'pan',
    startPoint: point,
    startCenter: point,
    startDistance: 0,
    base,
    current: base,
    moved: false,
    startTime: Date.now(),
  };
};

const handleTouchMove = (event: TouchEvent) => {
  if (!state) return;
  if (!document.body.contains(state.preview)) {
    state = null;
    return;
  }

  if (event.touches.length >= 2) {
    if (state.mode !== 'pinch') {
      state = createPinchState(state.preview, event, state.current);
    }
    updatePinch(event);
    prevent(event);
    return;
  }

  if (event.touches.length !== 1 || state.mode !== 'pan') return;

  const point = touchPoint(event.touches[0]);
  const dx = point.x - state.startPoint.x;
  const dy = point.y - state.startPoint.y;
  state.moved ||= Math.hypot(dx, dy) > TAP_MOVE_LIMIT;

  if (state.base.scale > 1.02) {
    state.current = clampTransform(state.preview, {
      ...state.base,
      x: state.base.x + dx,
      y: state.base.y + dy,
    });
  }
  else {
    const pullDistance = Math.max(0, dy);
    state.current = {
      ...state.base,
      y: pullDistance,
      scale: Math.max(0.86, 1 - pullDistance / 900),
    };
  }

  applyTransform(state.preview, state.current, false);
  prevent(event);
};

const handleTouchEnd = (event: TouchEvent) => {
  if (!state) return;

  if (event.touches.length === 1) {
    const point = touchPoint(event.touches[0]);
    const base = readTransform(state.preview);
    state = {
      preview: state.preview,
      mode: 'pan',
      startPoint: point,
      startCenter: point,
      startDistance: 0,
      base,
      current: base,
      moved: false,
      startTime: Date.now(),
    };
    return;
  }

  const finished = state;
  state = null;

  if (finished.mode === 'pan' && !finished.moved && Date.now() - finished.startTime < 260) {
    handleTap(finished);
    return;
  }

  if (
    finished.mode === 'pan' &&
    finished.base.scale <= 1.02 &&
    finished.current.y >= CLOSE_DISTANCE
  ) {
    closePreview(finished.preview);
    return;
  }

  settleTransform(finished.preview, finished.current);
  prevent(event);
};

const handleTouchCancel = () => {
  if (state) {
    settleTransform(state.preview, state.current);
  }
  state = null;
};

const createPinchState = (
  preview: HTMLImageElement,
  event: TouchEvent,
  base = readTransform(preview),
): GestureState => {
  const first = touchPoint(event.touches[0]);
  const second = touchPoint(event.touches[1]);
  const center = midpoint(first, second);
  return {
    preview,
    mode: 'pinch',
    startPoint: center,
    startCenter: center,
    startDistance: distance(first, second),
    base,
    current: base,
    moved: true,
    startTime: Date.now(),
  };
};

const updatePinch = (event: TouchEvent) => {
  if (!state || state.mode !== 'pinch') return;

  const first = touchPoint(event.touches[0]);
  const second = touchPoint(event.touches[1]);
  const center = midpoint(first, second);
  const nextScale = clamp(
    state.base.scale * (distance(first, second) / Math.max(1, state.startDistance)),
    MIN_SCALE,
    MAX_SCALE,
  );
  const origin = viewportCenter();
  const ratio = nextScale / Math.max(0.01, state.base.scale);
  state.current = clampTransform(state.preview, {
    ...state.base,
    scale: nextScale,
    x: center.x - origin.x - (state.startCenter.x - origin.x - state.base.x) * ratio,
    y: center.y - origin.y - (state.startCenter.y - origin.y - state.base.y) * ratio,
  });
  applyTransform(state.preview, state.current, false);
};

const handleTap = (finished: GestureState) => {
  const now = Date.now();
  const point = finished.startPoint;
  if (
    lastTap &&
    lastTap.preview === finished.preview &&
    now - lastTap.time < DOUBLE_TAP_MS &&
    distance(point, lastTap.point) < 36
  ) {
    lastTap = null;
    toggleDoubleTapZoom(finished.preview, point);
    return;
  }
  lastTap = { time: now, point, preview: finished.preview };
};

const toggleDoubleTapZoom = (preview: HTMLImageElement, point: Point) => {
  const current = readTransform(preview);
  if (current.scale > 1.2) {
    applyTransform(preview, { ...current, x: 0, y: 0, scale: 1 }, true);
    return;
  }

  const nextScale = 2.5;
  const origin = viewportCenter();
  const ratio = nextScale / Math.max(0.01, current.scale);
  const next = clampTransform(preview, {
    ...current,
    scale: nextScale,
    x: point.x - origin.x - (point.x - origin.x - current.x) * ratio,
    y: point.y - origin.y - (point.y - origin.y - current.y) * ratio,
  });
  applyTransform(preview, next, true);
};

const settleTransform = (preview: HTMLImageElement, transform: PreviewTransform) => {
  if (transform.scale <= 1.02) {
    applyTransform(preview, { ...transform, x: 0, y: 0, scale: 1 }, true);
    return;
  }
  applyTransform(preview, clampTransform(preview, transform), true);
};

const getPreviewImage = (target: EventTarget | null) => {
  if (!(target instanceof Element) || target.closest(TOOLBAR_SELECTOR)) return null;
  const preview = target.closest(PREVIEW_SELECTOR);
  return preview instanceof HTMLImageElement ? preview : null;
};

const readTransform = (preview: HTMLImageElement): PreviewTransform => {
  const transform = preview.style.transform || getComputedStyle(preview).transform || '';
  const regexValue = (regex: RegExp, fallback: number) => {
    const match = transform.match(regex);
    return match ? Number(match[1]) || fallback : fallback;
  };

  const parsed = {
    x: regexValue(/translateX\((-?[\d.]+)px\)/, 0),
    y: regexValue(/translateY\((-?[\d.]+)px\)/, 0),
    scale: regexValue(/scale\((-?[\d.]+)\)/, 1),
    rotate: regexValue(/rotate\((-?[\d.]+)deg\)/, 0),
  };

  if (transform.startsWith('matrix') && 'DOMMatrixReadOnly' in window) {
    const matrix = new DOMMatrixReadOnly(transform);
    return {
      x: matrix.e,
      y: matrix.f,
      scale: Math.max(MIN_SCALE, Math.hypot(matrix.a, matrix.b)),
      rotate: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
    };
  }

  return parsed;
};

const applyTransform = (
  preview: HTMLImageElement,
  transform: PreviewTransform,
  transition: boolean,
) => {
  preview.style.transformOrigin = 'center';
  preview.style.transform = `translateX(${transform.x}px) translateY(${transform.y}px) rotate(${transform.rotate}deg) scale(${transform.scale})`;
  preview.style.transition = transition ? 'transform .22s cubic-bezier(.4, 0, .2, 1)' : 'none';
};

const clampTransform = (preview: HTMLImageElement, transform: PreviewTransform): PreviewTransform => {
  if (transform.scale <= 1.02) return { ...transform, x: 0, y: 0 };

  const rotated = Math.abs(Math.round(transform.rotate / 90)) % 2 === 1;
  const baseWidth = rotated ? preview.offsetHeight : preview.offsetWidth;
  const baseHeight = rotated ? preview.offsetWidth : preview.offsetHeight;
  const maxX = Math.max(0, (baseWidth * transform.scale - window.innerWidth) / 2 + 24);
  const maxY = Math.max(0, (baseHeight * transform.scale - window.innerHeight) / 2 + 24);

  return {
    ...transform,
    x: clamp(transform.x, -maxX, maxX),
    y: clamp(transform.y, -maxY, maxY),
  };
};

const closePreview = (preview: HTMLImageElement) => {
  applyTransform(preview, { ...readTransform(preview), x: 0, y: 0, scale: 1 }, true);
  const overlay = document.querySelector<HTMLElement>('.n-image-preview-overlay');
  overlay?.click();
};

const injectGestureStyle = () => {
  if (document.querySelector('style[data-q2tg-image-preview-gestures]')) return;
  const style = document.createElement('style');
  style.dataset.q2tgImagePreviewGestures = 'true';
  style.textContent = `
    .n-image-preview {
      touch-action: none;
    }
    .n-image-preview-wrapper {
      overscroll-behavior: contain;
    }
  `;
  document.head.appendChild(style);
};

const touchPoint = (touch: Touch): Point => ({ x: touch.clientX, y: touch.clientY });
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const viewportCenter = (): Point => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const prevent = (event: TouchEvent) => {
  if (event.cancelable) event.preventDefault();
};
