# YouTube Downloader — Next.js + TypeScript

Clean one-screen YouTube downloader UI with server-side VDA API proxy.

## Important fix in this version

The VDA progress API can return `success=0` while the job is still processing around 50%. The Python backend keeps polling in that state and only fails when `progress == -1`. This Next.js version now follows the same logic.

When the provider returns `download_url`, the browser download starts automatically. A fallback **Download Again** button is also shown.

## Run locally

```powershell
cd D:\youtube_downloader_next_ts_fixed_logic
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Production

```powershell
npm run typecheck
npm run build
npm run start
```

## Environment

`.env.local` contains:

```env
VDA_API_KEY=your_key
VDA_API_HOST=https://p.savenow.to
VDA_DEFAULT_FORMAT=360
VDA_ADD_INFO=1
VDA_ALLOW_EXTENDED_DURATION=0
```

Do not commit `.env.local` to GitHub.
