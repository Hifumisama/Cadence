import type { EvenementSuivi } from "./types";

// Decoding of ComfyUI WebSocket messages. Tolerant by design: an
// unknown, truncated or future-version message returns `null`, never an
// exception — tracking is a convenience, not a dependency.

/** Binary event types (server.py, BinaryEventTypes). */
const BIN_PREVIEW_IMAGE = 1;
const BIN_PREVIEW_IMAGE_AVEC_METADONNEES = 4;

type Format = "jpeg" | "png" | "webp" | "inconnu";

/** Recognizes an image by its magic bytes rather than by the announced header:
 * ComfyUI versions differ on whether the 4-byte « format » is present. */
function formatImage(b: Uint8Array, debut: number): Format | null {
  if (b[debut] === 0xff && b[debut + 1] === 0xd8 && b[debut + 2] === 0xff) return "jpeg";
  if (b[debut] === 0x89 && b[debut + 1] === 0x50 && b[debut + 2] === 0x4e && b[debut + 3] === 0x47) return "png";
  if (
    b[debut] === 0x52 && b[debut + 1] === 0x49 && b[debut + 2] === 0x46 && b[debut + 3] === 0x46 &&
    b[debut + 8] === 0x57 && b[debut + 9] === 0x45 && b[debut + 10] === 0x42 && b[debut + 11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

/** Looks for the start of an image in the 8 bytes following `depuis`. */
function trouverImage(b: Uint8Array, depuis: number): { debut: number; format: Format } | null {
  for (let i = depuis; i <= Math.min(depuis + 8, b.length - 4); i++) {
    const f = formatImage(b, i);
    if (f) return { debut: i, format: f };
  }
  return null;
}

export type MessageBinaire = { evenement: number; promptId?: string; noeud?: string; apercu?: Extract<EvenementSuivi, { type: "apercu" }> };

/** Decodes a binary message. `evenement` is the raw type (useful to the debug
 * log), `apercu` is only filled for a recognized image. */
export function decoderBinaire(donnees: Uint8Array): MessageBinaire | null {
  if (donnees.length < 4) return null;
  const vue = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength);
  const evenement = vue.getUint32(0, false);
  const buf = Buffer.from(donnees.buffer, donnees.byteOffset, donnees.byteLength);

  if (evenement === BIN_PREVIEW_IMAGE) {
    const img = trouverImage(donnees, 4);
    if (!img) return { evenement };
    return { evenement, apercu: { type: "apercu", octets: buf.subarray(img.debut), format: img.format } };
  }

  if (evenement === BIN_PREVIEW_IMAGE_AVEC_METADONNEES) {
    if (donnees.length < 8) return { evenement };
    const longueur = vue.getUint32(4, false);
    const finMeta = 8 + longueur;
    if (finMeta > donnees.length) return { evenement };
    let meta: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(buf.subarray(8, finMeta).toString("utf-8"));
      if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
    } catch {
      // unreadable metadata: the image alone remains usable
    }
    const promptId = typeof meta.prompt_id === "string" ? meta.prompt_id : undefined;
    const noeud = [meta.display_node_id, meta.real_node_id, meta.node_id].find((v) => typeof v === "string") as string | undefined;
    const img = trouverImage(donnees, finMeta);
    if (!img) return { evenement, promptId, noeud };
    return { evenement, promptId, noeud, apercu: { type: "apercu", octets: buf.subarray(img.debut), format: img.format, noeud } };
  }

  return { evenement };
}

export type MessageJson = { evenement: EvenementSuivi | null; promptId?: string };

/** Decodes a text message. `evenement` is null for everything we do not use
 * (status, progress_state, execution_cached…). */
export function decoderTexte(texte: string): MessageJson | null {
  let msg: { type?: unknown; data?: Record<string, unknown> };
  try {
    msg = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!msg || typeof msg.type !== "string") return null;
  const d = msg.data ?? {};
  const promptId = typeof d.prompt_id === "string" ? d.prompt_id : undefined;
  const texteDe = (v: unknown) => (typeof v === "string" ? v : undefined);

  switch (msg.type) {
    case "execution_start":
      return { promptId, evenement: { type: "demarre" } };
    case "executing": {
      const noeud = texteDe(d.node);
      // `node: null` = end of execution in older versions.
      return { promptId, evenement: noeud ? { type: "noeud", noeud } : null };
    }
    case "progress": {
      const valeur = Number(d.value);
      const max = Number(d.max);
      if (!Number.isFinite(valeur) || !Number.isFinite(max) || max <= 0) return { promptId, evenement: null };
      return { promptId, evenement: { type: "progression", valeur, max, noeud: texteDe(d.node) ?? "" } };
    }
    case "execution_success":
      return { promptId, evenement: { type: "termine" } };
    case "execution_error":
      return {
        promptId,
        evenement: {
          type: "erreur",
          message: [texteDe(d.node_type), texteDe(d.exception_message)].filter(Boolean).join(" : ") || "Erreur ComfyUI",
        },
      };
    case "execution_interrupted":
      return { promptId, evenement: { type: "erreur", message: "Exécution interrompue côté ComfyUI" } };
    default:
      return { promptId, evenement: null };
  }
}
