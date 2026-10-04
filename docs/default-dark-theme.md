# Default dark theme

The app opens in dark mode on every device, independent of the device's theme preference. Shared CSS tokens provide a #0f1117 page, #202632 raised controls, #f1f5fc primary text and #ff6b7c coral accents. The HTML declares a dark color scheme before the app loads and uses the matching browser theme color. Native form controls, mobile navigation, the folder drawer, loading/empty/error states, watch controls, Cinema overlays and Shorts controls use the same palette.

This is a color-only update to the existing presentation. Video frames, thumbnails, runtime PNG artwork, typography, layout, player behavior and dependencies remain unchanged. Coral-filled controls use dark text for contrast; selected navigation uses a dark coral fill with bright text. Shared tokens replace the former light surface overrides.

## Reference and inventory

Created the opaque 1672x941 desktop color reference in Chrome > ChatGPT > Agent Assets before implementation. Verified the untouched original, identical ready copy and manifest under `F:/Agent/kids-drive-cinema/2026-10-04-default-dark-theme-v01/`. The ready reference is `ready/other/default-dark-theme-concept-v01.png`, RGB, SHA-256 `5546981c1f05a6d7775d865137bc6556063b9635328f2a7dc5c4a98e5416ee2d`. Opaque is appropriate for this complete reference screen. No new independent visual asset is needed; existing verified projector, Shorts and Cinema PNGs remain in use.

The implementation inventory is the existing header/search, sidebar/folders, quick folder chips, three-column video grid, Shorts shelf, watch/up-next view, Cinema controls, phone drawer and bottom navigation. Existing labels and library data are the copy specification. The generated reference's illustrative video titles, folder names, extra menu symbols and row placement are not new app requirements.

## Verification, 2026-10-04

Production build and changed-source whitespace checks passed. The existing HLS chunk size warning remains. Checked the finished LAN app on port 5174 in the Codex Chromium browser at the current viewport, 1672x941 desktop and 390x844 phone sizes. Computed page background was rgb(15,17,23), primary text rgb(241,245,252), native color scheme dark, and search/sort/quality controls rgb(32,38,50). Search returned the expected empty state; folder navigation and Saved empty state worked. Phone drawer and bottom navigation were dark, with no horizontal overflow. No console errors were captured during these checks.

The real 1280x720 Alphablocks episode played with readyState 4 and no media error. Entering Cinema mode retained playback (47.93 seconds before entry, 48.31 after) without requesting fullscreen; both dark Cinema controls were 44px high. The real 1280x720 Short played to 67.01 seconds, paused through its control, and resumed at 67.22 seconds. Returned Home with no attached video and cleared temporary viewport overrides. These checks establish desktop browser behavior; the physical TV needs a refresh to load the update.

Calculated text contrast ratios: primary text/page 17.26:1, secondary text/raised controls 7.16:1, muted text/page 7.13:1, coral text/selected fill 5.48:1 and dark text/coral controls 6.87:1.

## Visual fidelity ledger

Inspected the reference and latest desktop, phone, watch and Cinema screenshots with `view_image` in the same QA pass.

| Point | Implementation decision and check |
| --- | --- |
| Palette | Matches the locked dark background, raised surfaces, light text and coral selection palette. Native controls declare dark mode. |
| Copy | Preserves the actual Home, Shorts, Continue, Saved, Folders, Videos, search and player labels; reference-only sample titles/folders are intentionally excluded. |
| Layout | Preserves the existing header/sidebar dimensions, grid and Shorts shelf placement; no layout redesign was requested. |
| Typography and spacing | Existing Segoe UI sizes, weights, rounded controls, gutters and breakpoints remain intact. |
| Artwork and media | Actual approved videos and existing runtime PNGs replace illustrative reference artwork; thumbnails and video frames receive no tint or filter. |
| Responsive states | Phone navigation/drawer and single-column library match the shared palette without overflow. Cinema and Shorts controls remain readable on dark surfaces. |

The render follows the requested dark theme and existing layout. The documented reference-only differences are intentional, with no remaining mismatch in the requested theme scope.
