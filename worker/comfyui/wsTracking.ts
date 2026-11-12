import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { EvenementSuivi, IssueSuivi, Suivi } from "./types";
import { decoderBinaire, decoderTexte } from "./wsDecoding";

// Tracking of a prompt through ComfyUI's WebSocket (`/ws?clientId=…`). It is added
// to the HTTP client, it does not replace it: /history remains the source of truth
// for the result and the fallback if the WebSocket drops.

export type EtatHistorique = "termine" | "erreur" | "en_cours";

export type OptionsSuivi = {
  /** Base HTTP(S) URL of ComfyUI, e.g. https://comfyui.radiant-garden.fr */
  baseUrl: string;
  clientId: string;
  surEvenement: (e: EvenementSuivi) => void;
  /** Reads /history, to confirm an end the WebSocket missed. */
  etatHistorique: (promptId: string) => Promise<EtatHistorique>;
  /** Folder of the raw log (COMFYUI_WS_DEBUG=1), or undefined. */
  dossierDebug?: string;
  delaiOuvertureMs?: number;
  intervalleHistoriqueMs?: number;
};

const SUIVI_MORT: Suivi = {
  attendre: async () => "coupure",
  fermer: () => undefined,
};

function urlWs(baseUrl: string, clientId: string): string {
  return `${baseUrl.replace(/\/+$/, "").replace(/^http/, "ws")}/ws?clientId=${encodeURIComponent(clientId)}`;
}

function hex(octets: Uint8Array, n = 24): string {
  return Buffer.from(octets.subarray(0, n)).toString("hex");
}

export async function ouvrirSuiviWs(opts: OptionsSuivi): Promise<Suivi> {
  if (typeof WebSocket === "undefined") return SUIVI_MORT;

  const journal = opts.dossierDebug ? creerJournal(opts.dossierDebug) : null;

  let ws: WebSocket;
  try {
    ws = new WebSocket(urlWs(opts.baseUrl, opts.clientId));
    ws.binaryType = "arraybuffer";
  } catch {
    return SUIVI_MORT;
  }

  let cible: string | null = null;
  let ferme = false;
  let fini: IssueSuivi | null = null;
  let reveil: (() => void) | null = null;

  const terminer = (issue: IssueSuivi) => {
    if (fini) return;
    fini = issue;
    reveil?.();
  };

  const emettre = (e: EvenementSuivi) => {
    try {
      opts.surEvenement(e);
    } catch {
      // a failing consumer must not cut the tracking
    }
  };

  const surMessage = (donnees: unknown) => {
    try {
      if (typeof donnees === "string") {
        journal?.(`texte ${donnees.length} o  ${donnees.slice(0, 200).replace(/\s+/g, " ")}`);
        const m = decoderTexte(donnees);
        if (!m?.evenement) return;
        if (cible && m.promptId && m.promptId !== cible) return;
        emettre(m.evenement);
        if (m.evenement.type === "termine") terminer("termine");
        if (m.evenement.type === "erreur") terminer("erreur");
        return;
      }
      const octets = donnees instanceof ArrayBuffer ? new Uint8Array(donnees) : ArrayBuffer.isView(donnees) ? new Uint8Array(donnees.buffer, donnees.byteOffset, donnees.byteLength) : null;
      if (!octets) {
        journal?.(`inconnu (${Object.prototype.toString.call(donnees)})`);
        return;
      }
      const b = decoderBinaire(octets);
      journal?.(`binaire ${octets.length} o  evenement=${b?.evenement ?? "?"}  ${b?.apercu ? `image ${b.apercu.format}` : "pas d'image reconnue"}  début=${hex(octets)}`);
      if (!b?.apercu) return;
      if (cible && b.promptId && b.promptId !== cible) return;
      emettre(b.apercu);
    } catch (err) {
      journal?.(`exception de décodage : ${String(err)}`);
    }
  };

  const ouvert = await new Promise<boolean>((resolve) => {
    const minuteur = setTimeout(() => resolve(false), opts.delaiOuvertureMs ?? 5_000);
    ws.addEventListener("open", () => {
      clearTimeout(minuteur);
      resolve(true);
    });
    ws.addEventListener("error", () => {
      clearTimeout(minuteur);
      resolve(false);
    });
    ws.addEventListener("close", () => {
      clearTimeout(minuteur);
      resolve(false);
    });
  });
  if (!ouvert) {
    try {
      ws.close();
    } catch {
      // already closed
    }
    return SUIVI_MORT;
  }

  ws.addEventListener("message", (ev: MessageEvent) => surMessage(ev.data));
  ws.addEventListener("close", () => {
    ferme = true;
    terminer("coupure");
  });
  ws.addEventListener("error", () => {
    ferme = true;
    terminer("coupure");
  });

  const fermer = () => {
    ferme = true;
    try {
      ws.close();
    } catch {
      // already closed
    }
  };

  return {
    fermer,
    async attendre(promptId, delaiMs) {
      cible = promptId;
      const echeance = Date.now() + delaiMs;
      const intervalle = opts.intervalleHistoriqueMs ?? 5_000;

      // A short prompt may have finished before we track it: /history decides.
      const verifier = async (): Promise<IssueSuivi | null> => {
        try {
          const etat = await opts.etatHistorique(promptId);
          if (etat === "termine") return "termine";
          if (etat === "erreur") return "erreur";
        } catch {
          // unreachable: we rely on the WebSocket
        }
        return null;
      };

      for (;;) {
        const deja = await verifier();
        if (deja) return deja;
        if (fini) return fini;
        if (ferme) return "coupure";
        const reste = echeance - Date.now();
        if (reste <= 0) return "delai";
        await new Promise<void>((resolve) => {
          const minuteur = setTimeout(resolve, Math.min(intervalle, reste));
          reveil = () => {
            clearTimeout(minuteur);
            resolve();
          };
          if (fini) reveil();
        });
        reveil = null;
        if (fini) return fini;
      }
    },
  };
}

function creerJournal(dossier: string): (ligne: string) => void {
  const fichier = join(dossier, `comfyui-ws-${new Date().toISOString().slice(0, 10)}.log`);
  const pret = mkdir(dossier, { recursive: true }).catch(() => undefined);
  return (ligne) => {
    void pret.then(() => appendFile(fichier, `${new Date().toISOString()}  ${ligne}\n`).catch(() => undefined));
  };
}
