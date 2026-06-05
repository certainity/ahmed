# Polish Gallery — Development Plan & Architecture

A roadmap to grow the current photo gallery into a full-featured editor with
**feature parity to "Polish — Photo Editor & Collage"**: an offline, all-in-one
gallery + editor + retouch + collage studio.

---

## 1. Vision

| Pillar | Goal |
|---|---|
| **Browse** | Fast gallery with albums, search, multi-select, favorites |
| **Edit** | Filters, fine adjustments, crop/straighten, transform |
| **Create** | Text, stickers, doodle, frames, mosaic, backgrounds |
| **Retouch** | Skin smooth, blemish heal, teeth/eye, reshape & body |
| **Collage** | Grid + freestyle layouts, templates, posters |
| **Share** | Save (quality options), resize for social, share sheet |

Everything runs **on-device / offline**. No account, no network required.

---

## 2. Current State — v1.2 ✅

| Area | Status |
|---|---|
| 3-column photo grid (MediaStore) | ✅ Done |
| Multi-select mode | ✅ UI done (actions not wired) |
| Full-screen viewer, swipe + pinch-zoom | ✅ Done |
| Share photo | ✅ Done |
| Delete photo | ⚠️ Button present, **not wired** |
| Editor: 10 color filters | ✅ Done |
| Editor: Adjust (brightness, contrast, saturation, warmth) | ✅ Done |
| Editor: Rotate / Flip | ✅ Done |
| Editor: Save to gallery | ✅ Done |
| Runtime permissions (API 24–34) | ✅ Done |
| Hold-to-compare original | ✅ Done |

The foundation (gallery → viewer → editor flow, bitmap pipeline, MediaStore I/O)
is solid. The plan below builds on it without throwing it away.

---

## 3. Target Feature Set (Polish parity)

Legend: ✅ done · 🟡 partial · ⬜ planned

### A. Gallery & Browse
| Feature | Status |
|---|---|
| Photo grid | ✅ |
| Albums / folders view | ⬜ |
| Favorites | ⬜ |
| Search by album / date | ⬜ |
| Multi-select → share / delete / move | 🟡 |
| Sort (date, name, size) | ⬜ |
| Camera capture entry | ⬜ |

### B. Core Editing
| Feature | Status |
|---|---|
| Preset filters | ✅ (10) |
| Filter intensity slider | ⬜ |
| Adjust: brightness, contrast, saturation, warmth | ✅ |
| Adjust: exposure, highlights, shadows, temperature, tint, sharpness, vibrance, hue, vignette, grain, fade | ⬜ |
| Crop with aspect ratios (1:1, 4:5, 4:3, 16:9, 9:16, free) | ⬜ |
| Straighten (rotate by angle) | ⬜ |
| Rotate 90° / Flip H / Flip V | ✅ |

### C. Creative Overlays
| Feature | Status |
|---|---|
| Text (fonts, color, align, shadow, background) | ⬜ |
| Stickers & emoji (packs) | ⬜ |
| Doodle / brush (size, color, neon, eraser) | ⬜ |
| Frames & borders | ⬜ |
| Mosaic / pixelate (censor) | ⬜ |
| Light leaks / overlay effects | ⬜ |

### D. Retouch & Beauty
| Feature | Status |
|---|---|
| Skin smooth | ⬜ |
| Blemish / spot heal | ⬜ |
| Teeth whiten | ⬜ |
| Eye brighten / enlarge | ⬜ |
| Reshape / liquify | ⬜ |
| Body: slim, height, abs | ⬜ |
| Makeup | ⬜ (stretch) |

### E. Background
| Feature | Status |
|---|---|
| Background blur / bokeh (radial & linear) | ⬜ |
| Auto cutout (subject segmentation) | ⬜ |
| Background replace (color / gradient / image) | ⬜ |
| Mirror effect | ⬜ |

### F. Collage
| Feature | Status |
|---|---|
| Grid layouts (2–9 photos) | ⬜ |
| Freestyle collage | ⬜ |
| Photo stitch (long strip) | ⬜ |
| Templates / posters | ⬜ |
| Border width, corner radius, background | ⬜ |

### G. Export & Share
| Feature | Status |
|---|---|
| Save to gallery | ✅ |
| Quality / format options (JPEG/PNG, size) | ⬜ |
| Resize for social (IG post/story, FB, etc.) | ⬜ |
| Share sheet | ✅ |

---

