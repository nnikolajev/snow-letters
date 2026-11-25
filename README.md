# Snow Letters

Draw a soft layer of snow on real text. Snow settles more thickly on flat glyph tops and thins out over steep edges. The effect uses a decorative canvas while the text stays selectable and accessible.

[Interactive playground](https://nnikolajev.github.io/snow-letters/) · [Usage guide](https://nnikolajev.github.io/snow-letters/guide.html) · [npm](https://www.npmjs.com/package/snow-letters)

## Install

```sh
npm install snow-letters
```

## Use

Put a single line of plain text directly inside a positioned HTML element. Give the element room above its text and keep overflow visible wherever the snow extends.

```html
<h1 class="snow-letters">Winter Sale</h1>

<style>
  .snow-letters {
    position: relative;
    --snow-thickness: 0.2;
  }
</style>
```

```js
import { startSnowLetters } from "snow-letters";

const stop = startSnowLetters();

// Call stop() when removing the effect or unmounting the view.
```

Call `startSnowLetters` in the browser. The npm package provides an ES module and TypeScript declarations, with no runtime dependencies.

## API

`startSnowLetters(options?)` watches elements matching a CSS selector and returns an idempotent cleanup function. It redraws when matching text changes, new matching elements appear, fonts load, or elements resize.

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `selector` | `string` | `".snow-letters"` | CSS selector for HTML elements. |
| `--snow-thickness` | CSS custom property | `0.16` | Snow depth as a fraction of the font size. Use `0` to hide snow on that element. |

```js
const stop = startSnowLetters({ selector: "[data-winter]" });
```

The overlay has class `snow-letters-canvas`. It is hidden from assistive technology and allows clicks and pointer events to reach the underlying element.

The effect is designed for single-line headings with text directly inside the element and normal inline text flow. Modern Chromium, Firefox, and WebKit are covered by browser tests.

## Develop

Use Node.js 24 to match CI.

```sh
npm ci
npm run lint
npx playwright install chromium firefox webkit
npm test
npm run test:package
```

`npm run build` compiles the library to `dist/`. Run `npm run build:site` followed by `npm run preview` to open the examples at `http://127.0.0.1:4173/snow-letters/`.

Run `npm run format` to apply Biome formatting and safe lint fixes. Open pull requests against `main` and check the Validation workflow before merging.

## Release and deploy

GitHub Actions checks lint, formatting, browser behavior, and packaging on pushes to `main` and on pull requests. The Pages workflow tests the built examples and deploys them from `main` using GitHub Actions as the Pages source.

1. Bump the version with `npm version <patch|minor|major> --no-git-tag-version`. Commit the manifest and lockfile, then merge the change to `main`.
2. Publish a GitHub Release targeting that commit with a tag matching `v<version>`. Include release notes. For prereleases, use a prerelease version in the manifest and mark the GitHub Release as a prerelease.
3. The release workflow validates the tagged source and publishes its verified tarball to npm. Stable releases use `latest`. Prereleases use `next`.

The npm [trusted publisher](https://docs.npmjs.com/trusted-publishers/) is configured for GitHub repository `nnikolajev/snow-letters`, workflow `release.yml`, and environment `npm`, with permission to publish. If recreating the configuration on a fresh package, first create the package on npm, then add this connection and complete a workflow publish within two days. The workflow uses GitHub OIDC for authentication and npm provenance.

## License

[MIT](LICENSE)
