import { expect, test } from "@playwright/test";

const overlay = ".snow-letters-canvas";

async function fixture(page) {
  await page.route("**/fixture.html", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html>
      <style>
        .snow-letters, .custom { position: relative; font: bold 72px Arial, sans-serif; }
        .snow-letters { border: 6px solid transparent; text-align: center; }
      </style>
      <h1 class="snow-letters">H   H</h1>
      <h2 class="custom">Fresh snow</h2>`,
    }),
  );
  await page.goto("./fixture.html");
  await page.evaluate(async () => {
    await document.fonts.ready;
    const { startSnowLetters } = await import("./snowLetters.js");
    window.startSnowLetters = startSnowLetters;
    window.draws = 0;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      window.draws++;
      return original.apply(this, args);
    };
  });
}

async function alphaCount(locator) {
  return locator.evaluate((canvas) => {
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let pixels = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 160) pixels++;
    }
    return pixels;
  });
}

test("paints aligned, accessible snow at the device pixel ratio and settles when idle", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    window.stop = window.startSnowLetters();
  });
  const canvas = page.locator(`h1 > ${overlay}`);
  await expect(canvas).toHaveAttribute("aria-hidden", "true");
  await expect(canvas).toHaveCSS("pointer-events", "none");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("H H");

  const result = await canvas.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.parentElement.firstChild);
    const text = range.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    const scale = window.devicePixelRatio;
    const ctx = element.getContext("2d");
    const { data } = ctx.getImageData(0, 0, element.width, element.height);
    const columns = new Set();
    for (let y = 0; y < element.height; y++) {
      for (let x = 0; x < element.width; x++) {
        if (data[(y * element.width + x) * 4 + 3] > 160) columns.add(x);
      }
    }
    const pixels = [...columns].map((x) => bounds.left + x / scale);
    const midpoint = (text.left + text.right) / 2;
    return {
      scaleMatches: Math.ceil(bounds.width * scale) === element.width,
      paintsBothLetters: pixels.some((x) => x < midpoint) && pixels.some((x) => x > midpoint),
      leavesGap: pixels.every((x) => Math.abs(x - midpoint) > 2),
      insideText: pixels.every((x) => x >= text.left - 1 && x <= text.right + 1),
    };
  });
  expect(result).toEqual({
    scaleMatches: true,
    paintsBothLetters: true,
    leavesGap: true,
    insideText: true,
  });

  const drawsWhileIdle = await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (let i = 0; i < 4; i++) await frame();
    const before = window.draws;
    for (let i = 0; i < 4; i++) await frame();
    return window.draws - before;
  });
  expect(drawsWhileIdle).toBe(0);
});

test("refreshes for text, custom thickness, resize, and font loads", async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    window.stop = window.startSnowLetters();
  });
  const heading = page.locator("h1");
  const canvas = heading.locator(overlay);
  await expect(canvas).toHaveCount(1);
  const initialPixels = await alphaCount(canvas);
  expect(initialPixels).toBeGreaterThan(100);

  await heading.evaluate((el) => el.style.setProperty("--snow-thickness", "0.32"));
  await expect.poll(() => alphaCount(canvas)).toBeGreaterThan(initialPixels);
  await heading.evaluate((el) => el.style.setProperty("--snow-thickness", "0"));
  await expect(canvas).toHaveCount(0);
  await heading.evaluate((el) => el.style.removeProperty("--snow-thickness"));
  await expect(canvas).toHaveCount(1);

  await heading.evaluate((el) => {
    el.firstChild.data = "";
  });
  await expect(canvas).toHaveCount(0);
  await heading.evaluate((el) => {
    el.firstChild.data = "W";
  });
  await expect(canvas).toHaveCount(1);
  expect(await alphaCount(canvas)).toBeLessThan(initialPixels);

  const beforeResize = await canvas.evaluate((el) => el.getBoundingClientRect().left);
  await page.setViewportSize({ width: 900, height: 700 });
  await expect
    .poll(() => canvas.evaluate((el) => el.getBoundingClientRect().left))
    .toBeLessThan(beforeResize);
  const beforeFontLoad = await page.evaluate(() => {
    document.fonts.dispatchEvent(new Event("loadingdone"));
    return window.draws;
  });
  await expect.poll(() => page.evaluate(() => window.draws)).toBeGreaterThan(beforeFontLoad);
});

test("deep snow does not leave tall streaks on narrow ledges", async ({ page }) => {
  await fixture(page);
  const heading = page.locator("h1");
  await heading.evaluate((element) => {
    element.textContent = "aW gny";
    element.style.font = "bold 68px Georgia, 'Times New Roman', serif";
    element.style.setProperty("--snow-thickness", "0.5");
    window.startSnowLetters();
  });

  const canvas = heading.locator(overlay);
  await expect(canvas).toHaveCount(1);
  expect(await alphaCount(canvas)).toBeGreaterThan(100);
  const tallSliver = await canvas.evaluate((element) => {
    const { width, height } = element;
    const { data } = element.getContext("2d").getImageData(0, 0, width, height);
    const visited = new Uint8Array(width * height);
    const scale = window.devicePixelRatio;

    // Measure connected solid snow pixels separately from the soft shadow.
    for (let start = 0; start < visited.length; start++) {
      if (visited[start] || data[start * 4 + 3] < 160) continue;
      visited[start] = 1;
      const pending = [start];
      let left = width;
      let right = 0;
      let top = height;
      let bottom = 0;
      for (const pixel of pending) {
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        for (const neighbor of [
          x > 0 ? pixel - 1 : -1,
          x < width - 1 ? pixel + 1 : -1,
          pixel - width,
          pixel + width,
        ]) {
          if (data[neighbor * 4 + 3] >= 160 && !visited[neighbor]) {
            visited[neighbor] = 1;
            pending.push(neighbor);
          }
        }
      }
      if (right - left + 1 <= 5 * scale && bottom - top + 1 >= 12 * scale) return true;
    }
    return false;
  });
  expect(tallSliver).toBe(false);
});

test("tracks selector changes and cleans up independent and overlapping subscriptions", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    window.stop = window.startSnowLetters();
    window.stopCustom = window.startSnowLetters({ selector: ".custom, h1" });
  });
  await expect(page.locator(overlay)).toHaveCount(2);
  await page.evaluate(() => {
    window.stop();
    window.stop();
  });
  await expect(page.locator(overlay)).toHaveCount(2);

  const late = page.locator("#late");
  await page.evaluate(() => {
    const el = document.createElement("h3");
    el.id = "late";
    el.textContent = "Snowbank";
    document.body.append(el);
  });
  await expect(late.locator(overlay)).toHaveCount(0);
  await late.evaluate((el) => {
    el.className = "custom";
  });
  await expect(late.locator(overlay)).toHaveCount(1);
  await late.evaluate((el) => {
    el.className = "";
  });
  await expect(late.locator(overlay)).toHaveCount(0);

  await page.evaluate(() => {
    window.stopCustom();
    const cancelImmediately = window.startSnowLetters();
    cancelImmediately();
    window.dispatchEvent(new Event("resize"));
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.locator(overlay)).toHaveCount(0);
});

test("playground controls update visible snow and fit a mobile viewport", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  const specimen = page.locator("#specimen");
  const canvas = specimen.locator(overlay);
  await expect(canvas).toBeVisible();
  expect(await alphaCount(canvas)).toBeGreaterThan(100);
  await page.getByLabel("Text", { exact: true }).fill("Winter Sun");
  await expect(specimen).toHaveText("Winter Sun");
  await page.getByLabel("Typeface").selectOption("mono");
  await expect(specimen).toHaveCSS("font-family", /Courier New/);
  await page.getByRole("slider", { name: /Thickness/ }).focus();
  await page.keyboard.press("Home");
  await expect(canvas).toHaveCount(0);
  await page.keyboard.press("End");
  await expect(canvas).toHaveCount(1);
  await expect(page.locator("#thickness-value")).toHaveText("32%");
  await page.getByLabel("Snow on").uncheck();
  await expect(canvas).toHaveCount(0);
  await page.getByLabel("Snow on").check();
  await expect(canvas).toHaveCount(1);
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
  expect(errors).toEqual([]);
});

test("guide demonstrates new headings and cleanup under the Pages subpath", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Read the guide" }).click();
  await expect(page).toHaveURL(/\/snow-letters\/guide\.html$/);
  await expect(page.locator(`.sample-grid ${overlay}`)).toHaveCount(2);
  const dynamic = page.locator(`#dynamic-stage ${overlay}`);
  await expect(dynamic).toHaveCount(1);
  await page.getByRole("button", { name: "Add heading" }).click();
  await expect(dynamic).toHaveCount(2);
  await page.getByRole("button", { name: "Stop snow" }).click();
  await expect(dynamic).toHaveCount(0);
  await expect(page.locator(`.sample-grid ${overlay}`)).toHaveCount(2);
  await page.getByRole("button", { name: "Start snow" }).click();
  await expect(dynamic).toHaveCount(2);
});
