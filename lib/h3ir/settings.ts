import { FICHES_PERSO, IDS_PROFILS_PERSO, type ProfilPersoId } from "./character-profiles";
import { STYLES_CAMERA } from "./styles-camera";

/** Open H3 IR creativity and staging style, set at the PROJECT level, overridable per SCENE then per CLIP: the most precise wins (step 7 of the project,
 * docs/PLAN_INTEGRATION_OPEN_H3_IR.md). Pure and without database access: importable client-side as well as server-side and worker-side.
 *
 * Each level stores `null` (= inherits), or a value. For the style, `"aucun"` is a value: it forces the absence of style over a style defined higher up.
 * Defaults when nothing is set: « équilibrée » creativity (the package's), no style. The « staging style » is one of the package's `director` profiles (7 directors)
 * or one of our six custom profiles (`director_profile`, character-profiles.ts): a complete taste (camera, framing, light, acting, sounds, music) that only fills
 * what the request and the images do not settle. It is not the « réalisateur » removed on 2026-10-20. */

export const CREATIVITES = ["restrained", "balanced", "bold", "extreme"] as const;
export type Creativite = (typeof CREATIVITES)[number];
export const CREATIVITE_PAR_DEFAUT: Creativite = "balanced";

export const LIBELLE_CREATIVITE: Record<Creativite, string> = {
  restrained: "Sobre",
  balanced: "Équilibrée",
  bold: "Audacieuse",
  extreme: "Extrême",
};

/** What each level does, in one sentence for the interface. */
export const AIDE_CREATIVITE: Record<Creativite, string> = {
  restrained: "N'ajoute rien : ni musique, ni paroles, ni texte à l'écran.",
  balanced: "Ajoute de la musique et soigne le cadrage et l'ambiance.",
  bold: "Se permet aussi des paroles, du texte à l'écran et une caméra plus appuyée (sans garantie : sur une scène muette, elle ressemble souvent à « équilibrée »).",
  extreme: "Pousse chaque choix au maximum : caméra ample et rapide, contrastes durs.",
};

/** One of the 7 bundled `director` profiles (directors). */
export type StyleCamera = (typeof STYLES_CAMERA)[number];
/** A « staging style » choice: one of the 7 directors (`director`) OR a custom profile (`director_profile`, character-profiles.ts). This is what the
 * `style_camera` columns of the project, the scene and the clip store, and what `resoudreReglages` resolves. */
export type ChoixMiseEnScene = StyleCamera | ProfilPersoId;
/** All the choices, in menu order: the directors then the custom profiles. */
export const MISES_EN_SCENE: readonly ChoixMiseEnScene[] = [...STYLES_CAMERA, ...IDS_PROFILS_PERSO];
/** Value of a level that forces « no style » despite a style defined higher up. */
export const STYLE_AUCUN = "aucun";

/** The name of the director the profile is inspired by (the package calls it `name`). It only speaks to cinephiles: the interface always shows it after a summary (`libelleStyleComplet`). */
export const LIBELLE_STYLE_CAMERA: Record<StyleCamera, string> = {
  cameron: "James Cameron",
  tarantino: "Quentin Tarantino",
  anderson: "Wes Anderson",
  villeneuve: "Denis Villeneuve",
  bigelow: "Kathryn Bigelow",
  wong: "Wong Kar-wai",
  spielberg: "Steven Spielberg",
};

/** The style in a few words, for someone who does not know the director. Written from the package's profiles (h3ir/director.py). */
const RESUME_REALISATEURS: Record<StyleCamera, string> = {
  cameron: "Action ample et mécanique",
  tarantino: "Dialogues posés, inserts francs",
  anderson: "Symétrie et ordre",
  villeneuve: "Immense et silencieux",
  bigelow: "Réalisme brut, sur le vif",
  wong: "Intime, nocturne, néons",
  spielberg: "Émerveillement, visages",
};

/** What the profile does, in one sentence: camera, light, acting, sounds. */
const DETAIL_REALISATEURS: Record<StyleCamera, string> = {
  cameron:
    "Caméra qui voyage avec les corps et les machines, grands espaces et contre-plongées, lumière dure et froide avec une source ambre, bruits de mécanique, orchestre qui monte lentement.",
  tarantino:
    "Caméra fixe et frontale (ou très basse), longs temps de parole, gros plans sur les mains, les pieds et les objets, couleurs riches et saturées, musique d'ambiance qui ne monte pas.",
  anderson:
    "Plans de face parfaitement centrés et symétriques, mouvements rectilignes, lumière douce et palette pastel, objets alignés, jeu pince-sans-rire, petite musique à cordes pincées.",
  villeneuve:
    "Caméra très lente, figures minuscules devant des étendues immenses, brume et une seule teinte à la fois, jeu retenu, grands silences et basses profondes.",
  bigelow:
    "Caméra portée et nerveuse, cadres serrés et gênés par ce qui passe devant, lumière du lieu et couleurs ternes, gestes techniques de métier, sons directs, presque pas de musique.",
  wong:
    "Caméra basse et proche, cadres obstrués (porte, miroir, épaule), néons saturés la nuit, gestes retenus, gens très proches qui ne se touchent pas, une petite mélodie qui boucle.",
  spielberg:
    "Caméra qui avance doucement vers un visage, contre-jour chaud et haze, la réaction plutôt que sa cause, jeu sincère, grand orchestre à mélodie claire.",
};

const parProfilPerso = (cle: "libelle" | "resume"): Record<ProfilPersoId, string> =>
  Object.fromEntries(IDS_PROFILS_PERSO.map((id) => [id, FICHES_PERSO[id][cle]])) as Record<ProfilPersoId, string>;
