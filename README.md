# snow-letters

Puts snow on top of text. The snow follows the real shape of each letter:
flat tops get a thick layer, curves get a thinner one, and steep edges stay
almost bare, as if the snow slid off.

- Plain JavaScript, works with any framework or none.
- No dependencies.
- Keeps the snow in place when the page resizes, fonts load, or the text
  changes.
- Adds snow to matching elements that appear later.

## How it works

For each element, the text is drawn to an offscreen canvas with the same font
and spacing. The library finds the top edge of the letters in every pixel
column, then draws a soft, slightly uneven snow layer along that edge on a
canvas placed over the text. The text itself is not changed, so it stays
selectable and readable by screen readers.

## Installation

```sh
npm install snow-letters
```

## Usage

```html
<h1 class="snow-letters">Happy holidays</h1>
```

```css
.snow-letters {
  position: relative;
}
```

```js
import { startSnowLetters } from "snow-letters";

const stop = startSnowLetters();

// Later, to remove the snow:
stop();
```

The element must contain the text directly, as a text node. It must also be
positioned (for example `position: relative`), because the snow canvas is
placed absolutely inside it.

## API

### `startSnowLetters(options?)`

Starts drawing snow on all elements that match the selector. Returns a
function that stops the library and removes all snow.

| Option     | Type     | Default           | Description                          |
| ---------- | -------- | ----------------- | ------------------------------------ |
| `selector` | `string` | `".snow-letters"` | CSS selector of the elements to use. |

## Styling

Set the snow thickness per element with the `--snow-thickness` CSS custom
property. The value is a fraction of the font size. The default is `0.16`.

```css
.title {
  --snow-thickness: 0.2;
}
```

The snow canvas has the class `snow-letters-canvas`. It does not react to the
mouse, so links and buttons under it keep working.

## Browser support

Any browser that supports the canvas 2D API and `MutationObserver`.

## Building

```sh
npm install
npm run build
```

The compiled files are written to `dist/`.
