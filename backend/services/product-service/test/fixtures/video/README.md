Synthetic solid-blue H.264 fixtures; no user media.

Generate with FFmpeg (substitute the size/duration and output below):

```sh
ffmpeg -f lavfi -i color=c=blue:s=1080x1080:r=1 -t 60 -c:v libx264 -preset ultrafast -pix_fmt yuv420p limit.mp4
```

| File | Size | Duration |
| --- | --- | --- |
| limit.mp4 | 1080 x 1080 | 60s |
| long.mp4 | 16 x 16 | 61s |
| wide.mp4 | 1920 x 16 | 1s |
| portrait.mov | 720 x 1080 | 1s |
