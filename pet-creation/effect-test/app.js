const wrap = document.getElementById("profileCardWrap");
const card = document.getElementById("profileCard");

const ANIMATION_CONFIG = {
  SMOOTH_DURATION: 600,
  INITIAL_DURATION: 1500,
  INITIAL_X_OFFSET: 70,
  INITIAL_Y_OFFSET: 60,
};

let rafId = 0;

function clamp(value, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function round(value, precision = 3) {
  return Number(value.toFixed(precision));
}

function adjust(value, fromMin, fromMax, toMin, toMax) {
  return round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin));
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function updateCardTransform(offsetX, offsetY) {
  if (!card || !wrap) return;

  const width = card.clientWidth;
  const height = card.clientHeight;
  const percentX = clamp((100 / width) * offsetX);
  const percentY = clamp((100 / height) * offsetY);
  const centerX = percentX - 50;
  const centerY = percentY - 50;

  const properties = {
    "--pointer-x": `${percentX}%`,
    "--pointer-y": `${percentY}%`,
    "--background-x": `${adjust(percentX, 0, 100, 35, 65)}%`,
    "--background-y": `${adjust(percentY, 0, 100, 35, 65)}%`,
    "--pointer-from-center": `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
    "--pointer-from-top": `${percentY / 100}`,
    "--pointer-from-left": `${percentX / 100}`,
    "--rotate-x": `${round(-(centerX / 5))}deg`,
    "--rotate-y": `${round(centerY / 4)}deg`,
  };

  Object.entries(properties).forEach(([property, value]) => {
    wrap.style.setProperty(property, value);
  });
}

function cancelAnimation() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function createSmoothAnimation(duration, startX, startY) {
  const startTime = performance.now();
  const targetX = wrap.clientWidth / 2;
  const targetY = wrap.clientHeight / 2;

  function animationLoop(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = clamp(elapsed / duration);
    const easedProgress = easeInOutCubic(progress);
    const currentX = adjust(easedProgress, 0, 1, startX, targetX);
    const currentY = adjust(easedProgress, 0, 1, startY, targetY);

    updateCardTransform(currentX, currentY);

    if (progress < 1) {
      rafId = requestAnimationFrame(animationLoop);
      return;
    }

    rafId = 0;
  }

  rafId = requestAnimationFrame(animationLoop);
}

function handlePointerMove(event) {
  if (!card || !wrap) return;

  const rect = card.getBoundingClientRect();
  updateCardTransform(event.clientX - rect.left, event.clientY - rect.top);
}

function handlePointerEnter() {
  if (!card || !wrap) return;

  cancelAnimation();
  wrap.classList.add("active");
  card.classList.add("active");
}

function handlePointerLeave(event) {
  if (!card || !wrap) return;

  createSmoothAnimation(ANIMATION_CONFIG.SMOOTH_DURATION, event.offsetX, event.offsetY);
  wrap.classList.remove("active");
  card.classList.remove("active");
}

function init() {
  if (!card || !wrap) return;

  card.addEventListener("pointerenter", handlePointerEnter);
  card.addEventListener("pointermove", handlePointerMove);
  card.addEventListener("pointerleave", handlePointerLeave);

  const initialX = wrap.clientWidth - ANIMATION_CONFIG.INITIAL_X_OFFSET;
  const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET;

  updateCardTransform(initialX, initialY);
  createSmoothAnimation(ANIMATION_CONFIG.INITIAL_DURATION, initialX, initialY);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