## 4. Architecture

### Patterns
- **MVVM** — `EditorViewModel` holds edit state; survives rotation/process death.
- **Layer-based editor** — a base bitmap plus a stack of overlay layers
  (text, stickers, doodle) composited only at export. Overlays stay editable.
- **Non-destructive adjustments** — store parameters (filter id, slider values,
  crop rect, transforms); re-render from source on demand for full quality.
- **Command pattern undo/redo** — every tool emits an `EditOperation` pushed
  onto an `EditHistory` stack.
- **Coroutines** — all bitmap work on `Dispatchers.Default/IO`, never main.
- **Repository layer** — `MediaStoreRepository`, `AssetRepository` (fonts,
  stickers, frames) decouple data from UI.

### Rendering pipeline (export & preview)
```
source bitmap
   ─► transform   (rotate / flip / straighten)
   ─► crop        (rect)
   ─► adjust      (ColorMatrix / GPU shader)
   ─► filter      (preset, with intensity)
   ─► retouch     (localized pixel ops)
   ─► overlays    (draw text / sticker / doodle / frame layers)
   ─► output bitmap ─► encode (JPEG/PNG) ─► MediaStore
```
Preview uses a **downscaled** proxy bitmap for speed; export re-runs the same
pipeline on the **full-resolution** source.

---

## 5. Editor Engine (framework)

The heart of the app. Each tool implements a common contract so the editor host
can host any number of tools uniformly.

```kotlin
// engine/EditTool.kt
interface EditTool {
    val id: ToolId
    val title: String
    val icon: Int
    fun createPanel(host: EditorHost): ToolPanel   // bottom UI for the tool
}

// engine/EditOperation.kt — one undoable change
interface EditOperation { fun apply(s: EditState): EditState
                          fun revert(s: EditState): EditState }

// engine/EditHistory.kt — undo / redo stacks
// engine/EditState.kt   — immutable snapshot (adjustments, filter, crop,
//                          transform, layers[])
// engine/Layer.kt       — sealed: ImageLayer | TextLayer | StickerLayer |
//                          DrawLayer | FrameLayer
// engine/render/*       — FilterRenderer, AdjustRenderer, BlurRenderer,
//                          CropRenderer, OverlayCompositor
```

Custom views (in `ui/editor/widget/`):
- `CropOverlayView` — draggable crop rect + grid + aspect lock + straighten dial
- `LayerCanvasView` — hosts/positions/rotates/scales overlay layers via touch
- `BrushView` — doodle strokes
- `LiquifyView` — mesh warp for reshape

---

## 6. Navigation & Screens

