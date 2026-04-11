# Instagram Marketing Assets

All marketing materials are now centralized under `marketing/instagram`.

## Folder layout

- `ads/` - ordered campaign assets (story/post/carousel + references + branding).
- `templates/` - HTML sources used to generate post images.
- `outputs/` - exported PNG sets (grouped by campaign/version), each with `manifest.json`.
- `bundles/` - ZIP packages for delivery/share.
- `scripts/` - helper scripts for local export automation.

## Naming convention

Files in `ads/` use a uniform pattern:

`NN-type-topic.ext`

- `NN` = sequence order (`01`, `02`, ...)
- `type` = `story` or `post`
- `topic` = short descriptive slug

Examples:

- `01-story-replies-launch.png`
- `04-post-replies-launch.png`
- `03-post-carousel-pro-e-slide-03.png`

## Ads structure

- `ads/01-content-sequence/` - ordered single creatives (story + post).
- `ads/02-post-carousel-main/` - main carousel campaign (`source/`, `output/`, `refs/`).
- `ads/03-post-carousel-pro-e/` - pro-e carousel variant (`source/`, `output/`, `refs/`).
- `ads/04-branding/` - branding/profile images.

## Export script

Default run:

```bash
node marketing/instagram/scripts/export-instagram-posts.cjs
```

With explicit args:

```bash
node marketing/instagram/scripts/export-instagram-posts.cjs \
  --input marketing/instagram/templates/sayback-instagram-pack-v3.html \
  --out marketing/instagram/outputs/pack-v3 \
  --prefix sayback-instagram-v3
```

## Prism campaign (10 posts + 5 stories)

Generate campaign images:

```bash
node marketing/instagram/scripts/export-instagram-campaign.cjs \
  --input marketing/instagram/templates/sayback-instagram-prism-campaign-v1.html \
  --out marketing/instagram/outputs/prism-campaign-v1 \
  --prefix sayback-prism-v1
```

Run campaign QA (sizes, safe areas, overlap checks):

```bash
node marketing/instagram/scripts/qa-instagram-campaign.cjs \
  --input marketing/instagram/templates/sayback-instagram-prism-campaign-v1.html \
  --report marketing/instagram/outputs/prism-campaign-v1/qa-report.json
```
