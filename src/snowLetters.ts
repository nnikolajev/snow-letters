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
const internalNodes = new WeakSet<Node>();
const overlays = new WeakMap<HTMLElement, { canvas: HTMLCanvasElement; users: number }>();

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

function drawSnow(el: HTMLElement, canvas: HTMLCanvasElement): void {
  const textNode = Array.from(el.childNodes).find(
    (node): node is Text => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
  if (!textNode) {
    canvas.remove();
    return;
  }

  const cs = getComputedStyle(el);
  const fontSize = parseFloat(cs.fontSize);
  const value = parseFloat(cs.getPropertyValue("--snow-thickness"));
  const thicknessFactor = Number.isFinite(value) && value >= 0 ? value : 0.16;
  const thickness = fontSize * thicknessFactor;

  const elRect = el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const textRect = range.getBoundingClientRect();
  const textRects = Array.from(range.getClientRects());
  if (!thickness || !textRect.width || textRects.some((rect) => rect.top !== textRects[0].top)) {
    canvas.remove();
    return;
  }

  const preservesSpaces = ["pre", "pre-wrap", "break-spaces"].includes(cs.whiteSpace);
  const text = preservesSpaces ? textNode.data : textNode.data.replace(/[ \t\r\n\f]+/g, " ").trim();

  // Baseline position: zero-size inline-block aligned to the baseline.
  const probe = document.createElement("span");
  probe.style.cssText =
    "all:initial;display:inline-block;width:0;height:0;vertical-align:baseline;";
  internalNodes.add(probe);
  textNode.after(probe);
  const baselineY = probe.getBoundingClientRect().top - textRect.top;
  probe.remove();

  // Limit the scan to the text and leave room for the pile and glyph overhang.
  const pad = Math.ceil(Math.max(thickness * 1.5, fontSize * 0.3));
  const width = Math.ceil(textRect.width) + pad * 2;
  const height = Math.ceil(textRect.height) + pad * 2;
  const scale = window.devicePixelRatio || 1;

  const tops = measureTopEdge(
    text,
    readFont(cs),
    cs.letterSpacing,
    width,
    height,
    pad,
    baselineY + pad,
    scale,
  );
  if (!tops.length) {
    canvas.remove();
    return;
  }
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.left = `${textRect.left - elRect.left - parseFloat(cs.borderLeftWidth) - pad}px`;
  canvas.style.top = `${textRect.top - elRect.top - parseFloat(cs.borderTopWidth) - pad}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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
    depth[i] = thickness * (0.12 + 0.88 * flatness) * lump;
  }

  // Smooth the snow surface so it looks soft instead of pixel-stepped.
  const surface: number[] = Array.from({ length: n }, () => NaN);
  const radius = Math.max(1, Math.round(scale * 1.5));
  const maxDrop = Math.max(2, thickness * 0.45);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(tops[i])) continue;
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= n || Number.isNaN(tops[j]) || Math.abs(tops[j] - tops[i]) > maxDrop) continue;
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

  // Start a new pile at gaps and sharp drops so snow follows each ledge.
  let i = 0;
  while (i < n) {
    if (Number.isNaN(tops[i])) {
      i++;
      continue;
    }
    const start = i++;
    while (i < n && Math.abs(tops[i] - tops[i - 1]) <= maxDrop) i++;
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

  if (canvas.parentNode !== el) el.appendChild(canvas);
}

/** Keeps snow drawn on all matching elements. Returns cleanup. */
export function startSnowLetters(options: SnowLettersOptions = {}): () => void {
  const selector = options.selector ?? ".snow-letters";
  document.querySelector(selector); // Validate before registering observers.
  const active = new Set<HTMLElement>();
  let stopped = false;
  let pending: number | undefined;

  function release(el: HTMLElement): void {
    active.delete(el);
    resizeObserver?.unobserve(el);
    const overlay = overlays.get(el)!;
    if (--overlay.users === 0) {
      overlay.canvas.remove();
      overlays.delete(el);
    }
  }

  function redraw(): void {
    pending = undefined;
    const matches = new Set(
      Array.from(document.querySelectorAll(selector)).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && !internalNodes.has(el),
      ),
    );
    for (const el of active) {
      if (!matches.has(el)) release(el);
    }
    for (const el of matches) {
      let overlay = overlays.get(el);
      if (!overlay) {
        const canvas = document.createElement("canvas");
        canvas.className = CANVAS_CLASS;
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.cssText = "position:absolute;pointer-events:none;z-index:1;";
        internalNodes.add(canvas);
        overlay = { canvas, users: 0 };
        overlays.set(el, overlay);
      }
      if (!active.has(el)) {
        active.add(el);
        overlay.users++;
        resizeObserver?.observe(el);
      }
      drawSnow(el, overlay.canvas);
    }
  }

  function schedule(): void {
    if (!stopped && pending === undefined) pending = requestAnimationFrame(redraw);
  }

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : undefined;
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(({ target, type, addedNodes, removedNodes }) => {
      if (internalNodes.has(target)) return false;
      if (type !== "childList") return true;
      return [...addedNodes, ...removedNodes].some((node) => !internalNodes.has(node));
    })) schedule();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });

  window.addEventListener("resize", schedule);
  document.fonts?.addEventListener("loadingdone", schedule);
  void document.fonts?.ready.then(schedule);
  schedule();

  return () => {
    if (stopped) return;
    stopped = true;
    if (pending !== undefined) cancelAnimationFrame(pending);
    observer.disconnect();
    for (const el of active) release(el);
    resizeObserver?.disconnect();
    window.removeEventListener("resize", schedule);
    document.fonts?.removeEventListener("loadingdone", schedule);
  };
}
