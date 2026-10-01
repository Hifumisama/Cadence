import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { EvenementSuivi, IssueSuivi, Suivi } from "./types";
import { decoderBinaire, decoderTexte } from "./wsDecodage";

// Suivi d'un prompt par le WebSocket de ComfyUI (`/ws?clientId=…`). Il s'ajoute
// au client HTTP, il ne le remplace pas : /history reste la source de vérité
// du résultat et le repli si le WebSocket tombe.

export type EtatHistorique = "termine" | "erreur" | "en_cours";

export type OptionsSuivi = {
  /** URL de base HTTP(S) de ComfyUI, ex. https://comfyui.radiant-garden.fr */
  baseUrl: string;
  clientId: string;
  surEvenement: (e: EvenementSuivi) => void;
  /** Lecture de /history, pour confirmer une fin manquée par le WebSocket. */
  etatHistorique: (promptId: string) => Promise<EtatHistorique>;
  /** Dossier du journal brut (COMFYUI_WS_DEBUG=1), ou undefined. */
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
      // un consommateur défaillant ne doit pas couper le suivi
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
      // déjà fermé
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
      // déjà fermé
    }
  };

  return {
    fermer,
    async attendre(promptId, delaiMs) {
      cible = promptId;
      const echeance = Date.now() + delaiMs;
      const intervalle = opts.intervalleHistoriqueMs ?? 5_000;

      // Un prompt court peut avoir fini avant qu'on le suive : /history tranche.
      const verifier = async (): Promise<IssueSuivi | null> => {
        try {
          const etat = await opts.etatHistorique(promptId);
          if (etat === "termine") return "termine";
          if (etat === "erreur") return "erreur";
        } catch {
          // injoignable : on s'en remet au WebSocket
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
