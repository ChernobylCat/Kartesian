# Kartesian

Kartesian is a browser-based visual editor for precisely positioning and printing text and images on F4 or PDF documents.

It is designed for coordinate-based print workflows where data must line up with an existing paper form or PDF template. Users can prepare a document visually, calibrate printer offsets, preview the result against a PDF, and print or export the finished layout directly from the browser.

## Highlights

- Coordinate-based F4 canvas measuring `210 x 330 mm`
- Drag-and-drop text and image placement with magnetic snapping
- Eight-direction resize handles for text and images
- Precise element properties for position, size, typography, rotation, layer, and lock state
- Text formatting through a contextual floating toolbar
- Multi-selection, marquee selection, alignment, and distribution tools
- Inline text editing, undo/redo history, keyboard shortcuts, and context menus
- PDF background overlays with opacity control and local persistence
- Printer calibration offsets and separate preview/print visibility controls
- Import/export for application settings and standalone HTML export
- Autosave, dark mode, interactive onboarding, accessibility support, and offline PWA support
- Schema validation, safe rendering, and cross-browser regression tests

## Requirements

- Node.js 24 is used by the CI workflow. A current Node.js LTS release should also work locally.
- npm
- A modern browser such as Edge, Chrome, Firefox, or Safari
- A local web server; ES modules and service workers do not work correctly through `file://`

## Getting Started

Clone the repository, install the dependencies, and build the local assets:

```bash
git clone https://github.com/ChernobylCat/Kartesian.git
cd Kartesian
npm install
npm run build
```

Start the included static development server:

```bash
node tests/support/static-server.js
```

Open the application at:

```text
http://127.0.0.1:4173
```

The runtime does not depend on a CDN. The build command copies the pinned Ace, Lucide, and PDF.js assets from `node_modules` into `assets/vendor`, then compiles Tailwind CSS into `assets/app.css`.

### Developing the UI

Run the Tailwind watcher in a separate terminal while editing UI styles:

```bash
npm run dev:css
```

The application uses native ES modules, so JavaScript changes only require a browser reload. CSS source lives in `src/input.css`. Canvas geometry, physical units, and print-specific rules remain in `index.html` because they are part of the print layout engine.

## How to Use Kartesian

### 1. Prepare the document data

The JSON editor is the structured source of truth for debtors, pages, and printable elements. You can:

- edit the JSON directly;
- load the included example document;
- import previously exported settings; or
- add text and images from the visual editor.

Valid JSON is rendered automatically. Invalid input is annotated in the editor and printing/exporting is disabled until the document is valid again.

### 2. Add elements

- Click **Add Text** to add a text element.
- Double-click an empty position on a page to create text at that coordinate and immediately edit it.
- Click **Add Image**, then choose a PNG, JPEG, WebP, or GIF file.
- Use the **Text** and **Image** buttons in a page header to target a specific page.

Uploaded images are stored as data URLs inside the document JSON. Each image is limited to 2 MB.

### 3. Select and edit elements

Click an element to select it. The property panel provides exact controls for:

- X and Y coordinates in millimetres;
- width and height in millimetres;
- font family, font size, and text colour;
- rotation;
- layer or z-index; and
- position locking.

For text elements, the floating toolbar also provides bold, italic, underline, foreground colour, highlight colour, precision properties, duplicate, and delete actions.

Formatting uses an optimised live-preview transaction: the selected DOM element updates immediately, while JSON, history, and autosave changes are grouped and committed after a short debounce. This avoids rebuilding the entire canvas for every colour or numeric input event.

### 4. Move, resize, and edit text

- Drag an unlocked element to move it.
- Drag any of the eight resize handles to resize it.
- Hold `Shift` while resizing to preserve the aspect ratio.
- Hold `Alt` while resizing to resize from the centre.
- Double-click a text element to edit its content inline.
- Press `Enter` or click outside the element to save inline text changes.
- Press `Escape` while editing to cancel the change.

Magnetic snapping can be enabled or disabled from the print options. When enabled, visual guides help align elements with nearby items.

### 5. Select multiple elements

Use `Shift`, `Ctrl`, or `Cmd` while clicking elements to extend or toggle the current selection.

You can also drag a marquee on an empty page area:

- drag from left to right to select elements fully contained by the box;
- drag from right to left to select every element touched by the box;
- hold `Shift` to add the marquee result to the selection; or
- hold `Ctrl`/`Cmd` to toggle the marquee result.

The property panel can apply shared values to multiple elements. Alignment and distribution actions are available when at least two elements on the same page are selected.

### 6. Use a PDF as a placement guide

Choose an existing guide or upload a local PDF. The PDF is rendered beneath the printable elements and can be:

- shown or hidden on screen;
- displayed with adjustable opacity; and
- optionally included in the printed output.

Uploaded PDFs are stored locally in IndexedDB. PDF files are limited to 25 MB and 50 pages.

