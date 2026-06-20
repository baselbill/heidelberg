# Heidelberg Catechism Study App

A static single-page web app for small-group Bible study using a discussion-first format.

## Using the app

Open `index.html` in a browser served over HTTP (e.g. `python -m http.server 8000`). GitHub Pages deployment is supported.

## Building (populating scripture text)

You need an ESV API key from https://api.esv.org.

```
ESV_API_KEY=your_key_here node scripts/fetch-verses.js
```

This fetches passage text for all `displayRange` citations and writes it into `data/catechism.json`. Re-running is safe (skips already-populated citations). Requires Node 18+.

## Sources

**Catechism text:** 2011 translation approved by Synod 2011 of the CRC and General Synod 2011 of the RCA.

**Scripture:** ESV® Bible via Crossway's API (api.esv.org).
