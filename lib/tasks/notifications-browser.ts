/** NATIVE browser notifications (outside the tab) for the end of tasks. Client side
 * only. Two conditions: the user has enabled the option (localStorage) AND the
 * browser has granted permission. Permission is only requested on the click of the
 * toggle (a browser refuses it otherwise). */

const CLE = "cadence.notifications-navigateur";
export const EVENEMENT = "cadence:notifications";

export type EtatNotifications =
  | "indisponible" // the browser does not have the API
  | "bloquee" // refused in the site settings
  | "inactive" // possible, not enabled
  | "active";

function pris(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

function preference(): boolean {
  try {
    return window.localStorage.getItem(CLE) === "1";
  } catch {
    return false;
  }
}

function ecrire(v: boolean): void {
  try {
    window.localStorage.setItem(CLE, v ? "1" : "0");
  } catch {
    // storage unavailable (private browsing): the option applies to this session only
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

export function etatNotifications(): EtatNotifications {
  if (!pris()) return "indisponible";
  if (Notification.permission === "denied") return "bloquee";
  return Notification.permission === "granted" && preference() ? "active" : "inactive";
}

/** Enables the option: asks for permission if needed (call from a click). */
export async function activerNotifications(): Promise<EtatNotifications> {
  if (!pris()) return "indisponible";
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission === "granted") ecrire(true);
  window.dispatchEvent(new Event(EVENEMENT));
  return etatNotifications();
}

export function desactiverNotifications(): void {
  if (pris()) ecrire(false);
}

/** The page is not in front of the user: hidden tab or window without focus. */
export function pageEnArriere(): boolean {
  return document.visibilityState !== "visible" || !document.hasFocus();
}

/** Sends a native notification; `surClic` runs on click (the window regains focus). */
export function notifier(titre: string, corps: string, tag: string, surClic: () => void): boolean {
  if (etatNotifications() !== "active") return false;
  try {
    const n = new Notification(titre, { body: corps, tag, silent: false });
    n.onclick = () => {
      window.focus();
      surClic();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
