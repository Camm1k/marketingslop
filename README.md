# Data poster renderer

Render JSON presentation data to a 1080×1350 PNG using headless Playwright. Typography, figures, rules and seeded grain are all drawn in code. Fonts and their licences are included locally. No image model or external requests are used during rendering.

Requires Node.js 22+ and Chromium:

```sh
npm ci
npm run browser:install
npm run example
npm test
```

In this cloud environment `/usr/bin/chromium` is already installed, so the browser installation step is unnecessary. The renderer prefers Playwright's installed browser, falls back to `/usr/bin/chromium`, or uses `CHROMIUM_EXECUTABLE_PATH` when set. Dependencies can be installed with `npm ci --cache /workspace/.npm-cache` if the default cache is not writable.

```sh
node render.mjs path/to/data.json output/poster.png
```

The input and output paths are relative to the working directory. Renderer assets are resolved relative to the script, so it can be called from elsewhere. An HTTP server binds to an OS-assigned loopback port and serves only the input JSON and renderer assets. The server and browser close when rendering ends.

The export uses a 540×675 CSS viewport at `deviceScaleFactor: 2`, yielding exactly 1080×1350 physical pixels. The design coordinates are 1080×1350 and scaled by one half in CSS. There is no post-render image resizing.

## Data

Start with `seed/recap-example.json`. The renderer knows presentation slots, not markets: eyebrow, hero figure, a four-column table, two lists, optional narrative and footer. It neither fetches prices nor calculates or ranks changes. Keep the two list columns compact; oversized content fails layout checks instead of being silently cropped.

Each numeric object requires `value`, `decimals`, `unit` and a `source` key resolving into `sources`. `signed`, `tone` (`rise`, `fall`, `accent`) and `qualifier` are optional. Use `qualifier` on each time-sensitive figure; it follows that figure wherever rendered. Index levels and changes use index points, not currency. Monetary values must include their currency in `unit`.

Labels, dates, source lines and identifiers come from JSON. The source metadata should include an article URL when available. A narrative uses `note: { "text": "…", "source": "source-key" }`; null text omits it. `footer.handle` is optional. No missing explanation or handle is invented. The narrative is anchored above the footer, with collision checks against the lists.

The seed reproduces the user's 26 October 2026 brief. Closing levels are attributed to TheStreet by the user; no article URL was supplied. Movers' percentage units were confirmed by the user, with all five negative moves labelled intraday. These data have not been independently checked against an article. The explanation and handle remain empty because neither was supplied. This is an example render, not a publication-ready factual verification.

Each PNG has a companion `.audit.json` with the input hash, extracted text, source metadata, browser version and layout checks. Tests exercise the actual browser, output dimensions, the intraday labels, different subject matter and rejection of missing units, unknown sources and overflow. Inspect the PNG after every data or layout change; automated checks cannot establish visual quality.
