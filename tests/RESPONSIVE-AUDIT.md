# Responsive and bookmark audit

Every release audit includes mobile and desktop. Run `npm test` and the slate audit in addition to the visual checks below.

## Automated coverage

`bookmark-recovery.test.cjs` exercises 320, 375, 390, 430, 720, 721, 768, 1024, 1200 and 1440 pixel viewport configurations. These are simulated DOM behavior checks, not rendered geometry checks.

- Legacy-only, mixed legacy/current, empty and malformed bookmark storage.
- Recovery reminder persists after new saves and reload; dismissal persists.
- Find picks clears old player and board filters; Saved props works on both navigation modes.
- Existing refresh tests cover bookmarks retaining the correct player after board reorder and empty feed responses.

## Required visual checklist — outstanding

This buildless Worker has no supported supervised preview server. No browser screenshots or physical-device checks were executed for this release. Source review identified fixed card column minimums that exceeded tablet board space; the 721–1340px layout now uses two columns. Confirm the result visually when browser/device access is available, including 1340px and 1341px around that breakpoint.

At all widths above, and mobile landscape/200% zoom, check:

- Landing, Props, player search/results, Watchlist, Parlays at all three levels, Generator, Movement, Slip, Settings, player/game dialogs, Trust/accuracy and legal pages.
- No page-wide horizontal scroll; long names, markets, odds and error messages wrap. Deliberate tab/table scrolling remains usable.
- Navigation remains reachable; sticky header and bottom navigation never cover content/actions. Rotate or resize while each page and dialog is open.
- Dialogs scroll with short screens, keyboard open and safe-area insets. Close buttons, wager field and save controls remain reachable.
- Empty/loading/error states, full slip, price-changed/unavailable selections, long parlays, light and dark themes.
- Tap every bookmark; confirm correct player/market/line, un-save, re-save, reload, reorder the board and visit Saved props.
- Seed old numeric bookmarks on a test device. Confirm the count/reminder, find and star still-offered picks, reload, and dismiss. Never infer picks from obsolete row numbers. Expired picks cannot be reconstructed.
- Share/download/copy and native-share cancellation on real mobile and desktop browsers; back/forward navigation from each page.

Record browser, device/viewport, route, reproduction steps and screenshots for failures. Do not mark visual QA passed from the simulated tests.
