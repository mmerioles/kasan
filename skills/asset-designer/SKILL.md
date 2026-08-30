---
name: asset-designer
description: Create or revise visual assets such as SVG icons, illustrations, logos, and raster images. Use when the user wants multiple visual directions, selectable options, or iterative asset refinement in Kasan.
---

# Asset Designer

Create assets in the format best suited to the project. Prefer hand-authored SVG for icons, logos, diagrams, and simple illustrations; use image-generation tools for raster concepts or imagery when available.

## Look at the asset before anyone else does

Authoring SVG is writing markup blind. Never present, commit, or describe an asset you have not rendered and viewed — `tools/` exists so there is no excuse:

```
node skills/asset-designer/tools/sheet.mjs a.svg b.svg --sizes=16,24,48,160 --out=sheet.png
node skills/asset-designer/tools/lint.mjs a.svg --min=16
node skills/asset-designer/tools/optimize.mjs a.svg --write
node skills/asset-designer/tools/page.mjs site/index.html --widths=390,1200
```

- **`sheet.mjs`** puts every candidate at every target size on light and dark paper in **one** image. Read that image. Comparing a set side by side is the point — separate renders cannot tell you which option is strongest, or that the 16px version has collapsed into mush.
- **`lint.mjs`** catches what the eye cannot: geometry escaping the viewBox, strokes too thin to survive the small size, ink that vanishes against one theme, live `<text>`, external references. Non-zero exit means do not ship it.
- **`optimize.mjs`** runs svgo and then *renders both versions and compares pixels*, because svgo silently eats filter chains. It refuses to write when the picture moved. Around 0.01% differing pixels is the antialiasing floor; a percent or more is damage.
- **`page.mjs`** shoots the real page. An icon judged in isolation is judged wrong — optical weight only reads next to the type it ships beside.

**Render with Chromium, never `rsvg-convert`.** It is installed on this box and it renders CSS-styled SVG — custom properties, class selectors — as solid black shapes. It will tell you a correct asset is broken. The tools already use Chromium.

## Draw from the real palette

`tokens.json` holds the site's actual light and dark values (`site/index.html`). Use those names and values rather than inventing hex codes, and give every asset a deliberate answer for both themes — check the dark row of the contact sheet, not just the light one. A dark accent is not a dimmed light one.

Only Liberation and Noto fonts exist here, so any other `font-family` silently substitutes. Convert text to paths in shipped assets.

## Presenting options

When the user asks for options, create a Kasan artifact batch:

1. Create `.kasan/artifacts/<batch-id>/` in the current repository. Use a short unique batch ID made of letters, numbers, dots, underscores, or hyphens.
2. Write 2–6 meaningfully distinct assets into that directory. Keep each file below 8 MB. Supported preview formats are SVG, PNG, JPEG, WebP, and GIF.
3. Render and lint them, and look at the contact sheet, before writing the manifest.
4. Write `manifest.json` only after the assets are complete. Use this shape:

```json
{
  "version": 1,
  "id": "baguette-01",
  "session": "$KASAN_SESSION_ID",
  "title": "Baguette icon directions",
  "prompt": "Choose the direction you want to refine.",
  "multiple": false,
  "artifacts": [
    {
      "id": "soft-sketch",
      "file": "soft-sketch.svg",
      "label": "Soft sketch",
      "description": "Warm fill with a loose ink outline"
    }
  ]
}
```

Set `session` to the literal value of the `KASAN_SESSION_ID` environment variable. Every session in a folder shares `.kasan/artifacts`, and this is what stops your batch from surfacing as a stray picker in someone else's conversation.

The manifest ID must equal its containing directory name. Asset `file` values must be filenames in that same directory, not paths. IDs must be unique within the batch.

**Offer a batch only when the user asked for options.** A picker is a question; do not ask one that was not invited, and do not re-offer a batch the user declined to answer — a silent user has answered.

For a revision after the user selects an option, preserve the selected source, create a new batch with a new ID, and make the requested differences easy to compare. Do not overwrite a previously presented batch.

For SVG assets, include a `viewBox`, avoid external resources and scripts, keep shapes legible at target size, and add a concise `<title>` when the asset conveys meaning.
