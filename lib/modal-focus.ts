import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
  Focus handling for a modal dialog that is mounted only while open: focus moves to its first control when it
  opens, Tab and Shift+Tab stay inside it, and focus goes back to what opened it when it closes.
  Put the returned ref on the element that has role="dialog".
*/
export function useModalFocus<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const box = ref.current;
    if (!open || !box) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.getClientRects().length > 0);

    (controls()[0] ?? box).focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const list = controls();
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (!box!.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // the opener may be gone by now (the dialog was opened by a key, with nothing focused)
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return ref;
}
