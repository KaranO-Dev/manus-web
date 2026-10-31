import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";

const TITLE = "MANUS for Android: privacy policy";

const DESCRIPTION =
  "MANUS for Android has no internet access, no account, no ads, no analytics and no tracking. The hand model runs on the phone, and camera frames are never saved or uploaded.";

/* A page's openGraph and twitter replace the root layout's whole objects, images included, so the share poster is named again here */
const POSTER = {
  width: 1200,
  height: 630,
  alt: readFileSync(path.join(process.cwd(), "app/opengraph-image.alt.txt"), "utf8").trim(),
};

/* The policy the Android app's Google Play listing links to. Its text is the same as docs/privacy-policy.md in the manus-android repo, so change both together */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/android/privacy" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/android/privacy",
    siteName: "MANUS",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    images: [{ url: "/opengraph-image.jpg", ...POSTER }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/twitter-image.jpg", ...POSTER }],
  },
};

export default function AndroidPrivacyPolicy() {
  return (
    <main className="policy">
      <article className="policy-sheet">
        <header className="policy-head">
          <div className="policy-deck">
            <div className="speaker-grille" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className="speaker-dot" />
              ))}
            </div>
            <span className="brand-badge">ANDROID</span>
            <Link className="policy-home" href="/">
              manus.karano.me
            </Link>
          </div>
          <h1 className="policy-title">MANUS privacy policy</h1>
          <p className="policy-effective">
            Effective 26 October 2026. This covers the MANUS app for Android, made by Karan Oroumchi.
          </p>
        </header>

        <section>
          <h2>The short version</h2>
          <p>
            MANUS has no internet access. It can&apos;t send anything anywhere, so it doesn&apos;t. There&apos;s no
            account, no ads, no analytics and no tracking.
          </p>
        </section>

        <section>
          <h2>The camera</h2>
          <p>
            MANUS asks for the camera so you can play it with your hands. Each frame goes to a hand model that runs
            on the phone itself (Google&apos;s MediaPipe hand landmarker, bundled inside the app). The model returns 21
            points per hand, the instrument plays from those points, and the frame is thrown away. Frames aren&apos;t
            saved, uploaded or kept in memory after they&apos;re used.
          </p>
          <p>
            You can say no to the camera, or turn it off with STOP CAM (or C). Touch, the on-screen keys and a
            hardware keyboard all still play.
          </p>
          <p>
            The app&apos;s manifest removes the internet permission that the MediaPipe library would otherwise add, so
            the hand model can&apos;t phone home either.
          </p>
        </section>

        <section>
          <h2>What stays on the phone</h2>
          <p>MANUS keeps a few settings in the app&apos;s private storage so they&apos;re there next time:</p>
          <ul>
            <li>
              your pinch threshold and the open and closed pinch you measured with Hold open and Hold pinch;
            </li>
            <li>whether the theremin is on;</li>
            <li>whether you&apos;ve seen the first-run lesson;</li>
            <li>
              your Recall bench: four saved patches (voice, look, scale, synth settings, tempo) and a four-slot
              setlist;
            </li>
            <li>the tempo you last used for each riff.</li>
          </ul>
          <p>
            None of it identifies you. Clearing the app&apos;s storage or uninstalling MANUS deletes all of it.
            Android&apos;s app backup is turned off for MANUS, so these settings aren&apos;t copied to a cloud backup.
          </p>
        </section>

        <section>
          <h2>Clips you record</h2>
          <p>
            When you press REC CLIP (or V), MANUS records the stage and the sound into an MP4. On Android 10 and later
            the file goes to Movies/MANUS in your phone&apos;s shared storage, where your gallery and file apps can see
            it. On older versions it goes to the app&apos;s own Movies folder. MANUS records only while you&apos;ve
            asked it to, and never shares a clip on its own. What happens to a clip after that is up to you.
          </p>
        </section>

        <section>
          <h2>MIDI</h2>
          <p>
            If you plug in a MIDI device and turn MIDI on, MANUS sends notes and controller messages to it and can
            follow its clock. That traffic goes over the cable or Bluetooth link to your device and nowhere else.
          </p>
        </section>

        <section>
          <h2>Links</h2>
          <p>
            The credit line on the console opens karano.me in your browser. That&apos;s your browser
            visiting a website, under that site&apos;s own policy. MANUS itself sends nothing.
          </p>
        </section>

        <section>
          <h2>Children</h2>
          <p>MANUS doesn&apos;t collect personal information from anyone, children included.</p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            If this policy changes, the new version will be published at the same address with a new date at the top.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions go to Karan Oroumchi at <a href="mailto:privacy@karano.me">privacy@karano.me</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
