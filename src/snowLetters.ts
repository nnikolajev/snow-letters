/**
 * Draws snow that follows the real outline of each letter inside
 * the matched elements. The text is rendered to an offscreen canvas,
 * the top edge of every pixel column is detected, and a snow layer is drawn
 * along that edge. Capital letters, curves (a, G) and steps (t) all get snow
 * on their actual top surface.
 *
 * Per-element tuning: `--snow-thickness` (fraction of font size, default 0.16).
 */

export interface SnowLettersOptions {
  /** CSS selector of the elements that get snow. Default `.snow-letters`. */
  selector?: string;
}

const CANVAS_CLASS = "snow-letters-canvas";

function readFont(cs: CSSStyleDeclaration): string {
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

/** Top edge (in CSS px, relative to canvas) for each pixel column, or NaN. */
function measureTopEdge(
  text: string,
  font: string,
  letterSpacing: string,
  width: number,
  height: number,
  textX: number,
  baselineY: number,
  scale: number,
): number[] {
  const off = document.createElement("canvas");
  off.width = Math.ceil(width * scale);
  off.height = Math.ceil(height * scale);
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.scale(scale, scale);
  ctx.font = font;
  if ("letterSpacing" in ctx && letterSpacing !== "normal") {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      letterSpacing;
  }
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000";
  ctx.fillText(text, textX, baselineY);

  const { data } = ctx.getImageData(0, 0, off.width, off.height);
  const tops: number[] = [];
  for (let x = 0; x < off.width; x++) {
    let top = NaN;
    for (let y = 0; y < off.height; y++) {
      if (data[(y * off.width + x) * 4 + 3] > 110) {
        top = y / scale;
        break;
      }
    }
    tops.push(top);
  }
  return tops;
}

function drawSnow(el: HTMLElement): void {
  const textNode = Array.from(el.childNodes).find(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
  );
  if (!textNode) return;

  const cs = getComputedStyle(el);
  const fontSize = parseFloat(cs.fontSize);
  const thicknessFactor =
    parseFloat(cs.getPropertyValue("--snow-thickness")) || 0.16;
  const thickness = fontSize * thicknessFactor;

  const elRect = el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const textRect = range.getBoundingClientRect();

  // Baseline position: zero-size inline-block aligned to the baseline.
  const probe = document.createElement("span");
  probe.style.cssText =
    "display:inline-block;width:0;height:0;vertical-align:baseline;";
  el.appendChild(probe);
  const baselineY = probe.getBoundingClientRect().top - elRect.top;
  probe.remove();

  // Extra room above the text for the snow pile.
  const pad = Math.ceil(thickness * 1.5);
  const width = Math.ceil(elRect.width) + pad * 2;
  const height = Math.ceil(elRect.height) + pad;
  const scale = window.devicePixelRatio || 1;
  const textX = textRect.left - elRect.left + pad;

  const tops = measureTopEdge(
    textNode.textContent!,
    readFont(cs),
    cs.letterSpacing,
    width,
    height,
    textX,
    baselineY + pad,
    scale,
  );
  if (!tops.length) return;

  let canvas = el.querySelector<HTMLCanvasElement>(`:scope > .${CANVAS_CLASS}`);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = CANVAS_CLASS;
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);
  }
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.left = `${-pad}px`;
  canvas.style.top = `${-pad}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Snow depth per column: less on steep edges (snow slides off), with lumps.
  const n = tops.length;
  const step = 1 / scale;
  const depth: number[] = Array.from({ length: n }, () => NaN);
  const slopeSpan = Math.max(2, Math.round(scale * 2));
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(tops[i])) continue;
    const l = tops[Math.max(0, i - slopeSpan)];
    const r = tops[Math.min(n - 1, i + slopeSpan)];
    const slope =
      Number.isNaN(l) || Number.isNaN(r)
        ? 3
        : Math.abs(r - l) / (2 * slopeSpan * step);
    const flatness = 1 / (1 + slope * slope * 1.5);
    const lump = 0.85 + 0.15 * Math.sin(i * step * 0.9) * Math.sin(i * step * 0.37);
    depth[i] = thickness * (0.25 + 0.75 * flatness) * lump;
  }

  // Smooth the snow surface so it looks soft instead of pixel-stepped.
  const surface: number[] = Array.from({ length: n }, () => NaN);
  const radius = Math.max(1, Math.round(scale * 1.5));
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(tops[i])) continue;
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= n || Number.isNaN(tops[j])) continue;
      sum += tops[j] - depth[j];
      count++;
    }
    surface[i] = sum / count;
  }

  const overlap = thickness * 0.35; // snow dips slightly into the letter
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(40, 70, 120, 0.45)";
  ctx.shadowBlur = 1.5;
  ctx.shadowOffsetY = 0.5;

  // One filled shape per continuous run of columns that contain ink.
  let i = 0;
  while (i < n) {
    if (Number.isNaN(tops[i])) {
      i++;
      continue;
    }
    const start = i;
    while (i < n && !Number.isNaN(tops[i])) i++;
    const end = i - 1;

    ctx.beginPath();
    ctx.moveTo(start * step, tops[start] + overlap * 0.3);
    for (let j = start; j <= end; j++) ctx.lineTo(j * step, surface[j]);
    ctx.lineTo(end * step, tops[end] + overlap * 0.3);
    for (let j = end; j >= start; j--) {
      ctx.lineTo(j * step, Math.min(tops[j] + overlap, surface[j] + depth[j] + overlap));
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** Keeps snow drawn on all matching elements. Returns cleanup. */
export function startSnowLetters(options: SnowLettersOptions = {}): () => void {
  const SELECTOR = options.selector ?? ".snow-letters";
  const style = document.createElement("style");
  style.textContent = `
.${CANVAS_CLASS} {
  position: absolute;
  pointer-events: none;
  z-index: 1;
}`;
  document.head.appendChild(style);

  let pending = 0;
  const redrawAll = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach(drawSnow);
    });
  };

  // Redraw when new logos appear (client-side navigation) or text changes.
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) => {
      const target = m.target as Element;
      if (target instanceof HTMLCanvasElement) return false;
      const added = Array.from(m.addedNodes);
      if (added.length && added.every((a) => a instanceof HTMLCanvasElement)) {
        return false;
      }
      return (
        added.some(
          (a) =>
            a instanceof Element &&
            (a.matches(SELECTOR) || a.querySelector(SELECTOR)),
        ) ||
        Boolean(target.closest?.(SELECTOR)) ||
        (m.type === "characterData" && Boolean(target.parentElement?.closest(SELECTOR)))
      );
    });
    if (relevant) redrawAll();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("resize", redrawAll);
  void document.fonts?.ready.then(redrawAll);
  redrawAll();

  return () => {
    cancelAnimationFrame(pending);
    observer.disconnect();
    window.removeEventListener("resize", redrawAll);
    document.querySelectorAll(`.${CANVAS_CLASS}`).forEach((c) => c.remove());
    style.remove();
  };
}
