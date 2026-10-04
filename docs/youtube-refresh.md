# Kids Cinema: video browsing and Shorts

Design references: F:/Agent/kids-drive-cinema/2026-10-04-youtube-shorts-v01/ready/other/kids-video-home-concept-v01.png and kids-shorts-concept-v01.png. Created before UI implementation in Chrome > ChatGPT > Agent Assets. Manifest records originals, optimized runtime copies and provenance.

Design system: white #fff, ink #17213b, coral #ef5364 active controls, sky #62bdf8 branding, mint #72d6bd, lilac #9a82d9. Rounded humanist Segoe UI; 64px desktop header, 208px sidebar; 24px gutters; pill category filters; open three-column 16:9 video rows; portrait Shorts shelf; full-height vertical Shorts viewer with a dark canvas, pause/mute controls, save/open actions, seek progress and previous/next. Phone bottom navigation: Home, Shorts, Continue, Saved. No marketing hero.

Allowed chrome copy: Kids Cinema, Search videos, Refresh, Home, Shorts, Continue, Saved, Folders, All, Recently added, Videos, See all, Save, Open video, Up next. Existing real Drive names replace illustrative concept names, collections and nature thumbnails. Sort/count information and error/empty states remain functional necessities. Portrait concept clips represent layout only; real landscape media must fit without cropping. Concept arrows both say Next; implementation intentionally labels Previous and Next correctly. Concept phone status bar is supplied by the device, not painted into the app.

Performance scope: browser catalogue snapshot with conditional revalidation; fewer initial mounted cards and deferred search filtering; shared lightweight player initialization; one active Shorts player with adjacent posters; HLS resume readiness based on actual playlist duration and a small buffer rather than waiting for 120 extra seconds. Preserve the approved Drive-folder access checks. No claim of YouTube-scale hosting or exhaustive source-file playback verification.

## Final visual review, 2026-10-04

Reviewed both Agent Assets concepts beside the final desktop Home and phone Shorts screenshots with view_image. Also checked the single-column phone Home and real-frame phone watch player.

| Point | Final render and fidelity decision |
| --- | --- |
| Layout | Desktop retains the concept's left navigation, search header, pill filters, three-column video row and four visible portrait Shorts cards. The catalogue continues below the shelf. |
| Copy | Home, Shorts, Continue, Saved, Videos and See all match the planned navigation. Actual Drive titles and folders replace illustrative nature clips; no invented catalogue content. Counts and sorting support the large library. |
| Typography | Bold navy headings and compact humanist text retain the hierarchy. The 64px header and 208px sidebar deliberately use smaller sizing than the large concept drawing to leave room for real folder names and videos. |
| Palette | White surfaces, coral selection and Shorts accents, blue Cinema branding, pale filter pills and colorful collection avatars match the reference direction. |
| Artwork | Verified original transparent projector and coral Shorts PNGs are used from the F:/Agent batch. Missing thumbnails use the projector; existing source thumbnails retain their actual imagery. |
| Spacing | Rounded 16:9 thumbnails, open gutters, duration badges, title/collection rows and a clearly separated Shorts shelf preserve the concept's rhythm. |
| Phone | Home becomes one column with search beneath the header and four bottom navigation actions. At 390x844 the document stays 390px wide. Shorts keeps top pause/mute, right-side save/open/navigation and bottom caption/progress. |
| Shorts deviations | Landscape source videos fit inside the dark portrait canvas to preserve the entire frame. Shared branding/menu replace the concept's separate back header; browser Back and Home remain functional. Previous/Next labels correct the duplicate Next label in the concept. |

Screenshots: `.codex/youtube-home-desktop-qa.jpg`, `.codex/youtube-home-phone-qa.jpg`, `.codex/youtube-shorts-phone-qa.jpg`, `.codex/youtube-watch-phone-qa.jpg`.

## Verification and limits

- Drive scan returned 1,186 videos across 82 scanned folders, represented by 33 collections, with no scan warnings. 57 clips with known duration up to three minutes enter Shorts.
- Browser checks passed real MP4 and MKV playback, search, save, pause/mute, resume, same-collection Up next, Shorts-to-watch and browser Back. Touch swipe, mouse wheel and arrow keys advance Shorts while keeping exactly one active player. Phone QA used browser viewport/touch emulation, not a physical device.
- Final sample Shorts frame: readyState 4, videoWidth 1280, currentTime 20.23 seconds. Final MKV watch sample played a real 1280px frame. These samples do not prove every file in the library.
- Unchanged catalogue revalidation returned HTTP 304 with zero body bytes instead of re-sending the 1,492,260-byte catalogue. Browser snapshots use IndexedDB; initial mounted cards were reduced from 48 to 18 and HLS code loads separately.
- Projector runtime PNG is 73,434 bytes instead of 1,308,160 bytes. Original artwork, optimized copies and SHA-256 provenance are recorded in `F:/Agent/kids-drive-cinema/2026-10-04-youtube-shorts-v01/asset-manifest.json` and the runtime provenance JSON.
- A fresh 54MB MKV needed about 9.7 seconds for its first HLS manifest in the observed request. Drive/network availability and conversion still affect first playback; this is not an instant-start guarantee or a controlled before/after speed benchmark. Codec-probe timeout is three seconds before compatible H.264 fallback.
- `npm run build`, six focused media/cache/HLS tests and JavaScript syntax checks passed. Vite retains its warning about the separately loaded HLS bundle exceeding 500KB.
- This update applies to the local web app. Android source/APKs were not rebuilt; no public deployment was performed.
