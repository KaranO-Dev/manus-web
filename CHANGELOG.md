# Changelog

All notable changes to MANUS are documented in this file.

---

## [6.6.0] — 2026-11-11

### Changed
- FX-VI is Lumen Haze, in place of Vitrum Sacrum. The room goes dark and fills with haze, lit from just above the stage. The hands stand in that light, so it streams past the fingers in shafts and leaves their shadows in the haze, and their edges catch it from behind. The eight beams are sheets of laser light in the console's four channel colours that flare when they are played, and dust drifts in the light, brighter with the treble. A patch saved with Vitrum Sacrum opens with Lumen Haze.
- The other five looks are materials now, where they used to tint the camera picture. In front of a plain wall, most of them came out as one flat colour.
  - Mirror Dimension: glass shards, each tilted its own way and lit by that tilt, with fine cobalt and gold seams along their real edges.
  - Rubric Vellum: parchment with its fibre, stains and ruled lines, and a vermilion ink shadow under each hand.
  - Lapis Vortex: lapis stone with calcite veins and gold flecks that catch the light with the treble, turning round the palms.
  - 1480 Woodcut: cut lines, about 130 down the stage at any resolution, that bend round the hands like the contour lines of an engraving and crosshatch the shadows.
  - Liquid Mercury: liquid chrome that swells slowly, rings with each note and reflects a studio, with a meniscus round each hand.
- Each look draws the hand's edge in its own material: an ink outline in Vellum and Woodcut, a back light in Lumen Haze, glass, gold leaf or chrome in the others. A hand in a dim room has its shadows lifted a little. In headless Chrome on an M4 Pro, every look holds 60 frames a second with the hand tracker running.
- The backing plays on the audio clock. Every drum, bass note and chart note of a riff or song is scheduled up to 100 ms ahead, at its step's exact time. Before, each one played when the next animation frame noticed its step had passed, so with the hand tracker busy on the page the kicks of a 120 BPM riff came 467 to 533 ms apart. They now come 500 ms apart, to the sample. A change of song, tempo, chord or voice calls off whatever was scheduled and not yet heard, and plays it again with the change. The stage lights each chart note at the moment it sounds.
- The stem stays on the drums under every chord. A chord changed the stem's pitch by playing it faster or slower (0.79× under bVI, 1.33× under IV, 1.5× under V) while the drums and the chart kept the song's tempo, so the stem slid off the beat until the chord went back to I. Each chord now has its own take of the stem, stretched to keep the tempo at the new pitch, and the song clock decides where in the loop the stem plays. A chord change crossfades to the new take in 25 ms; the stem's pitch used to glide there over about 40 ms. The other chords' takes are made in the background once a song or a tempo starts. After a stutter or a tempo change the stem rejoins the clock too, where before it carried on from wherever it had got to.
- A song and its stem start 15 ms after the button, so the stem's first beat and the first kick land together. Web Audio starts a sound asked for "now" at its next 128-sample block, up to 2.7 ms late.
- Gestures are read as soon as the tracker answers, once for each camera frame, instead of on the next drawn frame. The tracker always gets the newest frame, and frames it had no time for are dropped. The camera picture goes to the GPU once per camera frame, and the stage's easing is timed in sixtieths of a second, so a 120 Hz screen moves it at the same speed. The footer shows how long a gesture took to be seen, from the camera taking the frame, next to how long a note took to be heard.
- The pinch is read from the fingertips before smoothing, so a note starts on the frame the fingers close; smoothing still decides where the hand is and which beam it is on. Each hand keeps its own slot from frame to frame, matched by where its wrist was, so two hands that cross or drop out for a moment don't swap pinches. A hand that has just come into view plays nothing for 120 ms, and the tracker's one-frame mistakes play nothing.
- `?tracker=worker` runs hand tracking in a Web Worker. On an M4 Pro Mac in Chrome, the page thread found hands in 22 ms, 27 ms from frame to gestures, with the stage at 52 frames a second. The worker on the GPU took 50 ms and 72 ms at 60 frames a second, and on the CPU 33 ms and 44 ms. The page thread answers soonest, so it stays the default.

