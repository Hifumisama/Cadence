import { CREATIVITES, LIBELLE_CREATIVITE, LIBELLE_STYLE_CAMERA, STYLE_AUCUN, creativiteOuNull, styleCameraOuNull, type Creativite } from "./reglages";
import { STYLES_CAMERA } from "./styles-camera";

/** Les VIDÉOS DE DÉMO de l'écran « Mise en scène » de `/nouveau` : une même scène rendue selon chaque style de mise en scène, puis selon chaque niveau de créativité.
 * Elles se fabriquent dans un projet spécial (`NOM_PROJET_DEMOS`) avec le pipeline normal de Cadence (références, fiche Open H3 IR, rendus du worker). Les rendus retenus sont publiés sous `data/mises-en-scene/` ;
 * le script qui les fabriquait a été retiré (historique git). Ce module est PUR (aucun accès base ni disque) : les identifiants, la scène, les références, le plan des
 * 12 plans et la correspondance plan → démo se testent et se lisent côté client comme serveur. */

export const NOM_PROJET_DEMOS = "Démos · mise en scène";
export const SCENE_STYLES = "Styles";
export const SCENE_CREATIVITE = "Créativité";
/** Même seed de rendu pour les 12 plans : seuls le style ou la créativité changent d'une démo à l'autre. */
export const SEED_DEMOS = "424242424242";
/** 10 s : 10,125 s sur la grille d'images (lib/grille-images.ts), assez pour une course, un saut et deux répliques. */
export const DUREE_DEMOS_SECONDES = 10;

// --- Identifiants des démos (noms de fichiers sous data/mises-en-scene/) --------------------------------------------------------------------------

export const cleDemoStyle = (style: string): string => `style-${style}`;
export const cleDemoCreativite = (niveau: string): string => `creativite-${niveau}`;

/** Les 8 démos de style (« aucun » + les 7 profils) puis les 4 de créativité. */
export const CLES_DEMOS_STYLES: readonly string[] = [STYLE_AUCUN, ...STYLES_CAMERA].map(cleDemoStyle);
export const CLES_DEMOS_CREATIVITE: readonly string[] = CREATIVITES.map(cleDemoCreativite);
export const CLES_DEMOS: readonly string[] = [...CLES_DEMOS_STYLES, ...CLES_DEMOS_CREATIVITE];

/** Le chemin RELATIF à MEDIA_ROOT d'une démo (`/api/media/<chemin>` pour la servir). */
export const cheminDemo = (cle: string, ext: "mp4" | "webp"): string => `mises-en-scene/${cle}.${ext}`;

/** Ce que l'écran sait d'une démo produite. */
export type DemoDispo = { video: string; affiche: string | null };

/** La démo à laquelle correspond un plan du projet de démos, ou null (plan hors série, ou réglages qui ne vont pas avec sa série).
 * - scène « Styles » : l'identifiant est le style du plan (« aucun » s'il n'en a pas) ; la créativité doit être équilibrée (vide ou « balanced »).
 * - scène « Créativité » : l'identifiant est le niveau du plan (vide = équilibrée) ; il ne doit pas avoir de style. */
export function cleDemoDuPlan(plan: { scene: string | null; creativite: string | null; styleCamera: string | null }): string | null {
  const creativite = creativiteOuNull(plan.creativite) ?? "balanced";
  const style = styleCameraOuNull(plan.styleCamera) ?? STYLE_AUCUN;
  if (plan.scene === SCENE_STYLES) return creativite === "balanced" ? cleDemoStyle(style) : null;
  if (plan.scene === SCENE_CREATIVITE) return style === STYLE_AUCUN ? cleDemoCreativite(creativite) : null;
  return null;
}

// --- La scène : « La poursuite sur le toit » ----------------------------------------------------------------------------------------------------

