import { CREATIVITES, STYLE_AUCUN } from "./settings";
import { STYLES_CAMERA } from "./styles-camera";

// --- Demo identifiers (file names under data/mises-en-scene/) --------------------------------------------------------------------------

export const cleDemoStyle = (style: string): string => `style-${style}`;
export const cleDemoCreativite = (niveau: string): string => `creativite-${niveau}`;

/** The 8 style demos (« aucun » + the 7 profiles), then the 4 creativity ones. */
const CLES_DEMOS_STYLES: readonly string[] = [STYLE_AUCUN, ...STYLES_CAMERA].map(cleDemoStyle);
const CLES_DEMOS_CREATIVITE: readonly string[] = CREATIVITES.map(cleDemoCreativite);
export const CLES_DEMOS: readonly string[] = [...CLES_DEMOS_STYLES, ...CLES_DEMOS_CREATIVITE];

/** The path RELATIVE to MEDIA_ROOT of a demo (`/api/media/<chemin>` to serve it). */
export const cheminDemo = (cle: string, ext: "mp4" | "webp"): string => `mises-en-scene/${cle}.${ext}`;

/** What the screen knows about a produced demo. */
export type DemoDispo = { video: string; affiche: string | null };

// --- The scene: « La poursuite sur le toit » ----------------------------------------------------------------------------------------------------

/** The narration, deliberately open: NO word of light, colour, framing or camera movement (Open H3 IR would read them as directions and leave less room
 * for the style: h3ir/licence.py), NO director's name. */
export const NARRATION_DEMOS =
  "Une femme fuit en courant sur le toit plat d'un immeuble. Au bord du vide, elle ne ralentit pas : elle prend son élan et saute par-dessus l'écart de trois mètres, quatre étages au-dessus de la rue. Elle retombe de justesse sur le toit voisin, roule sur le béton et se relève, à bout de souffle. Resté de l'autre côté, un homme la regarde, sidéré, incapable de la suivre.";
export const REPLIQUES_DEMOS = ["L'homme : « Tu es complètement folle ! »", "La femme : « Viens, on n'a pas le temps. »"];

/** « Styles » series: the scene with its two lines (the `NOM : « texte »` format of the screenplay skills). */
export const DESCRIPTION_DEMOS_AVEC_REPLIQUES = [NARRATION_DEMOS, "", ...REPLIQUES_DEMOS].join("\n");
/** « Créativité » series: the same action WITHOUT a line, so that one sees the « audacieuse » level add some. */
/** A scene of power (kung-fu, fire): on a silent, sober scene the creativity levels looked alike; here « sobre » stays wise and « extrême » has something to push with. The fire is written
 * in text, not as a reference image (an effect reference is followed too literally). */
export const NARRATION_CREATIVITE_DEMOS =
  "Une femme enchaîne des mouvements de kung-fu sur le toit plat d'un immeuble, et chaque geste lance une boule de feu. Elle bondit en créant un tourbillon de flammes autour d'elle, puis retombe au sol d'un mouvement stylé, de super-héroïne : un genou à terre, un poing contre le béton, tandis que trois piliers de feu surgissent du sol autour d'elle. Resté de l'autre côté du vide, un homme la regarde, sidéré.";

/** The three references, NEUTRAL: soft even lighting, sober palette, composition without effect (the reference shot prevails over the style for light and
 * colours, and a perfect symmetry would favour a style). `role`: the one the Open H3 IR brief declares (lib/h3ir/brief.ts, `ROLE_PAR_TYPE`). */
export type AssetDemo = { code: string; label: string; type: "personnage" | "decor"; role: "subject" | "environment"; description: string; promptGeneration: string };
export const ASSETS_DEMOS: readonly AssetDemo[] = [
  {
    code: "CHAR_la_femme",
    label: "La femme",
    type: "personnage",
    role: "subject",
    description: "Femme d'une trentaine d'années, silhouette athlétique, carré noir asymétrique, regard franc, veste de terrain ajustée vert olive, écharpe rouille nouée au cou, pantalon noir slim, bottines de cuir brun.",
    promptGeneration:
      "A woman in her thirties, athletic build, sharp asymmetric black bob haircut, determined direct gaze, fitted olive-green utility jacket with a rust-orange scarf knotted at the neck, slim black trousers, tan leather ankle boots, neutral standing pose, plain light grey background, soft even diffuse lighting, no cast shadows, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground, photorealistic, sharp focus",
  },
  {
    code: "CHAR_l_homme",
    label: "L'homme",
    type: "personnage",
    role: "subject",
    description: "Homme d'une quarantaine d'années, grand, carrure large, cheveux courts poivre et sel, barbe courte grisonnante, long manteau de laine anthracite sur un pull bleu marine, jean sombre, bottes noires.",
    promptGeneration:
      "A tall broad-shouldered man in his forties, short salt-and-pepper hair, short greying beard, weary but alert expression, long charcoal wool coat over a navy sweater, dark jeans, black boots, neutral standing pose, plain light grey background, soft even diffuse lighting, no cast shadows, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground, photorealistic, sharp focus",
  },
  {
    code: "DEC_deux_toits",
    label: "Les deux toits",
    type: "decor",
    role: "environment",
    description: "Deux toits plats d'immeubles voisins en ville, séparés par un vide d'environ trois mètres, parapets bas, béton nu, un château d'eau, des conduits de ventilation et quelques antennes.",
    promptGeneration:
      "Two flat rooftops of neighbouring city apartment buildings separated by a gap of about three metres, low parapet walls, bare concrete surfaces with a water tank, ventilation ducts and a few antennas, seen from roof level at an oblique angle, uniform overcast sky, soft even diffuse lighting without strong shadows, neutral natural colours, photorealistic, wide 16:9 composition",
  },
] as const;
