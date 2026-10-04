# Browser Cinema mode

The TV can play in its normal Chrome window but stalls when entering real fullscreen. Add a browser-window Cinema mode that enlarges the existing player with CSS. Keep its media element, source, playback session and current time. Do not call the Fullscreen API or change the media quality. Chrome's toolbar remains visible.

Design reference: `F:/Agent/kids-drive-cinema/2026-10-04-tv-cinema-v01/ready/other/tv-cinema-mode-concept-v01.png`. Created in Chrome > ChatGPT > Agent Assets before implementation. Original and ready artwork are recorded in that batch's `asset-manifest.json`.

Inventory and tokens: a single navy `#07111d` viewport canvas; fitted landscape video with no cropping or color overlay; native playback controls; coral `#ef5364` Cinema mode label at top left; white Exit Cinema mode button with navy text at top right. Use the app's Segoe UI font, 14px/650 label, 16px/650 exit control, 24px desktop gutter and 12px phone gutter. Keep both controls at least 44px high and keyboard reachable. No transitions, filters or decorative animation on the player.

Allowed Cinema view copy: Cinema mode, Exit Cinema mode, and native playback time/control labels. Normal watch view gains one Cinema mode entry button alongside the existing Back to videos action. A verified transparent coral widescreen PNG is the entry icon. The concept's illustrative cartoon is a design reference only; the actual approved Drive video supplies the frame. Native browser controls replace the drawn control bar. The video fills as much of the available browser area as its aspect ratio permits, intentionally removing the concept's extra media inset.

Component ownership: WatchView owns Cinema mode, entry/exit focus and Escape handling. Its existing playback effect remains independent of Cinema mode. CSS expands the player and hides surrounding navigation/details without unmounting media. Escape exits Cinema mode first; another Escape keeps the existing Back to videos behavior. Request `nofullscreen` on native controls and hide Chromium's fullscreen button to guide TV users to Cinema mode.

## Browser verification, 2026-10-04

Used the Codex in-app browser against the PC's LAN app at `http://192.168.18.195:5173/`. Played the same 1280x720 MKV episode pictured on the TV, Alphablocks S01E13 Alphalympics. Its time advanced from 32.02 seconds before entry to 32.36 in Cinema mode, 63.58 after the exit button, 64.05 after Escape, and 82.90 in the phone Cinema view. Each observation retained the same media blob source, readyState 4 and active playback. Exactly one video remained. `document.fullscreenElement` stayed null. Double-click also entered Cinema mode without actual fullscreen. Back to videos restored Home with no Cinema body class or attached player.

At the current 1536x1291 viewport, the player rectangle was exactly x=0, y=0, width=1536, height=1291. Checked the reference's native 1672x941 size and a 390x844 phone viewport. Phone Cinema mode measured exactly 390x844 with no horizontal overflow; its exit button was 44px high. Entry/exit focus returned to the correct button. Escape preserved the watch URL. Temporary viewport overrides were reset. A phone-entry screenshot taken during the existing drawer transition was replaced with its settled layout, where the drawer's right edge was zero.

`npm run build`, all six existing media/cache/HLS tests, and the changed-source whitespace check passed. The build retains its existing warning about the separately loaded HLS bundle exceeding 500KB. No new dependency or media conversion settings were needed. This browser verification does not establish the result on the physical TV; the user must try Cinema mode there. Older browsers can ignore the native `nofullscreen` hint, so the explicit Cinema mode button is the supported entry point.

## Final visual fidelity ledger

Used `view_image` to inspect the reference and rendered desktop/phone screenshots in the same QA pass. Browser screenshots are `.codex/tv-cinema-desktop-qa.jpg`, `.codex/tv-cinema-current-qa.jpg`, `.codex/tv-cinema-phone-qa.jpg`, and `.codex/tv-cinema-phone-entry-qa.jpg`. This implementation was faithfully verified against the accepted layout direction, with the intentional practical differences recorded here. No material visual mismatch remains.

| Point | Concept evidence | Render evidence and decision |
| --- | --- | --- |
| Copy | Cinema mode at top left; Exit Cinema mode at top right. | Exact labels retained. Above-the-fold copy comparison passed; only actual native times/controls vary. Normal watch view adds the planned Cinema mode entry action. |
| Layout | One landscape media canvas with surrounding navigation hidden. | The existing video fills the browser viewport; header, sidebar, watch details and Up next are hidden. Extra concept inset intentionally removed to maximize the TV picture. |
| Typography | Bold humanist labels with readable navy exit text. | Segoe UI uses deliberate 14px/16px weights of 650, with 13px/14px on phones. Labels are intentionally more compact than the concept drawing to obscure less video; exit height remains 44px. |
| Palette and effects | Dark navy surface, coral label, white exit control. | Exact navy #07111d, coral #ef5364 and white are retained. No added gradient, tint, filter or resizing animation; any bottom gradient comes from native media controls. |
| Media and artwork | Original nature frame is illustrative; coral widescreen entry icon is separate. | Actual approved Drive episode replaces the illustrative frame. Object-fit contain preserves all content and letterboxes phone portrait view. Verified transparent PNG icon loads in the entry control. Originals, ready files and manifest verified under F:/Agent. |
| Controls and spacing | Small corner overlays, seek/time/volume beneath media. | 24px desktop and 12px phone overlay gutters; rounded label/exit button. Native functioning media controls replace the concept's drawn controls. Chromium's fullscreen control is hidden. |
| Responsive behavior | Landscape reference. | Current desktop and native concept dimensions checked; phone adds letterboxing without cropping or horizontal overflow. Normal phone entry keeps both Back to videos and Cinema mode visible. |

Publication status is recorded after the existing Render auto-deployment is verified.
