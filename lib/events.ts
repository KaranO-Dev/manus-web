import { pageview } from "@vercel/analytics";

/*
  How far a visit gets into playing, counted with nothing personal and no cookies: the camera allowed or
  blocked, the first note from a pinch or without the camera, the first riff or song, the first gem caught,
  and a browser that had MANUS before. Vercel's custom events need the Pro plan; Hobby counts page views
  only, so each step is a page view of its own, /events/<name>, under Pages in Web Analytics. Each is sent
  at most once per page load, carries no properties, and nothing from the camera or the sound.
*/

export type EventName =
  | "camera-on"
  | "camera-blocked"
  | "note-pinch"
  | "note-no-camera"
  | "song-start"
  | "gem-caught"
  | "return-visit";

const sent = new Set<EventName>();

export function count(name: EventName) {
  if (sent.has(name)) return;
  sent.add(name);
  // Queued until Vercel's script is in, as @vercel/analytics does itself, so a step taken before it loads still counts
  window.va ??= (...params) => (window.vaq ??= []).push(params);
  pageview({ route: `/events/${name}`, path: `/events/${name}` });
}