/** The choice in a few words (title of a card): for a custom profile, its label. */
export const RESUME_STYLE_CAMERA: Record<ChoixMiseEnScene, string> = { ...RESUME_REALISATEURS, ...parProfilPerso("libelle") };
/** What the choice does, in one sentence: for a custom profile, its summary. */
export const DETAIL_STYLE_CAMERA: Record<ChoixMiseEnScene, string> = { ...DETAIL_REALISATEURS, ...parProfilPerso("resume") };

/** « Immense et silencieux — style de Denis Villeneuve »: what the menus show. */
export const libelleStyleComplet = (s: ChoixMiseEnScene): string => (estStyleCamera(s) ? `${RESUME_STYLE_CAMERA[s]} — style de ${LIBELLE_STYLE_CAMERA[s]}` : RESUME_STYLE_CAMERA[s]);
/** « style de Denis Villeneuve » for a director; empty for a custom profile (no studio or author name is shown). */
/** The tooltip of a choice: « James Cameron — caméra qui voyage… » for a director, « Anime d'action — poses extrêmes… » for a custom profile. */
export const infobulleChoix = (s: ChoixMiseEnScene): string => `${estStyleCamera(s) ? LIBELLE_STYLE_CAMERA[s] : RESUME_STYLE_CAMERA[s]} — ${DETAIL_STYLE_CAMERA[s]}`;
export const signatureChoix = (s: ChoixMiseEnScene): string => (estStyleCamera(s) ? `style de ${LIBELLE_STYLE_CAMERA[s]}` : "");

export const estCreativite = (v: unknown): v is Creativite => typeof v === "string" && (CREATIVITES as readonly string[]).includes(v);
export const estProfilPerso = (v: unknown): v is ProfilPersoId => typeof v === "string" && (IDS_PROFILS_PERSO as readonly string[]).includes(v);
export const estMiseEnScene = (v: unknown): v is ChoixMiseEnScene => estStyleCamera(v) || estProfilPerso(v);
export const estStyleCamera = (v: unknown): v is StyleCamera => typeof v === "string" && (STYLES_CAMERA as readonly string[]).includes(v);

/** A valid creativity, or `null` (= inherits). */
export const creativiteOuNull = (v: unknown): Creativite | null => (estCreativite(v) ? v : null);
/** A valid staging choice (director or custom profile) or `"aucun"`, or `null` (= inherits). */
export const styleCameraOuNull = (v: unknown): ChoixMiseEnScene | typeof STYLE_AUCUN | null => (estMiseEnScene(v) || v === STYLE_AUCUN ? (v as ChoixMiseEnScene | typeof STYLE_AUCUN) : null);

export type NiveauReglage = "plan" | "scene" | "projet" | "defaut";
export const LIBELLE_NIVEAU: Record<NiveauReglage, string> = { plan: "ce plan", scene: "la scène", projet: "le projet", defaut: "le réglage par défaut" };

/** What a level stores (`creativite` and `style_camera` columns). */
export type ReglagesBruts = { creativite?: string | null; styleCamera?: string | null };

export type ReglagesResolus = {
  creativite: Creativite;
  /** `null`: no style (set « aucun » somewhere, or never set). */
  styleCamera: ChoixMiseEnScene | null;
  /** The level each value comes from. */
  origine: { creativite: NiveauReglage; styleCamera: NiveauReglage };
};

/** The clip beats the scene, which beats the project; with nothing set, the defaults. */
export function resoudreReglages(niveaux: { projet?: ReglagesBruts | null; scene?: ReglagesBruts | null; plan?: ReglagesBruts | null }): ReglagesResolus {
  const ordre: [NiveauReglage, ReglagesBruts | null | undefined][] = [
    ["plan", niveaux.plan],
    ["scene", niveaux.scene],
    ["projet", niveaux.projet],
  ];
  let creativite: Creativite = CREATIVITE_PAR_DEFAUT;
  let origineCreativite: NiveauReglage = "defaut";
  let style: ChoixMiseEnScene | null = null;
  let origineStyle: NiveauReglage = "defaut";
  for (const [niveau, r] of ordre) {
    const c = creativiteOuNull(r?.creativite);
    if (c) {
      creativite = c;
      origineCreativite = niveau;
      break;
    }
  }
  for (const [niveau, r] of ordre) {
    const s = styleCameraOuNull(r?.styleCamera);
    if (s) {
      style = s === STYLE_AUCUN ? null : s;
      origineStyle = niveau;
      break;
    }
  }
  return { creativite, styleCamera: style, origine: { creativite: origineCreativite, styleCamera: origineStyle } };
}

/** What the creation assistant (`/nouveau`) sends for staging: creativity and style, validated. An absent or unknown value falls back to the screen's starting point
 * (creativity « équilibrée », « aucun style »), never to `null`: a project created by the assistant carries its EXPLICIT values, which the Brief page shows as coming from the project. */
export function reglagesDepuisCharge(brut: unknown): { creativite: Creativite; styleCamera: ChoixMiseEnScene | typeof STYLE_AUCUN } {
  const b = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  return { creativite: creativiteOuNull(b.creativite) ?? CREATIVITE_PAR_DEFAUT, styleCamera: styleCameraOuNull(b.styleCamera) ?? STYLE_AUCUN };
}

/** « Équilibrée · Immense et silencieux »: a project's staging in a few words (the design ribbon, the clap board). An absent value takes the default. */
export function resumeMiseEnScene(creativite: string | null | undefined, styleCamera: string | null | undefined): string {
  const r = resoudreReglages({ projet: { creativite, styleCamera } });
  return `${LIBELLE_CREATIVITE[r.creativite]} · ${r.styleCamera ? RESUME_STYLE_CAMERA[r.styleCamera] : "aucun style"}`;
}