/** La narration, volontairement ouverte : AUCUN mot de lumière, de couleur, de cadrage ni de mouvement de caméra (Open H3 IR les verrait comme des consignes et laisserait moins
 * de place au style : h3ir/licence.py), AUCUN nom de réalisateur. */
export const NARRATION_DEMOS =
  "Une femme fuit en courant sur le toit plat d'un immeuble. Au bord du vide, elle ne ralentit pas : elle prend son élan et saute par-dessus l'écart de trois mètres, quatre étages au-dessus de la rue. Elle retombe de justesse sur le toit voisin, roule sur le béton et se relève, à bout de souffle. Resté de l'autre côté, un homme la regarde, sidéré, incapable de la suivre.";
export const REPLIQUES_DEMOS = ["L'homme : « Tu es complètement folle ! »", "La femme : « Viens, on n'a pas le temps. »"];

/** Série « Styles » : la scène avec ses deux répliques (le format `NOM : « texte »` des skills de scénario). */
export const DESCRIPTION_DEMOS_AVEC_REPLIQUES = [NARRATION_DEMOS, "", ...REPLIQUES_DEMOS].join("\n");
/** Série « Créativité » : la même action SANS réplique, pour qu'on voie le niveau « audacieuse » en ajouter. */
/** Une scène de pouvoir (kung-fu, feu) : sur une scène muette et sobre, les niveaux de créativité se ressemblaient ; ici « sobre » reste sage et « extrême » a de quoi pousser. Le feu est écrit
 * en texte, pas en image de référence (une référence d'effet est suivie trop à la lettre). */
export const NARRATION_CREATIVITE_DEMOS =
  "Une femme enchaîne des mouvements de kung-fu sur le toit plat d'un immeuble, et chaque geste lance une boule de feu. Elle bondit en créant un tourbillon de flammes autour d'elle, puis retombe au sol d'un mouvement stylé, de super-héroïne : un genou à terre, un poing contre le béton, tandis que trois piliers de feu surgissent du sol autour d'elle. Resté de l'autre côté du vide, un homme la regarde, sidéré.";
export const DESCRIPTION_DEMOS_SANS_REPLIQUE = NARRATION_CREATIVITE_DEMOS;

/** Les trois références, NEUTRES : lumière douce et uniforme, palette sobre, composition sans effet (le plan de référence l'emporte sur le style pour la lumière et les couleurs,
 * et une symétrie parfaite avantagerait un style). `role` : celui que le brief Open H3 IR déclare (lib/h3ir/brief.ts, `ROLE_PAR_TYPE`). */
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

// --- Les 12 plans du projet de démos -----------------------------------------------------------------------------------------------------------

export type PlanDemo = { titre: string; scene: string; description: string; creativite: Creativite | null; styleCamera: string | null; cle: string };

/** Les 12 plans, dans l'ordre : 8 de style (avec répliques, créativité équilibrée), puis 4 de créativité (sans réplique, sans style). Le réglage est écrit EXPLICITEMENT sur chaque plan. */
export function planifierDemos(): PlanDemo[] {
  const styles: PlanDemo[] = [STYLE_AUCUN, ...STYLES_CAMERA].map((s) => ({
    titre: `Style · ${s === STYLE_AUCUN ? "aucun style" : LIBELLE_STYLE_CAMERA[s as keyof typeof LIBELLE_STYLE_CAMERA]}`,
    scene: SCENE_STYLES,
    description: DESCRIPTION_DEMOS_AVEC_REPLIQUES,
    creativite: "balanced",
    styleCamera: s,
    cle: cleDemoStyle(s),
  }));
  const creativite: PlanDemo[] = CREATIVITES.map((c) => ({
    titre: `Créativité · ${LIBELLE_CREATIVITE[c]}`,
    scene: SCENE_CREATIVITE,
    description: DESCRIPTION_DEMOS_SANS_REPLIQUE,
    creativite: c,
    styleCamera: STYLE_AUCUN,
    cle: cleDemoCreativite(c),
  }));
  return [...styles, ...creativite];
}
