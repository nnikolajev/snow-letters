import { startSnowLetters } from "./snowLetters.js";

const specimen = document.querySelector("#specimen");
const text = document.querySelector("#preview-text");
const font = document.querySelector("#preview-font");
const thickness = document.querySelector("#preview-thickness");
const thicknessValue = document.querySelector("#thickness-value");
const enabled = document.querySelector("#preview-enabled");
let stop;

function updateText() {
  const value = text.value.trim();
  specimen.textContent = value;
  specimen.style.setProperty("--letter-count", Math.max(8, Array.from(value).length));
}

function updateFont() {
  specimen.dataset.font = font.value;
}

function updateThickness() {
  thicknessValue.value = `${thickness.value}%`;
  specimen.style.setProperty("--snow-thickness", thickness.valueAsNumber / 100);
}

function updateEnabled() {
  stop?.();
  stop = enabled.checked ? startSnowLetters() : undefined;
}

text.addEventListener("input", updateText);
font.addEventListener("change", updateFont);
thickness.addEventListener("input", updateThickness);
enabled.addEventListener("change", updateEnabled);

updateText();
updateFont();
updateThickness();
updateEnabled();
