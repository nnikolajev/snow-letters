import { startSnowLetters } from "./snowLetters.js";

const stage = document.querySelector("#dynamic-stage");
const add = document.querySelector("#add-example");
const toggle = document.querySelector("#toggle-example");
const headings = ["Ski Lodge", "Fresh Snow", "Ice Rink"];
let next = 0;
let stop = watchHeadings();

function watchHeadings() {
  return startSnowLetters({ selector: "[data-winter]" });
}

add.addEventListener("click", () => {
  const heading = document.createElement("p");
  heading.className = "sample-type";
  heading.setAttribute("data-winter", "");
  heading.textContent = headings[next];
  stage.append(heading);
  if (stage.children.length > headings.length) stage.firstElementChild.remove();
  next = (next + 1) % headings.length;
});

toggle.addEventListener("click", () => {
  if (stop) {
    stop();
    stop = undefined;
  } else {
    stop = watchHeadings();
  }
  toggle.textContent = stop ? "Stop snow" : "Start snow";
});

startSnowLetters();
