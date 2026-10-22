# Ad, Oct 2026

Promo for our own X account (pinned post), not a paid ad: paid gambling ads
on X, Meta or Google need advertiser approval first.

- `ad-16.png` (1200×675, X) and `ad-45.png` (1080×1350, phone): still ad.
- `btg-ad.mp4`: 13.5-second 4:5 video.
- `ad.html`: the source. `?m=16` / `?m=45` render the stills, `?m=v` the
  video (`setT(seconds)` draws a frame).

Every number is from the live record on Oct 20, 2026: NFL official singles
34–24, 45 of 57 beat the closing price (79%); the example is Chuba Hubbard
Over 18.5 rush attempts, locked +125 at BetMGM, closed −104, 28 attempts,
posted on X Thu Oct 15, 3:40 PM ET. Refresh them from the database before
posting and re-render if any changed.

Render (Playwright's Chromium; ffmpeg from `pip install imageio-ffmpeg`):

    node shoot.mjs "$PWD" video
    $(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())") -y -framerate 30 \
      -i frames/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart btg-ad.mp4

`frames/` is scratch output; don't commit it.

Posting: a copy of `btg-ad.mp4` ships in `dist/x/`, and the site posts it
when `x-custom-post` is set to `{"text":"…","video":"btg-ad.mp4","id":"ad-2026-10"}`
(chunked video upload, see `xUploadVideo` in worker/records.js). Only after
Tim approves the text.
