# HD playback from the home PC

The existing HEVC/10-bit conversion fallback uses a 1280-pixel ceiling and CRF 30. Ice Age's approved Drive source is 1920 × 1040, so that fallback loses source detail. The home PC now offers Auto, 720p HD and 1080p HD on the watch toolbar, with 1080p as its initial default. An actual decoded-resolution label appears below the video. Changing quality saves the current scene; the stored quality is reused on later visits.

`ENABLE_HD_PLAYBACK=true` is saved only in this PC's ignored `server/.env`. The committed example defaults to false. `/api/playback-config` advertises the available profiles, so free hosted servers retain Auto and the existing codec-copy/conversion behavior. Leave HD conversion disabled on Render's free server. Shorts retains its existing Auto behavior.

The HD profiles produce H.264 Main, 8-bit yuv420p, level 4.1, at up to 1920 × 1080 or 1280 × 720, with AAC stereo. Scale preserves the source aspect ratio, uses square pixels and never enlarges smaller sources. HD output is capped at 30fps and approximately 6Mbps/3.5Mbps video. The 1080p profile uses CRF 21; 720p uses CRF 22. Actual quality still depends on the source, TV decoder and available bandwidth. A 720p/SD source cannot gain detail by selecting 1080p.

HD requests use separate versioned cache folders and segment URLs. When resuming or switching, FFmpeg seeks the approved source to four seconds before the requested scene, and HLS.js places the converted fragments on the original movie timeline. Startup buffer checks use time relative to that offset. This avoids converting all earlier scenes before playback. Native HLS browsers use a complete conversion timeline from zero; Chrome uses HLS.js. Unused HD jobs stop after 90–120 seconds without playlist/segment requests. Video IDs and segments still pass the existing approved-folder checks; qualities are allowlisted and offsets are bounded by the source duration.

The native seek bar reflects the portion currently converted; its available end grows as conversion continues. Movie duration remains visible below the title. Drive is still the source, so the PC needs an internet connection while fetching uncached data. The PC must remain running while the TV uses its LAN address.

## Design and artwork

Created the watch-toolbar reference in Chrome > ChatGPT > Agent Assets before implementation. Downloaded PNG originals and checked ready copies are under `F:/Agent/kids-drive-cinema/2026-10-04-local-hd-v01/`, with a verified `asset-manifest.json`. The full-screen opaque reference is 1672 × 941. The existing verified transparent Cinema PNG remains the runtime icon. The new select and text are native UI controls.

Tokens: white #ffffff surface, navy #17213b text, pale coral #fff0f2 Cinema control, coral #ef5364 accents. Keep the established Segoe UI typography. Quality select: 14px/600, 44px minimum height, 10px radius, thin gray border. Watch options: 12px desktop gap and 8px phone gap. Decoded resolution: 13px/20px, muted navy, above the existing title. On narrow phones the toolbar wraps; the accessible Quality name remains while its visible label is hidden. Cinema mode retains the same media element and uses CSS only.

Allowed additions: Quality; Auto; 720p HD; 1080p HD; Playing: actual width × height; Preparing selected quality HD. No extra navigation or generated sample videos are added. Existing sidebar, brand, library, playback actions and recommendations retain their real approved content. The concept's invented Like/Share, notification/avatar and navigation labels are excluded because they are outside this change and conflict with the established app.

## Verification, 2026-10-04

`npm run build`, server syntax checking, the six existing tests and two new capability/resume/cache tests passed. A separate real FFmpeg encoding check using generated 2-second inputs proved 1920 × 1040 stays 1920 × 1040 at 1080p, becomes 1280 × 694 at 720p, and a 640 × 360 source stays 640 × 360. All three outputs were H.264 Main, level 4.1, yuv420p, 30fps. Results are `.codex/hd-encoding-qa/results.json`. The existing lazy HLS bundle size warning remains.

Real Ice Age playback was verified in the in-app browser through `http://192.168.18.195:5173/`: decoded width 1920, height 1040, readyState 4 and active playback. At 228.998 seconds, entering Cinema mode kept the same blob source and advanced to 229.328 seconds, with one video and no fullscreen element. Its canvas measured 1672 × 941 at x=0/y=0. Switching to 720p at 244.931 seconds resumed that original timeline; a subsequent reading was 284.278 seconds, 1280 × 694, readyState 4, playing. The 390 × 844 phone Cinema canvas continued at 285.106 seconds without actual fullscreen or horizontal overflow. The phone select and Cinema button are both 44px high.

A first 720p browser check exposed a non-square sample aspect ratio that made Chrome report 1281 pixels; square pixels and a new HD cache version fixed it. Development server restarts briefly reset requests during implementation; final playback checks used the settled server. This is browser verification, not physical-TV proof. The user should refresh the TV's LAN page, select 1080p HD, and use Cinema mode. If its hardware still buffers, choose 720p HD.

## Fidelity ledger

Used `view_image` on the accepted reference and current browser screenshot in the same QA pass, then checked the phone screenshot. Desktop screenshot: `.codex/hd-watch-desktop-qa.jpg`; phone: `.codex/hd-watch-phone-qa.jpg`; Cinema screenshots: `.codex/hd-cinema-desktop-qa.jpg` and `.codex/hd-cinema-phone-qa.jpg`.

| Point | Reference | Render and decision |
| --- | --- | --- |
| Toolbar layout | Back left; quality select followed by Cinema right. | Same arrangement above the player; right controls remain aligned at the concept's native 1672 × 941 size. |
| Copy | Auto, 720p HD, 1080p HD; Cinema mode; Playing resolution. | Exact quality/entry labels. Actual 1920 × 1040 replaces the illustrative 1920 × 1080 because the film is cropped. Existing app copy and content preserved. |
| Typography | Clear navy labels and muted resolution line. | Established Segoe UI, intentional 14px select and 13px resolution label. Existing title/nav density retained instead of enlarging unrelated controls. |
| Palette | White surface, navy text, pale-coral Cinema button. | Matches existing white/navy/coral theme. No new overlay, filter, gradient or animation on video. |
| Media and assets | Nature illustration and tiny coral widescreen icon. | Approved Drive movie replaces the illustrative frame; existing verified transparent PNG used in the button. No placeholder bitmap substitutions. |
| Containers and spacing | Open watch canvas, Up next right, rounded select. | Established watch/sidebar/Up next layout retained; 44px controls and compact gaps. Native media controls replace the drawn controls. |
| Responsive behavior | Desktop reference. | Phone wraps Back and options cleanly; no overflow or clipped control. Cinema fills available browser viewport with aspect-ratio-preserving letterboxing. |

The new feature follows the reference's scoped toolbar and resolution treatment. Unrelated generated mockup elements were deliberately excluded; no material mismatch remains in the requested additions.
