/** Notifications NATIVES du navigateur (hors de l'onglet) pour la fin des tâches. Côté
 * client seulement. Deux conditions : l'utilisateur a activé l'option (localStorage) ET le
 * navigateur a accordé l'autorisation. L'autorisation ne se demande qu'au clic sur
 * l'interrupteur (un navigateur la refuse sinon). */

const CLE = "cadence.notifications-navigateur";
export const EVENEMENT = "cadence:notifications";

export type EtatNotifications =
  | "indisponible" // le navigateur n'a pas l'API
  | "bloquee" // refusée dans les réglages du site
  | "inactive" // possible, pas activée
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
    // stockage indisponible (navigation privée) : l'option vaut pour cette session seulement
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

export function etatNotifications(): EtatNotifications {
  if (!pris()) return "indisponible";
  if (Notification.permission === "denied") return "bloquee";
  return Notification.permission === "granted" && preference() ? "active" : "inactive";
}

/** Active l'option : demande l'autorisation si besoin (appel depuis un clic). */
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

/** La page n'est pas sous les yeux de l'utilisateur : onglet caché ou fenêtre sans focus. */
export function pageEnArriere(): boolean {
  return document.visibilityState !== "visible" || !document.hasFocus();
}

/** Envoie une notification native ; `surClic` s'exécute au clic (la fenêtre reprend le focus). */
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
