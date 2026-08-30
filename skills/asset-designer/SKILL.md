---
name: asset-designer
description: Create or revise visual assets such as SVG icons, illustrations, logos, and raster images. Use when the user wants multiple visual directions, selectable options, or iterative asset refinement in Kasan.
---

# Asset Designer

Create assets in the format best suited to the project. Prefer hand-authored SVG for icons, logos, diagrams, and simple illustrations; use image-generation tools for raster concepts or imagery when available.

When the user asks for options, create a Kasan artifact batch:

1. Create `.kasan/artifacts/<batch-id>/` in the current repository. Use a short unique batch ID made of letters, numbers, dots, underscores, or hyphens.
2. Write 2–6 meaningfully distinct assets into that directory. Keep each file below 8 MB. Supported preview formats are SVG, PNG, JPEG, WebP, and GIF.
3. Inspect or render the assets before presenting them. For SVG, check the source plus a browser or rasterized preview, including the smallest size where it will be used.
4. Write `manifest.json` only after the assets are complete. Use this shape:

```json
{
  "version": 1,
  "id": "baguette-01",
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

The manifest ID must equal its containing directory name. Asset `file` values must be filenames in that same directory, not paths. IDs must be unique within the batch.

For a revision after the user selects an option, preserve the selected source, create a new batch with a new ID, and make the requested differences easy to compare. Do not overwrite a previously presented batch.

For SVG assets, include a `viewBox`, avoid external resources and scripts, keep shapes legible at target size, and add a concise `<title>` when the asset conveys meaning. Optimize with `svgo` when optimization will not erase intentional hand-drawn details.
