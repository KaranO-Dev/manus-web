# Security

MANUS is a static web app. It has no accounts, no server-side storage and no API keys. Hand tracking and sound run in the browser, and camera frames never leave the device. Every page is served with a Content Security Policy that loads scripts, styles, fonts and network requests from the site's own origin only and forbids framing, a Permissions Policy that allows the camera on that origin and blocks the microphone and location, and `strict-origin-when-cross-origin` referrers (see `next.config.ts`).

If you find a security problem, please email privacy@karano.me with the steps to reproduce it rather than opening a public issue. You'll get a reply within a few days.