### Fixed
- The camera's own background no longer shows round each finger as a pale outline. The hand mask was painted wider and softer than the hand; it is tighter now.
- The seams of Mirror Dimension and the leading of Vitrum Sacrum sat at the middle of each glass cell, where they showed as dots. They were measured from each cell's centre; they are now measured from its edges, and the camera-off stage's facets with them.
- Note ripples use the console's four channel colours. The fourth was an emerald the console doesn't use.
- The stretched stem's beats land on time. The stretch placed each window by its start, which moved every beat by half a window times (stretch − 1): 10 ms early at a stretch of 1.5 and 31 ms at 2.5. Windows are now placed by their centre and beats land within 1 ms.
- The lesson and the gesture guide behave as dialogs: focus goes in when they open, Tab stays inside, and focus goes back to what opened them.
- The keys go by position, so the shortcuts sit in the same place on AZERTY, QWERTZ or Dvorak. Nothing plays while you type in a text field or compose with an input method.
- Two fingers on a touch screen strum on their own, and lifting one no longer ends the other's strum. A strum that runs off the stage ends when the finger lifts. A press on one of the stage's buttons no longer plays the beam underneath. On a phone a vertical swipe over the stage still scrolls the page.
- When the browser takes the WebGL context away (after a GPU reset, or with too many tabs drawing), the stage builds itself again once the context comes back instead of staying blank. Its textures, buffer and program are freed when it closes.
- The page re-renders only when something it shows changes. The stage pushes its readings many times a second, and most pushes change nothing.

### Added
- Tests in Node, in `tests/unit`: the gesture rules played against a recorded hand (`tests/fixtures/hands.json`), the frame clock, the song clock and where a stretched stem's beats land. In the browser, `tests/e2e/keys.spec.ts` covers the keys and the dialogs.

---

## [6.5.15] — 2026-11-11

### Changed
- The crawlers that gather pages to train AI models are turned away in robots.txt, with the same list as karano.me. Every response says `tdm-reservation: 1`, and `/.well-known/tdmrep.json` states the same: text and data mining is reserved under EU Directive 2019/790, Art. 4(3). Search engines, and the assistants that fetch a page because someone asked them, still come in.
- The app's structured data is on the home page only, with a stable `@id` (`https://manus.karano.me/#app`) and karano.me's MANUS case study under `sameAs`. The Android privacy policy repeated it in full; it is now a plain web page about the app, pointing at that `@id`.
- The sitemap gives each page the date it last changed: the home page the newest release's date in this changelog, the privacy policy the day its text last changed.

---

## [6.5.14] — 2026-10-31

### Fixed
- A riff played at another tempo loops without a gap. The stretched backing stem read only the windows that fit inside the stem and faded both of its ends, so at 96 BPM (a 120 BPM riff stretched by 1.25) the last 500 to 1,150 samples of every loop were silent, with a dip in level either side of the seam. The windows now go round the loop, as in the Android app's 1.1.2. A stem is also left unstretched only at exactly its own tempo; within 1.5% of it, it used to be left as it was and drift against the chart.

### Changed
- The stretch lives in `lib/stretch.ts`, with tests in Node: the take's length, a steady level through the seam, and a tone that loops cleanly before and after.

---

## [6.5.13] — 2026-10-31

### Changed
- The tagline is "Pinch the light to play", in the page title, the share image, the README and the banner's tag (PINCH THE LIGHT). It replaces "An instrument you play with your hands", which would describe almost any instrument. The share image's words were drawn again from `assets/brand/opengraph-poster.html`, over the same stage picture.

---

## [6.5.12] — 2026-10-31

### Changed
- The code comments say what each part does and why, in plain terms. Several had drifted from the code and are corrected: the theremin's top edge, the telemetry rate, which knob drives each shader input, the chorus timings and the size of the hand-tracking download (about 10 MB, not 9).
- The changelog reads in one voice back to 2.0.0.
- A setlist slot cycles through the rhythms that have a backing stem, read from the rhythm list instead of ids written out in two places.

### Fixed
- Moving to the next song of a setlist ran inside a React state updater, which React may call twice. The index now lives in a ref as well, and the state is set once.
- Pinch calibration no longer throws when the browser blocks storage. The other pose then reads as not yet calibrated.
- In a browser that can't record the stage, starting a clip stops copying frames instead of leaving the copy loop running. A finished clip's object URL is freed after its download starts.
- The hand skeleton drew the wrist-to-little-finger line twice.
- Two tips in the guide ended in exclamation marks.

### Added
- SECURITY.md: how the site handles data, the security headers it sends, and where to report a problem.

---

## [6.5.11] — 2026-10-31

### Changed
- The README is new and written for someone meeting MANUS for the first time. It covers what MANUS is, how to play it, how it works, the numbers, privacy, and how to run and test it.
- The README banner says what MANUS is in plain words and uses the app's own fonts, Mona Sans and Monaspace Xenon. Its subtitle ran past the frame in the generic monospace the old banner specified; every line now fits with room to spare. `scripts/render-banner.mjs` draws the PNG from the SVG at 2x.
- The four backing loops' files are named after what the app calls them: `seq-grid-horizon`, `seq-tapping-arp`, `seq-acid-drive` and `seq-solar-pulse`. The fourth rhythm's id is now `solar`, and a setlist saved before still loads it.
- `package.json` describes MANUS the way the site does, and states its homepage, author, licence and the Node version Next.js needs.