### 7. Calibrate the printer

Printer drivers may introduce small horizontal or vertical offsets. To calibrate:

1. Print a test page on blank paper.
2. Disable browser headers and footers.
3. Use no margins and a 100%/actual-size print scale.
4. Measure the printed calibration markers from the paper edges.
5. Enter the correction in **Offset X** and **Offset Y**.
6. Print another test and repeat until the layout is aligned.

For example, if an element prints 2 mm too far to the right, start with an X correction of `-2 mm`.

Calibration markers can be hidden independently in the screen preview and final print output.

### 8. Print or export

Before printing, confirm that the browser print dialog uses:

- paper size matching the target F4 sheet;
- scale set to 100% or actual size;
- no margins; and
- headers and footers disabled.

Use **Print** for the browser print workflow or **Export to HTML** to download a standalone document containing all rendered pages. Pending formatting transactions are automatically committed before print or export.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl + Y` or `Cmd + Shift + Z` | Redo |
| `Arrow keys` | Move selected elements by 0.1 mm |
| `Shift + Arrow keys` | Move selected elements by 1 mm |
| `Ctrl/Cmd + A` | Select all elements on the active page |
| `Ctrl/Cmd + D` | Duplicate selected elements |
| `Alt + L` | Lock or unlock selected elements |
| `Alt + A` / `Alt + H` / `Alt + D` | Align left / horizontal center / right |
| `Alt + W` / `Alt + V` / `Alt + S` | Align top / vertical center / bottom |
| `Alt + Shift + H` / `Alt + Shift + V` | Distribute horizontally / vertically |
| `Delete` / `Backspace` | Delete selected elements |
| `Escape` | Clear selection or close the active dialog/fullscreen view |

Keyboard shortcuts are ignored while typing in an input, textarea, inline text editor, or the JSON editor.

## Document Format

The document root is an array of debtor records. Each debtor contains ordered pages, and each page contains text or image items.

```json
[
  {
    "debitur": "Example Customer",
    "pages": [
      {
        "page_number": 1,
        "items": [
          {
            "type": "text",
            "text": "Example Customer",
            "x": 25,
            "y": 40,
            "width": 60,
            "height": 8,
            "font_family": "Arial, sans-serif",
            "font_size": 10,
            "color": "#111827",
            "bold": true,
            "italic": false,
            "underline": false,
            "rotation": 0,
            "z_index": 1,
            "locked": false
          }
        ]
      }
    ]
  }
]
```

### Item properties

| Property | Type | Description |
| --- | --- | --- |
| `type` | `"text"` or `"image"` | Defaults to text when omitted |
| `text` | string | Text content or an image data URL |
| `x`, `y` | number | Position in millimetres |
| `width`, `height` | number | Optional text box size; required for images |
| `font_family` | string | One of the supported font-family values |
| `font_size` | number | Text size from 4 to 72 pt |
| `color` | hex string | Text colour in `#rrggbb` format |
| `bg_color` | hex string | Text highlight colour in `#rrggbb` format |
| `bold`, `italic`, `underline` | boolean | Text formatting flags |
| `rotation` | number | Rotation from -360 to 360 degrees |
| `z_index` | integer | Layer value from -1000 to 1000 |
| `locked` | boolean | Prevents drag and resize interactions |

Supported fonts are Arial, Courier New, Times New Roman, Georgia, Verdana, and Plus Jakarta Sans using the exact values generated by the editor.

The schema rejects malformed values, unsupported image sources, unsafe colours, invalid page order, and elements outside the F4 page bounds.

## Local Storage and Offline Support

- Document JSON, calibration values, UI preferences, and application settings are stored in `localStorage`.
- Uploaded PDF overlays are stored in IndexedDB.
- The service worker precaches the application shell for offline use after the first successful visit.
- PWA installation and offline support require HTTPS or a localhost origin.
- Exported settings files are limited to 5 MB.

Clearing site data removes locally saved documents, settings, and PDF overlays. Export important settings before clearing browser storage.

## Project Structure

```text
Kartesian/
├── index.html                     Application shell and print-layout CSS
├── manifest.webmanifest           PWA metadata
├── sw.js                          App-shell cache and offline fallback
├── assets/
│   ├── app.css                    Compiled Tailwind CSS
│   ├── icons/                     PWA icons
│   └── vendor/                    Locally bundled browser dependencies
├── scripts/
│   └── copy-vendor.cjs            Copies pinned runtime dependencies
├── src/
│   ├── app.mjs                    Application composition root
│   ├── app/bootstrap.mjs          Startup and controller orchestration
│   ├── canvas/
│   │   ├── commands.mjs           Immutable document commands
│   │   ├── format-transaction.mjs Live preview and debounced commits
│   │   ├── interactions.mjs       Drag, resize, snapping, and selection
│   │   ├── keyboard-controller.mjs
│   │   └── renderer.mjs
│   ├── core/                      Configuration validation and utilities
│   ├── editor/                    Ace/textarea adapter and validation
│   ├── export/                    Standalone HTML export
│   ├── overlay/                   PDF overlay controller
│   ├── pwa/                       Service worker registration
│   ├── settings/                  Calibration and settings controller
│   ├── state/                     Undo/redo history
│   ├── storage/                   localStorage and IndexedDB adapters
│   └── ui/                        Toolbar, panels, dialogs, and onboarding
└── tests/
    ├── e2e/                       Playwright browser tests
    ├── fixtures/                  Valid and invalid document fixtures
    ├── support/                   Static test server and global setup
    └── regression.test.js         Unit and source-contract tests
```

