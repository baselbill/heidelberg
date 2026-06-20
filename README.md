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

## Licensing

**Heidelberg Catechism text** is from the 2011 translation approved by Synod 2011 of the Christian Reformed Church in North America and General Synod 2011 of the Reformed Church in America. © 2011 Faith Alive Christian Resources. Used here under the study, education, and worship exception. For distribution beyond a small study group, written permission is required from Faith Alive Christian Resources (permissions@faithaliveresources.org).

**Scripture quotations** are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be reproduced or distributed in any form under a Creative Commons license.

**App source code** (HTML/CSS/JS, excluding the catechism and scripture text) is released under the MIT License. See LICENSE for details.