```
MainActivity  (bottom nav)
 ├─ Photos      → GalleryFragment        (grid)
 ├─ Albums      → AlbumsFragment         (folders → grid)
 ├─ Collage     → CollageActivity        (picker → layout editor)
 └─ Camera      → system camera / capture
        │ tap photo
        ▼
 PhotoViewerActivity ──[Edit]──► EditorActivity
                                  ├ top bar:   back · undo · redo · compare · Save
                                  ├ canvas:    photo + live preview + overlays
                                  └ tool rail: Filter · Adjust · Crop · Transform ·
                                               Retouch · Text · Sticker · Draw ·
                                               Frame · Blur · Cutout · Mosaic
```
Each tool swaps a **bottom panel** + binds gestures on the canvas. Switching
tools commits/*previews* without leaving the editor.

---

## 7. Data Models

```kotlin
Photo(id, uri, displayName, size, dateAdded, bucketName)      // ✅ exists
Album(id, name, coverUri, count)                              // ⬜
PhotoFilter(name, lut/colorMatrix, thumb)                     // ✅ exists
Adjustment(exposure, contrast, saturation, temp, tint, …)    // ⬜ expand
CropConfig(rect, aspect, angle)                              // ⬜
TextLayer(text, font, color, size, pos, rotation, bg)        // ⬜
StickerLayer(assetId, pos, scale, rotation)                  // ⬜
DrawLayer(strokes[])                                         // ⬜
FrameSpec(assetId | borderColor | width | radius)            // ⬜
CollageTemplate(slots[], spacing, ratio, background)         // ⬜
EditState(source, transform, crop, adjust, filter, layers[]) // ⬜ engine core
```

---

## 8. Dependencies to add (per phase)

| Library | Purpose | Phase |
|---|---|---|
| `jp.co.cyberagent.android:gpuimage:2.1.0` | GPU filters & real-time blur on large images | 1/3 |
| `androidx.lifecycle:lifecycle-viewmodel-ktx` | Editor ViewModel | 1 |
| `com.google.mlkit:segmentation-selfie` | On-device subject cutout | 5 |
| `androidx.exifinterface:exifinterface` | Honor photo orientation on load | 1 |
| Custom views | Crop, layers, brush, liquify | 1–4 |

> Crop, text, stickers, doodle, collage are built as **custom views** for full
> control and a consistent UI, rather than pulling heavyweight all-in-one libs.

---

## 9. Roadmap (phased milestones)

### Phase 1 — Editor foundation + Crop + full Adjust  *(core)*
- Introduce `EditorViewModel` + `EditState` + `EditHistory` (undo/redo).
- Migrate existing filters/adjust/transform onto the engine.
- **Crop & Straighten** tool (aspect ratios + angle dial).
- Expand **Adjust**: exposure, highlights, shadows, temperature, tint,
  sharpness, vibrance, vignette, grain, fade.
- Filter **intensity** slider.
- Wire **Delete** in viewer + gallery multi-select actions.

### Phase 2 — Creative overlays
- `LayerCanvasView` overlay system (move/scale/rotate/delete).
- **Text** tool (fonts, color, align, shadow, background pill).
- **Stickers / emoji** (bundled packs + recent).
- **Doodle** (brush size/color, neon glow, eraser).
- **Frames & borders**.

### Phase 3 — Advanced photo tools
- **Background blur / bokeh** (radial + linear, GPU).
- **Mosaic / pixelate** (brush to censor).
- **Effect overlays** (light leaks, dust, grain blends).

### Phase 4 — Retouch & Beauty
- **Smooth**, **Heal** (clone/patch), **Teeth whiten**, **Eye** brighten.
- **Reshape / Liquify** (mesh warp via `LiquifyView`).
- **Body**: slim / height / waist.

### Phase 5 — Background cutout & replace
- ML Kit subject segmentation → mask.
- Manual refine brush.
- Replace background: color / gradient / photo. **Mirror** effect.

### Phase 6 — Collage studio
- Grid layouts (2–9), freestyle, photo-stitch.
- Templates / posters, border, radius, background.

### Phase 7 — Gallery UX & export polish
- Albums, favorites, search, sort.
- Camera capture.
- Export quality/format, social resize presets.
- Settings (theme, default save folder, quality).

---

## 10. Target Project Structure

```
com.ahmed.photogallery/
├── PhotoGalleryApp.kt                # Application (Glide config, asset preload)
├── MainActivity.kt                   # bottom-nav host
├── ui/
│   ├── gallery/                      # GalleryFragment, GalleryAdapter
│   ├── albums/                       # AlbumsFragment, AlbumAdapter
│   ├── viewer/                       # PhotoViewerActivity
│   ├── editor/
│   │   ├── EditorActivity.kt
│   │   ├── EditorViewModel.kt
│   │   ├── panel/                    # FilterPanel, AdjustPanel, CropPanel, …
│   │   └── widget/                   # CropOverlayView, LayerCanvasView, BrushView
│   ├── collage/                      # CollageActivity, layout editor
│   └── common/                       # shared views, dialogs, extensions
├── engine/                           # editing framework (no Android UI deps)
│   ├── EditTool.kt  EditOperation.kt  EditHistory.kt  EditState.kt  Layer.kt
│   └── render/                       # FilterRenderer, AdjustRenderer, BlurRenderer…
├── model/                            # Photo, Album, PhotoFilter, Adjustment, …
├── data/                             # MediaStoreRepository, AssetRepository
└── utils/                            # BitmapUtils, MediaStoreUtils, PermissionUtils
```

Existing files (`EditorActivity`, `GalleryFragment`, `PhotoViewerActivity`,
`adapter/*`, `utils/*`) migrate into this tree during Phase 1.

---

## 11. Definition of Done (per tool)
- [ ] Works on full-res export, previews on proxy
- [ ] Undo / redo integrated
- [ ] No main-thread bitmap work; cancels on tool switch
- [ ] Memory-safe (recycles intermediates; handles large images)
- [ ] Dark theme + accent (#FF2D78) consistent UI
- [ ] Verified on API 24 and API 34

---

*This document is the source of truth for scope. Each phase ships as its own
commit set on `claude/photo-gallery-folder-2gKUX`.*