### Added
- LICENSE: all rights reserved, the code published to be read. THIRD_PARTY_NOTICES.md lists what MANUS ships from others (MediaPipe's runtime and model, three fonts, the Surge XT renders), with the licence texts in `licenses/`.
- CI on GitHub Actions: type-check, lint and build, then the browser tests against that build in Chrome, on every push to main and every pull request.

---

## [6.5.10] — 2026-10-29

### Fixed
- The camera picture keeps its shape. It was stretched to fill the stage, whatever shape the layout gave the stage: on a 1440×900 laptop screen the 16:9 webcam went onto a stage close to 3:2 and came out a sixth narrower, and a phone or tablet held upright, whose picture is tall, was compressed vertically. The stage now shows the middle of the picture at its true shape. It cuts the sides of a wider picture, or the top and bottom of a taller one, and the hands go through the same cut, so the beams answer where the hand is seen. The Android app does the same.
- A chord's name no longer splits inside a word on a phone. The chord tiles are too narrow there for Subdominant and Submediant, which broke over two lines. On a tile that narrow the name now takes Mona Sans's narrow width, and a smaller size on the smallest phones, so the word stays whole.
- The glow behind a moving hand trails for the same time on any screen. It faded by a share of each frame, so on a 120 Hz screen it lasted half as long as on a 60 Hz one. It fades by time now.

### Changed
- With no hand in view for 0.6 s, the hand mask is cleared once and then left alone until a hand comes back. Before, it was faded and sent to the GPU on every frame.

### Added
- Tests for the crop, run in Node: a webcam, a phone held upright and a 21:9 picture, points keeping their place and squares staying square. The layout test now also fails on a tile name split inside a word, and runs at 412×961 and 320×568 too.

Measured in Chrome on a Mac (Metal) with a fake camera playing a recorded hand: 56 frames a second, up from 52 or 53. The hand tracker waiting on the GPU for its result still takes 84% of the main thread, and the stage's size barely moves that (54 frames a second at Retina scale).

---

## [6.5.9] — 2026-10-27

### Added
- Web Analytics counts how far a visit gets into playing, with no cookies and nothing personal: the camera turned on or refused, the first note from a pinch, the first note without the camera, the first riff or song, the first gem caught, and a return visit. Custom events need Vercel's Pro plan, so each step is a page view of its own, /events/<name>, sent once per page load with nothing else attached. The return visit stores nothing: a page that the offline worker already serves on arrival comes from a browser that had MANUS before, and a reload doesn't count. The README and llms.txt say so.
- A script for testing the first play with five people in person: four tasks, what to watch in each, one question after each, a table for the notes, and how to read the funnel in Vercel.
- Browser tests check that each step is sent once: a note without the camera, a song, a caught gem, the camera on and refused, and a return visit but not a reload.

---

## [6.5.8] — 2026-10-27

### Fixed
- The Android app's privacy policy names the camera switch as the app shows it, STOP CAM (or C), where it said a CAMERA button. It also says the credit line is on the console, where it had said at its foot; on most layouts it sits in the header.

---

## [6.5.7] — 2026-10-27

### Added
- The Android app's privacy policy has a page of its own at /android/privacy, the address its Google Play listing gives. The text is the app's docs/privacy-policy.md. It states that the app has no internet access, no account, no ads and no analytics, and that the camera is read on the phone with each frame discarded. Questions go to privacy@karano.me. The console never scrolls, so the policy scrolls in a box of its own, and the note that MANUS needs JavaScript stays off it, since the page needs none. It is in the sitemap, with its own canonical address.
- A smoke test opens the policy at a phone's width and checks that it answers, can be indexed, shows the contact, scrolls to the end and never sideways, and is in the sitemap.

---

## [6.5.6] — 2026-10-25

### Fixed
- On an Android foldable the camera now faces the player with the phone open. A Galaxy Z Fold has a selfie camera for each screen, and Chrome hands out the outer screen's whenever a page asks for the front camera, open or closed. With the phone open that camera looks the other way, so no hand was ever found; on an iPhone, with one selfie camera, it always worked. With exactly two selfie cameras, the screen in use now decides: the inner screen, close to square, takes the second camera, and the outer screen, tall and narrow, takes the first. On a first visit the cameras' names only become readable with the permission, so the choice is made once the camera is open and may swap cameras once.
- 6.5.5 swapped cameras when Chrome reported a change of posture. Posture is how far the hinge is bent and says nothing about which screen is in use: opening the phone fired it twice and left the outer camera on. A change in the screen's size, which only a change of screen causes, is the signal now.

### Added
- Tests for the camera choice: the cameras a Fold7 reports, open and closed and either way up, a phone with one selfie camera, an iPhone, a computer and an older Chrome's names. In the browser: an open Fold asks for the inner camera, keeps a working one when that won't open and doesn't loop; opening the phone mid-play switches cameras; turning it doesn't.

---

## [6.5.5] — 2026-10-25

### Fixed
- On a foldable, the camera follows the screen you play on. Folding or unfolding moves you to the other screen, but the camera already open kept facing the old one: on a Galaxy Z Fold7, unfolded, it looked at the ceiling and no hand was found. A fold now opens the camera again, and with exactly two selfie cameras it takes the one that wasn't in use. Chrome on Android reports the fold itself; elsewhere a change in the screen's size on a touch screen counts as one, and turning the phone, which keeps the size, doesn't.
- A camera that stops on its own comes back. When the phone hands it to another app, or turns it off with the screen, MANUS opens it again instead of leaving a frozen picture, and coming back to the tab does the same if it stopped while the tab was hidden.

### Changed
- Lint leaves out other local checkouts of this repo, which hold their own builds.

---

## [6.5.4] — 2026-10-25

### Added
- Every original image the site serves carries the author's credit: the icons, the logo, the banner, the share poster and the install screenshots. Each carries XMP metadata with the creator, the author's title, the credit line "Karan Oroumchi, UI/UX engineer, karano.me", the copyright and karano.me as the rights statement, the same as karano.me. It is written into each file's bytes, so nothing was re-encoded and every pixel is unchanged. `node scripts/credit.mjs` credits a new image, and the screenshot script credits its own.
- A test checks that each of those images carries the credit and still decodes.
- The favicons, the hand-tracking model and wasm, the fonts and the sounds carry no credit. The sounds are renders of a synth's factory presets.

---

## [6.5.3] — 2026-10-25

### Fixed
- Hand height now sweeps the theremin over its whole range. The average of the hands' heights started at 0.5 before the hands were added, so with one hand in view the filter, the vowel and the reverb were already fully open with the hand halfway up, and the bottom half of the frame did all the work. With two hands everything sat a quarter too high. The wrist roll that sets the filter's resonance had the same fault. Both now start from zero. The fault dated from 2.0.

### Added
- Tests that run made-up hands through the stage's gesture code: one hand halfway up reads 50%, two hands read their mean, and no hands give no reading.

---

## [6.5.2] — 2026-10-25

### Changed
- Web Analytics renders on every build, as on karano.me, instead of only when the build sees Vercel's VERCEL variable. On the live site Vercel serves its script and takes the page views at a random path on manus.karano.me, so ad blockers miss it. A local build asks for /_vercel/insights/script.js and gets a 404, and the smoke test that looks for console errors ignores only that.
- The live smoke test finds the analytics script by its tag and checks it loads. It no longer waits for a page view, because the script sends none from an automated browser.

---

## [6.5.1] — 2026-10-25

### Added
- Vercel Web Analytics counts page views. It sets no cookies and sees nothing of the camera or the sound, so there is no consent banner. It loads from the same origin, so the Content-Security-Policy stays as it was, and the service worker never keeps a copy of it.
- A smoke test, run against the live site, checks the analytics script.

### Changed
- The privacy line in the header now says camera frames stay on this device, without "Nothing is uploaded". The page description, the README and llms.txt say the same, and that page views are counted without cookies.

---

## [6.5.0] — 2026-10-25

### Added
- Every toolbar button has a key, written on the button in a small keycap: P plays a riff, I switches between pinch play and glide strum, N plays along, T is the theremin, E opens Recall, Q switches between quantize and hand guide, Space is the drone, V records a clip, C is the camera and ? opens the guide. M connects MIDI in Expert.
- X switches between Simple and Expert, Z holds the stutter while it is down, Delete clears the tape, and W opens the lesson. Escape closes the lesson.
- The guide lists every key under the gesture cards, and it scrolls when the window is short.
- A smoke test checks that every toolbar button shows a key, and that each key does what its button does.

### Changed
- Two toolbar labels are shorter, so the buttons and their keys still fit on one row at 1366 pixels wide: SUB DRONE (D1) is DRONE D1, and 1/16 QUANTIZE and HAND GUIDE ON are QUANTIZE and HAND GUIDE.
- The footer lists the keys that have no button of their own. It had said A–F and J–; as if they were ranges, so it now spells out ASDF and JKL;.
- On phones and touch screens the keycaps are hidden, since there is no keyboard.

### Fixed
- Space no longer presses a toolbar button that still has focus from a click. It only turns the drone on or off.

---

## [6.4.10] — 2026-10-25

### Changed
- The score card after a song looks like the first-visit lesson. A dark readout names the song and the best combo, the beats light up as lamps on a small dark screen in the stage's colours (white for perfect, ochre for great, blue for good, red for a miss) with a key under them, and the score sits beside them. Close is on the left and Replay misses on the right. With nothing missed, Close is the one key. Escape closes it. On a phone the lamps sit in a wide row above the score.

### Fixed
- Replay misses now plays the song again. The card had been saved after the song was already switched off, so it did not know which song was played: Replay misses started nothing, and a 32-beat song showed only its first 16 beats.

### Added
- A smoke test plays Field Song from the keys, stops it, checks the card names the song and shows all 32 beats, and that Replay misses starts the song again.

---

## [6.4.9] — 2026-10-25

### Fixed
- The footer shows every key on a laptop. Below about 1560 pixels wide the key list had run off the right edge, so Theremin and Guide were cut. Now the keys drop to a second line when the note and the keys do not fit on one.
- On a phone each key stays with its name, and the keys wrap as whole pairs with room between them, without stray dots at the start of a line. The note and the key list have more space around them, and the timing readout no longer splits across two lines.

### Added
- The smoke test that looks for cut text also checks the footer: the note and every key inside it, and each key on one line with its name.

---

## [6.4.8] — 2026-10-25

### Changed
- The first-visit lesson looks like part of the console: an aluminium card with a small dark readout that lights one lamp per step, a diagram for each step drawn like the gesture guide's, and the console's own keys. Skip sits on the left, and Back and Next on the right. Back is new. On a phone the diagram sits above the words, and on a phone on its side the card stays compact.

### Fixed
- On a phone the credit and the privacy line have room under the toolbar instead of touching the last row of keys.
- A dark key (Guide, and the lesson's Next) stays dark under the pointer. Its hover had turned it white with a white label.

### Added
- A smoke test walks the lesson forward and back, closes it with Start playing, and checks it stays closed after a reload.

---

## [6.4.7] — 2026-10-25

### Added
- MANUS installs as an app and plays offline. A service worker keeps the page, its files, fonts and sounds once they have been used, and the hand tracker only after the camera has been on, so a mouse or phone player never downloads it. Each release starts with fresh copies.
- The install sheet shows two screenshots, a laptop and a phone, and the manifest has an id, a scope, a language, categories and the icon as SVG. On an iPhone, Add to Home Screen opens it in its own window named MANUS.
- Smoke tests check the install files and the home-screen settings, that a second visit opens without a connection, that a mouse player's visit keeps no tracker, and that the tracker is kept once the camera has been on.

### Fixed
- On a phone the toolbar is an even grid: every button one width and one height, its lamp and label centred, three to a row on most phones and two on the smallest. The credit and the privacy line both start from the left.
- The beam labels across the top of the stage no longer run into each other on a phone. A narrow lane shows the short label (I, bVI, IV, V, #5 to #8).

---

## [6.4.6] — 2026-10-25

### Changed
- Hand tracking loads when the camera is first turned on instead of with the page. A first visit downloads about 470 KB instead of about 9.5 MB, and players who use the mouse or a phone never download the tracker. The first camera start takes a few seconds longer while INIT VISION shows, and later starts use the browser's cached copy.
- The vision readout says 1€ VISION // OFF until the camera is turned on.

### Fixed
- The hint at the bottom of the stage is never cut. When it does not fit beside the buttons, the buttons move to their own row. Gesture guide and Lesson are one button size, the vision readout matches their height, and none of them wraps inside itself.
- On a narrow or short stage the hint and labels switch to short forms (TAP A BEAM · DRAG TO STRUM, GUIDE [?], VISION OFF), so the bar stays under the white line where notes are caught. On the smallest phones only Guide and Lesson stay.
- A phone on its side, or any screen under 520px tall, gets the stacked layout with the deck under the stage, instead of a desktop layout with a stage too short to play.
- Lesson is the light secondary button it was meant to be again. A later style had made it dark.
- A camera or hand-tracking message sits above the bottom bar instead of over it.

### Added
- A smoke test checks that nothing of the tracker loads with the page, and that turning on a camera loads it and gets tracking ready, using Chrome's fake camera. Another checks the stage's bottom bar at seven sizes, phones on their side included.

---

## [6.4.5] — 2026-10-24

### Added
- T turns the theremin on or off, and the setting is kept for the next visit. Switching plays two clicks that rise for on and fall for off.
- The E1 to E4 knobs work from the keyboard: Tab to one, then the arrow keys, Page Up and Page Down, Home and End. RECALL and SUB DRONE tell screen readers whether they are on.
- npm run test:e2e runs browser smoke tests against a production build: the theremin switch, the E4 knob, cut text at four screen sizes in both modes, llms.txt and the structured data.

### Changed
- With the theremin off the open filter has no resonant peak either, so it colours nothing.
- Buttons that swap their label, such as THEREMIN, PINCH PLAY, PLAY ALONG and REC CLIP, keep one width, so the toolbar no longer jumps when one of them changes.
- On a phone the E1 knob reads E1 OFF instead of wrapping, and the footer wraps so the key list stays readable.

### Fixed
- E4 REVERB sets the reverb. It used to change the echo and the picture blur while its own readout stood still. At 50% the room sounds as before, and the REVERB readout shows the level you hear.

---

## [6.4.4] — 2026-10-24

### Added
- Search engines get a description of MANUS as a free web app: what it needs (WebGL 2, a webcam for hand tracking), the share poster, and its author, tied to the same person as karano.me.
- npm run lint checks the code with the Next.js rules, and npm run check runs the type check, the lint and the build in one run.

### Fixed
- The M1–M5 keys and the stage hint read their hover and camera state from React state instead of a value React does not track, so they update on their own.
- The draw loop no longer builds an unused list of note names on every frame.

---

## [6.4.3] — 2026-10-24

### Fixed
- With the theremin off, the mouse still moves the warp and the reverb from left to right. Only height stops.
- The E1 knob says OFF and ignores input while the theremin is off. In the guide, the sweep button says the theremin is off instead of doing nothing.
- With the theremin off, a played note lights up on the white line instead of at a height with no beam, recorded loops included.
- The sound starts at the rest height from the first note, and the vowel on screen matches the height before the sound has started.
- MIDI gets CC74 every time the theremin is switched, even right after another control change.
- Screen readers hear whether the theremin is on or off.
- The OLED's note is measured once per change instead of two or three times while the hand moves, and again when the window changes width, so it no longer stays too small after the window widens. Its line keeps one height while the note shrinks, so the lines under it hold still.
- On a short laptop screen, such as 1366×768 or 1280×720, the voice and optics names were clipped. Every deck panel now keeps the height its keys need, the spacing tightens below 820px tall, and the deck scrolls if it still does not fit.
- The beam keys fit their own width. As a key narrows, the beam number goes first, then the word CHORD, then the note moves under the pitch, then the keyboard letter goes (the bank header still lists the keys). Nothing runs out of a key from 320px to 1920px wide.
- On a phone the two hands stack, the toolbar sits under the name instead of over the mode tabs, the M1–M5 keys drop their dark cap so the names fit, and expert mode shows the optics in two rows.
- The readout strip in the top bar hides when there is no room for it, instead of showing a cut piece of CHORD.
- Tile names keep their parentheses, as in Submediant (bVI), and a word too long for its tile breaks with a hyphen.
- The looper status ends in an ellipsis instead of spilling out of its box, and moves to its own line on the smallest phones.

### Added
- A "Read how it was made" link beside the author credit, to the case study at karano.me/work/manus. It opens a new tab, so the sound, loops and camera keep running.
- A maskable home-screen icon, so Android can crop it to any shape without cutting the strings.
- /llms.txt, a plain summary for language models: what MANUS is, how to try it, the keys, privacy, and links to the case study and karano.me. The version in it comes from the release.

### Changed
- A new colour icon: four strings in blue, ochre, grey and red with a white wave through their dots. It is the favicon, the home-screen and manifest icons, and the mark in the README banner. The masters, including a one-colour version, are in assets/brand.
- A new share poster for link previews: the icon and name beside the stage mid-play, as a 166 KB JPG. Its HTML source is in assets/brand.
- README matches the live app: pinch to play by default, the song book with a tempo per song, the theremin switch, and the live address.

---

## [6.4.2] — 2026-10-24

### Fixed
- The OLED's note stays on one line however long the chord's name and however wide the type, shrinking to fit. The OLED grows when a long voice or optics name wraps, so its bottom line is never cut.
- Below 900px the beam keys take the height their labels need, so they no longer run over the OLED.

---

## [6.4.1] — 2026-10-24

### Fixed
- Theremin off no longer holds the last height. Height stops shaping the sound and goes back to rest: the filter opens, the vowel layer and the pitch bend go, and the reverb returns to where it starts. The beam leaves the stage and the THEREMIN Y readout says OFF. Turned on again, it starts from rest and follows the hand.

---

## [6.4.0] — 2026-10-19

### Added
- Theremin can be turned off. Height no longer moves the filter, and the knob still sets the held value.
- Each riff and each song keeps its own tempo. The − / + control changes only the one that is selected. Riffs start at their own speed again.
- A song book with three songs: Field Song (72), Harbor (80) and Night Step (64). Each plays one note per beat as a melody on the beams.
- The footer prints how long the sound and the camera frame are taking.
- Below 900px the deck sits under the stage so a phone can reach it.

---

## [6.3.0] — 2026-10-19

### Changed
- Play Along is a 32-note Field Song at 72 BPM, one note per beat, with a quiet bass and hat underneath. It replaces the two-pitch hand-tempo pattern.
- Selected key lamps stay inside the key. Focus rings are inset so they no longer spill out of a chord or voice button.
- The score recap and the gesture-guide actions share one button height and one baseline.

---

## [6.2.0] — 2026-10-18

### Added
- Backing tempo now time-stretches the loop, so a slower BPM keeps the original pitch. The highway and the drums follow that tempo.
- Pinch calibration: a sensitivity slider, plus a two-pose capture (open hand, then pinch) stored on this browser.
- Four patch slots and a four-song setlist under Recall. A set advances every eight bars.
- Stopping a song opens a score recap. Replay misses holds each missed beat until you catch it.
- MIDI clock input. Follow external clock locks the highway to an incoming MIDI clock (24 pulses per quarter note).

---

## [6.1.0] — 2026-10-18

### Changed
- Catchable gems now fall one per beat, with about two seconds of travel and a wider pinch window, so a finger can meet the white line. The in-between sixteenths still play in the backing. `HAND TEMPO` / `FULL GRID` switches density.
- The top controls are an aluminium rail of keycaps with a dark index and an OLED readout, matching the deck keys.
- A three-step lesson opens on the first visit and can be reopened from the stage.
- Pinch detection is slightly more forgiving, and the gem draw no longer uses a per-frame blur.

---

## [6.0.0] — 2026-10-18

### Added
- A continuous song clock and a strike-line highway (`lib/audio.ts`, `components/StageCanvas.tsx`). Sequence position advances from the audio clock (`stepFloat`), so gems travel smoothly into a fixed receptor on each of the 8 beams instead of jumping on a coarse timer.
- Scoring on the highway. The backing stem and drums keep playing, and the lead is automatic until you pinch (or click and hold) a gem in the hit window. From then on the part is yours: PERFECT / GREAT / GOOD, a combo multiplier, and a miss when the window closes.
- Expert micro-faders for attack, release, sub, drive, chorus and tempo. They respond to drag, scroll and the arrow keys. Optics stay on the expert rack. Tempo changes rebase the clock without restarting the arrangement.

### Changed
- The M1–M5 function keys are recessed aluminium keys with a status lamp and a bottom dwell slot. They replace the frosted pills and their coloured left stripes.

### Fixed
- Sequencer steps now publish the real note frequency, so the OLED readout follows both caught notes and the automatic lead.

---

## [5.0.0] — 2026-10-18

### Added
- A PINCH PLAY / GLIDE STRUM mode switch in the top deck.
- Studio sound controls (`lib/audio.ts`): a stereo Juno-style chorus widener, a dedicated sub-harmonic oscillator, and a programmable ADSR envelope (`Attack`, `Release`, `Sub Osc`, `Drive`, `Chorus`, `BPM`). The default is `HYBRID`, a multi-zone studio sample combined with a stereo unison synth.
- EXPERT mode (`app/page.tsx`) unlocks the 6-parameter studio synth and envelope sculptor (`ATTACK`, `RELEASE`, `SUB OSC`, `DRIVE`, `CHORUS`, `TEMPO BPM`), the 16-step interactive beam sequencer matrix (`#1–#8`), the scale selector and WebMIDI output.

### Changed
- Pinch to play is the default (`lib/gestures.ts`, `components/StageCanvas.tsx`). Moving an open hand across the 8 laser beams hovers and aims without sound, and a live pinch target ring is drawn between the thumb and index fingertips, so hovering plays no accidental notes. Pinching (`Thumb + Index`) over a beam plucks that beam immediately. Holding the pinch closed while dragging strums arpeggios across beams, and releasing the pinch returns to silent hover.
- The Surge XT backing stems (`seq-grid-horizon.mp3`, `seq-tapping-arp.mp3`, `seq-acid-drive.mp3`, `seq-solar-pulse.mp3`) are restored (`lib/audio.ts`). They are pitch-locked to the active chord root (`I / bVI / IV / V`) and synchronised with the 16-step beam sequencer, so the demo parts can be played on beams `#1–#8`.
- The raw canvas boxes are replaced by 5 frosted-glass HUD pills (`M1 VOICE`, `M2 OPTICS`, `M3 SCALE`, `M4 DRONE`, `M5 TAPE`) that show their live values and touch-dwell progress bars (`components/StageCanvas.tsx`, `app/globals.css`). The `THEREMIN Y` pill moved to the left margin so it does not overlap the right-hand skeleton.
- The `GESTURE GUIDE [?]` modal is rebuilt with 4 custom SVG diagrams and interactive audition buttons (`app/page.tsx`, `app/globals.css`).

### Fixed
- The `CLOSE [ESC]` button in the gesture guide was white on white and unreadable. It is now a high-contrast vermilion button.

---

## [4.0.0] — 2026-10-18

### Added
- A falling light-note highway on the 8 vertical laser beams (`lib/audio.ts`, `components/StageCanvas.tsx`). It shows the next 4 notes of the riff travelling down to the theremin Y line.
- `HAND GUIDE`, a play-along mode in which each note of the riff waits as a glowing `STRUM HERE` target ring on its beam, so the player can play the riff at their own pace.
- Active hand roles during any riff. The left hand (beams 1–4 and fist) controls the live 4-chord progression (`CHORD I`, `CHORD bVI`, `CHORD IV`, `CHORD V`) of the whole synthesizer and sequence in real time as it moves across beams 1–4. Closing it into a fist, or holding `HOLD STUTTER`, starts a 1/16th-beat stutter repeat and a resonance spike. The right hand (beams 5–8 and theremin Y) sweeps the resonant filter (220 Hz to 9.8 kHz), the formant talkbox vowels (`[U-O-A-E-I]`) and the arena reverb swell, and adds 1/16th-beat-quantised lead notes to the active groove, so hand strumming stays in time.
- A `SIMPLE` / `EXPERT` hardware mode switch (`app/page.tsx`, `app/globals.css`). `SIMPLE` offers beat-quantised strumming, 4 live chord progression pads (`CHORD I / bVI / IV / V`) and one-click `HAND GUIDE` play-along. `EXPERT` adds the interactive 16-step beam sequencer editor (`STEPS 1–16`, where a click on any step reprograms which laser beam `#1–#8` it triggers), the scale selector, WebMIDI output and the full 12-voice synthesis controls.

### Changed
- The pre-baked MP3 demo loops are replaced by a real-time 16-step beam sequencer (`lib/audio.ts`, `components/StageCanvas.tsx`). All 4 riffs (`SEQ-1 Grid Horizon`, `SEQ-2 Tapping Arp`, `SEQ-3 Acid Drive`, `SEQ-4 Solar Pulse`) are composed of the 8 laser beams (`#1–#8`) and play live through whichever of the 12 studio voices (`01–12`) is selected.

---

## [3.2.0] — 2026-10-18

### Added
- Bank B of the soundpack, which brings the total to 12 multi-sampled studio instruments (48 zone files, 4 backing stems and a sub drone). It has 24 additional pitch-zoned stereo samples (`z0` D3, `z1` G3, `z2` D4, `z3` G4) for `07 Waveguide Harp`, `08 Crystal FM Bell`, `09 Sub Reactor`, `10 Horizon Brass`, `11 PWM Matrix` and `12 Aether Choir`.
- `BANK A (01–06)` and `BANK B (07–12)` selector pills in the Synthesis Voice module, with the shortcut key `B`.
- A live 32-sample time-domain oscilloscope waveform inside the OLED tape reel display. The OLED header, the note readout, the tape graphic and the footer pills are directly clickable.

### Changed
- The 5 top bezel macro buttons (`M1 VOICE NEXT`, `M2 OPTIC FX`, `M3 SCALE MODE`, `M4 SUB DRONE`, `M5 TAPE LOOP`) are restored along the top of the camera stage (`y < 0.135`), operable by fingertip touch and by pointer click (`lib/gestures.ts`, `components/StageCanvas.tsx`).
- Theremin Y (`0%` to `100%`) is bounded between the bottom of the stage (`y = 0.94` → `0%`) and the bottom border of the 5 top buttons (`y = 0.14` → `100%`). It reaches `100%` just before the buttons and does not collide with them.
- All 4 rotary knobs (`E1 THEREMIN Y`, `E2 PRISM WARP`, `E3 ROTATIO`, `E4 REVERB`) respond to pointer drag, scroll wheel, click-to-step and double-click reset (`app/page.tsx`).
- Original names replace all third-party brand and artist references in the UI, the codebase, the SVG and PNG banners and the documentation.

### Removed
- The edge UI mouse, so the left hand no longer triggers false pointer events while playing.

---

## [3.1.0] — 2026-10-18

### Changed
- Restored the layout with a full-bleed camera stage on the left (`1fr`), a control deck on the right (`446px`) and 8 full-width laser harp beams.

---

## [3.0.0] — 2026-10-18

### Added
- A multi-zone sample engine with four zones (`z0`–`z3`).
- A formant talkbox vowel filter (`U-O-A-E-I`).
- A sidechain drum sequencer.
- Auto-strum for the 8-beam laser harp.
- A Theremin Y elevation axis.
- A high-DPI PNG banner for the repository.

---

## [2.0.0] — 2026-10-18

### Added
- WebGL2 Mirror Dimension: foreground/background hand separation (`u_handMask`).
- 1-Euro (`1€`) adaptive landmark smoothing.
- A WebMIDI output bridge.
- A WebM video/audio performance recorder.