## Available Commands

| Command | Description |
| --- | --- |
| `npm run build` | Copy vendor assets and compile Tailwind CSS |
| `npm run build:css` | Compile and minify Tailwind CSS |
| `npm run build:vendor` | Copy pinned browser dependencies into `assets/vendor` |
| `npm run dev:css` | Watch and rebuild Tailwind CSS |
| `npm run test:unit` | Run unit and regression checks |
| `npm run test:e2e` | Run the Playwright browser suite |
| `npm run test:e2e:headed` | Run Playwright with a visible browser |
| `npm run test:visual` | Run the visual baseline test |
| `npm run test` | Run unit and E2E tests |
| `npm run check` | Build the project and run the complete quality gate |
| `npm run audit` | Check npm dependencies for high-severity vulnerabilities |

Playwright uses the locally installed Microsoft Edge channel by default outside CI. Set `PW_BROWSER` to `chromium`, `firefox`, or `webkit` to select another installed Playwright engine.

```bash
PW_BROWSER=firefox npm run test:e2e
```

In PowerShell:

```powershell
$env:PW_BROWSER = 'firefox'
npm.cmd run test:e2e
```

## Testing and Quality

The test suite covers:

- document and settings schema validation;
- safe text and image rendering;
- editor validation and recovery;
- drag, inline editing, snapping, and eight-direction resize;
- single, multi, and marquee selection;
- alignment, keyboard shortcuts, and context menus;
- floating toolbar and property-panel synchronisation;
- debounced formatting without full canvas re-rendering;
- history transactions, autosave, settings import/export, and PDF persistence;
- print rules, standalone HTML export, PWA behaviour, and accessibility; and
- visual regression of the application panel.

Run the same quality gate used by the repository workflow:

```bash
npm run check
```

GitHub Actions first verifies the reproducible build, committed generated assets, unit/regression tests, and dependency audit on Node.js 24. It then runs the E2E suite against Chromium, Firefox, and WebKit. Failed browser jobs publish their traces, screenshots, JUnit results, and HTML report as workflow artifacts.

When an intentional UI change affects the visual baseline, update it with:

```bash
npm run test:e2e -- --update-snapshots
```

## Application Limits

| Resource | Limit |
| --- | ---: |
| Debtors | 100 |
| Pages per debtor | 100 |
| Items per page | 1,000 |
| Total document items | 5,000 |
| Image upload | 2 MB |
| Settings import | 5 MB |
| PDF upload | 25 MB / 50 pages |
| PDF canvas rendering | 20,000,000 pixels |

## Troubleshooting

### The page is blank or modules fail to load

Do not open `index.html` directly through `file://`. Start the local server and use `http://127.0.0.1:4173`.

### Styles are missing after changing Tailwind classes

Rebuild the stylesheet:

```bash
npm run build:css
```

Use `npm run dev:css` while actively editing UI styles.

### Changes do not appear after an update

The PWA may still have an older app-shell cache. Reload the page once after the new service worker activates. If necessary, clear the site's cached data in browser developer tools and reload.

### Printed coordinates do not match the preview

Verify the paper size, disable margins and browser headers/footers, use a 100% print scale, and then correct the physical difference using Offset X and Offset Y.

### PDF or images cannot be uploaded

Check the supported file types and application limits. PDF rendering also has a pixel limit to prevent excessive memory use.

### Playwright cannot find a browser executable

Install the requested Playwright browser:

```bash
npx playwright install chromium
```

Or run local tests through the installed Microsoft Edge channel by leaving `PW_BROWSER` unset.

## Security Notes

- Text is rendered with `textContent`, not injected as HTML.
- Image sources are restricted to supported base64 data URLs.
- Document and settings input are validated before use.
- Browser dependencies are pinned through npm and served locally.
- The test server sends Content Security Policy, referrer, permissions, and MIME-sniffing protection headers.
- Export serialization removes editor-only controls and unsafe runtime state.

## License

Kartesian is available under the [Apache License 2.0](LICENSE).

Printer behaviour varies by browser, driver, operating system, and hardware. Always verify calibration with a physical test print before production use.
