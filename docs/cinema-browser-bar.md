# Cinema mode and browser bars

The optional Hide browser bar control was removed after the physical TV reported that it paused and stalled playback. The control requested real browser fullscreen, bringing back the same TV problem that CSS Cinema mode avoids. Cinema now enlarges the existing inline player with CSS only and offers Exit Cinema mode. Entering, exiting and Escape do not request browser fullscreen or restart the stream. Chrome's tabs and address bar remain visible; the page cannot hide that browser-owned UI with CSS. Reload the TV's page on port 5174 after rebuilding the app to remove the old control.

Cinema mode can be reached without a mouse: opening a video focuses its Cinema mode button with a visible coral outline, ready for OK/Enter. Press C to enter or exit; Up from the video or page focuses the Cinema button (or Exit while in Cinema). Escape still exits Cinema first. These shortcuts leave search fields, quality selects, editable text and modified browser shortcuts alone. The watch page and video explicitly request a normal cursor; the app cannot restore a pointer hidden by the TV's mouse mode, browser or disconnected mouse. Keyboard input from the physical TV remote still needs checking on that device.

The following records the previous implementation and its PC checks. Those checks did not establish compatibility with the physical TV and do not describe the current controls.

## Previous implementation

Cinema mode now offers a separate Hide browser bar button for the TV's Chrome tabs/address strip. Default Cinema entry remains the CSS view. Hide browser bar requests fullscreen on the HTML page with `navigationUI: 'hide'`, preserving the inline player and its current stream. The button changes to Show browser bar after a successful fullscreen change. Exit Cinema mode restores page fullscreen owned by this view; Escape and component cleanup also restore it. Playback initialization does not depend on either Cinema or browser-bar state.

The browser must permit the request from a user click. Unsupported or rejected requests show a short status message and keep Cinema mode available. This uses real page fullscreen, so it cannot guarantee that the physical TV avoids its previous fullscreen slowdown. The successful browser checks below establish PC behavior only. See [MDN requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) for navigation UI and activation requirements.

## Design reference and assets

Before implementation, generated the full Cinema reference in Chrome > ChatGPT > Agent Assets. The untouched original, inspected ready PNG and verified manifest are under `F:/Agent/kids-drive-cinema/2026-10-04-hide-browser-bar-v01/`. The reference is `ready/other/cinema-hide-browser-bar-concept-v01.png`, 1672x941, opaque RGB, with identical original/ready SHA-256 `eccf3d14eef237823259e157ef58dc03d39f2dd3a5a7b96c6693a8aa7767667f`. A full reference scene may be opaque. No new independent icon is needed; the existing verified Cinema PNG remains the entry icon. The concept frame is not embedded into runtime playback.

Inventory and tokens: the existing navy #07111d media canvas, coral #ef5364 Cinema label, white controls with navy #17213b text, and two functional native text buttons. Segoe UI, control type 16px/650 on desktop and 14px/650 on phones. Minimum 44px button height, 12px desktop button gap, 24px desktop and 12px phone overlay gutters. Phone buttons stack with an 8px gap. Preserve existing rounded controls, fitted video, and native seek/volume controls; add no animation, filter or transition to the player.

## Verification, 2026-10-04

Built production assets successfully and passed changed-source whitespace checks. The existing separately loaded HLS bundle size warning remains. No dependency or video conversion changes were made.

Used the local LAN app at `http://192.168.18.195:5173/` with the real Alphablocks S01E13 Alphalympics video, 1280x720. In the Codex Chromium browser, default Cinema entry did not fullscreen the page. Hide browser bar made HTML match `:fullscreen` and changed its button's pressed state and copy. Show browser bar cleared fullscreen while Cinema stayed active. Hide followed by Exit cleared both modes and returned focus to the Cinema entry. Escape also cleared both modes and preserved the watch URL. These observations retained one video with the same blob source, readyState 4 and active playback: 0.33 seconds on Cinema entry, 11.62 after Hide, 48.05 after Show, 61.37 after Exit, and 153.47 after Escape. The read-only browser inspection does not expose `document.fullscreenElement`; DOM `:fullscreen` matching and the app's fullscreen-change state establish the element instead.

The automated external Chrome request was refused. Its status message appeared, the button re-enabled, Cinema remained active and the same source kept playing (33.65 seconds). This verifies the rejection fallback, not successful fullscreen in that external Chrome session. Physical TV validation remains pending.

Checked the current desktop view, the reference's native 1672x941 dimensions, and 390x844 phone view. At native dimensions the fixed player was exactly 1672x941 at x=0,y=0; both buttons measured 44px high. The phone player was exactly 390x844 with scrollWidth 390; buttons were 44px high, stacked at y=12 and y=64, inside the viewport. All temporary viewport overrides were reset. The local app returned Home with no attached video and neither mode active.

Screenshots: `.codex/browser-bar-qa/cinema-fullscreen.png`, `cinema-desktop.png`, `cinema-phone.png`, and `cinema-chrome-denied.png`. The first is successful page fullscreen; the last shows the rejection status after the episode finished. The earlier `cinema-chrome.png` was taken while its request was pending and must not be used as proof of successful external Chrome fullscreen.

## Visual fidelity ledger

The generated reference and latest desktop/phone/fullscreen renders were inspected with `view_image` in the same QA pass. Above-the-fold copy and layout comparisons passed with the intentional deviations below.

| Point | Reference | Verified render and decision |
| --- | --- | --- |
| Copy | Cinema mode, Hide browser bar, Exit Cinema mode | Exact labels retained. Successful fullscreen changes Hide to Show browser bar; denial adds the required status message. |
| Layout | Label left, two controls right, one landscape video | Matches desktop positions. The existing player fills the viewport to maximize the TV picture; the reference's extra video inset is intentionally removed. |
| Typography | Readable bold labels, navy text on white | Segoe UI 14px/650 label and 16px/650 controls; phone 13px/14px. Buttons remain 44px high. Compact type obscures less video. |
| Palette and effects | Navy canvas, coral label, white controls | Existing exact app colors retained. No new animation, tint or filter. Native media controls supply their own bottom contrast treatment. |
| Control shape and spacing | Rounded rectangular controls, separate corner groups | Existing pill-shaped Cinema controls intentionally preserved; 24px desktop/12px phone gutters and 12px button gap. |
| Media and artwork | Original nature cartoon and drawn seek bar | Actual approved Drive episode supplies the frame. Native working video controls replace the drawn bar; object-fit contain preserves every edge. Reference originals/ready/manifest verified in F:/Agent. |
| Responsive behavior | Landscape concept | Desktop/native-size renders checked; phone stacks buttons and letterboxes the video without horizontal overflow. Fullscreen screenshot uses the browser's physical screen allocation. |

The feature follows the accepted existing Cinema presentation and requested browser-bar action. No material visual mismatch remains beyond the recorded intentional differences. Deployment status is verified separately after pushing the existing main branch.
