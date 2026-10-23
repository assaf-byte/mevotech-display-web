# Mevotech Display (web version)

Runs in Chrome on the display. No app to install.

## Put it online (GitHub Pages, free)
1. On GitHub, create a new repository, e.g. `mevotech-display-web`, and make it **Public**
   (free GitHub Pages needs a public project; everything in it can be seen by anyone with the link).
2. Upload everything in this folder (Add file > Upload files, drag the files and folders in, Commit).
3. Settings > Pages > Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)**, Save.
4. After a minute or two the address appears at the top of that page, e.g.
   `https://your-name.github.io/mevotech-display-web/`

## Set up the display
1. Open that address in Chrome on the display.
2. Chrome menu (three dots) > **Add to Home screen** (or **Install app**). Open it from the new icon:
   it runs full screen with no address bar.
3. Set the display to open that icon at start-up if it has a start-up app setting.

## Media and customers
- `media/` : videos (MP4) and PDFs. Subfolders become sections. Files over 25 MB need GitHub Desktop to upload.
- `customers/<Customer name>/logo.png` : one folder per customer; the folder name is shown on screen.
- New uploads appear on the display within 15 minutes, or straight away with Refresh in the library or settings.

## Settings
Hold the Mevotech logo for 3 seconds, PIN 2580. Change the PIN, links and timings in `config.js`.

## Hosting somewhere else
Any web server works. Off GitHub, list the files in `content.json`:
`{ "files": ["media/Training/install.mp4", "customers/Acme/logo.png"] }`
