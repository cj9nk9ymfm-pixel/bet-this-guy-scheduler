# NBA opening-day video, Oct 20 2026

`btg-nba-robinson.mp4`: 14.5-second 4:5 video of Duncan Robinson Over 1.5
assists (Celtics @ Pistons). Not posted; drafts for X need Tim's OK first.

Every number is from the live record: locked +117 at DraftKings 11:11 AM PT,
posted on X 11:15 AM PT, DraftKings -135 at 11:21 and -132 at 11:31 AM PT,
final 2 assists, Celtics 113 Pistons 121.

Render (Playwright's Chromium; ffmpeg from `pip install imageio-ffmpeg`):

    node shoot.mjs "$PWD" video
    $(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())") -y -framerate 30 \
      -i frames/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart btg-nba-robinson.mp4

`node shoot.mjs "$PWD" stills` writes sample frames. `frames/` and stills are scratch; don't commit them.
