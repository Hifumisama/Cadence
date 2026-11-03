import { STYLES_CAMERA } from "./styles-camera";

/** Créativité et style de mise en scène d'Open H3 IR, réglés au niveau du PROJET, surchargeables par SCÈNE puis par PLAN : le plus précis gagne (étape 7 du chantier,
 * docs/PLAN_INTEGRATION_OPEN_H3_IR.md). Pur et sans accès base : importable côté client comme côté serveur et worker.
 *
 * Chaque niveau stocke `null` (= hérite), ou une valeur. Pour le style, `"aucun"` est une valeur : elle force l'absence de style par-dessus un style défini plus haut.
 * Défauts quand rien n'est réglé : créativité « équilibrée » (celle du paquet), aucun style. Le « style de mise en scène » est l'un des profils `director` du paquet : un goût
 * complet (caméra, cadrage, lumière, jeu, sons, musique) qui ne remplit que ce que la demande et les images ne tranchent pas. Ce n'est pas le « réalisateur » retiré le 2026-10-20. */

export const CREATIVITES = ["restrained", "balanced", "bold", "extreme"] as const;
export type Creativite = (typeof CREATIVITES)[number];
export const CREATIVITE_PAR_DEFAUT: Creativite = "balanced";

export const LIBELLE_CREATIVITE: Record<Creativite, string> = {
  restrained: "Sobre",
  balanced: "Équilibrée",
  bold: "Audacieuse",
  extreme: "Extrême",
};

/** Ce que chaque niveau fait, en une phrase pour l'interface. */
export const AIDE_CREATIVITE: Record<Creativite, string> = {
  restrained: "N'ajoute rien : ni musique, ni paroles, ni texte à l'écran.",
  balanced: "Ajoute de la musique et soigne le cadrage et l'ambiance.",
  bold: "Se permet aussi des paroles, du texte à l'écran et une caméra plus appuyée (sans garantie : sur une scène muette, elle ressemble souvent à « équilibrée »).",
  extreme: "Pousse chaque choix au maximum : caméra ample et rapide, contrastes durs.",
};

export type StyleCamera = (typeof STYLES_CAMERA)[number];
/** Valeur d'un niveau qui force « aucun style » malgré un style défini plus haut. */
export const STYLE_AUCUN = "aucun";

/** Le nom du réalisateur dont le profil s'inspire (le paquet l'appelle `name`). Il ne parle qu'aux cinéphiles : l'interface le montre toujours après un résumé (`libelleStyleComplet`). */
export const LIBELLE_STYLE_CAMERA: Record<StyleCamera, string> = {
  cameron: "James Cameron",
  tarantino: "Quentin Tarantino",
  anderson: "Wes Anderson",
  villeneuve: "Denis Villeneuve",
  bigelow: "Kathryn Bigelow",
  wong: "Wong Kar-wai",
  spielberg: "Steven Spielberg",
};

/** Le style en quelques mots, pour qui ne connaît pas le réalisateur. Écrit d'après les profils du paquet (h3ir/director.py). */
export const RESUME_STYLE_CAMERA: Record<StyleCamera, string> = {
  cameron: "Action ample et mécanique",
  tarantino: "Dialogues posés, inserts francs",
  anderson: "Symétrie et ordre",
  villeneuve: "Immense et silencieux",
  bigelow: "Réalisme brut, sur le vif",
  wong: "Intime, nocturne, néons",
  spielberg: "Émerveillement, visages",
};

/** Ce que le profil fait, en une phrase : caméra, lumière, jeu, sons. */
export const DETAIL_STYLE_CAMERA: Record<StyleCamera, string> = {
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

/** « Immense et silencieux — style de Denis Villeneuve » : ce que les menus affichent. */
export const libelleStyleComplet = (s: StyleCamera): string => `${RESUME_STYLE_CAMERA[s]} — style de ${LIBELLE_STYLE_CAMERA[s]}`;

export const estCreativite = (v: unknown): v is Creativite => typeof v === "string" && (CREATIVITES as readonly string[]).includes(v);
export const estStyleCamera = (v: unknown): v is StyleCamera => typeof v === "string" && (STYLES_CAMERA as readonly string[]).includes(v);

/** Une créativité valide, ou `null` (= hérite). */
export const creativiteOuNull = (v: unknown): Creativite | null => (estCreativite(v) ? v : null);
/** Un style valide ou `"aucun"`, ou `null` (= hérite). */
export const styleCameraOuNull = (v: unknown): StyleCamera | typeof STYLE_AUCUN | null => (estStyleCamera(v) || v === STYLE_AUCUN ? (v as StyleCamera | typeof STYLE_AUCUN) : null);

export type NiveauReglage = "plan" | "scene" | "projet" | "defaut";
export const LIBELLE_NIVEAU: Record<NiveauReglage, string> = { plan: "ce plan", scene: "la scène", projet: "le projet", defaut: "le réglage par défaut" };

/** Ce qu'un niveau stocke (colonnes `creativite` et `style_camera`). */
export type ReglagesBruts = { creativite?: string | null; styleCamera?: string | null };

export type ReglagesResolus = {
  creativite: Creativite;
  /** `null` : aucun style (réglé « aucun » quelque part, ou jamais réglé). */
  styleCamera: StyleCamera | null;
  /** Le niveau d'où vient chaque valeur. */
  origine: { creativite: NiveauReglage; styleCamera: NiveauReglage };
};

/** Le plan l'emporte sur la scène, qui l'emporte sur le projet ; sans rien de réglé, les défauts. */
export function resoudreReglages(niveaux: { projet?: ReglagesBruts | null; scene?: ReglagesBruts | null; plan?: ReglagesBruts | null }): ReglagesResolus {
  const ordre: [NiveauReglage, ReglagesBruts | null | undefined][] = [
    ["plan", niveaux.plan],
    ["scene", niveaux.scene],
    ["projet", niveaux.projet],
  ];
  let creativite: Creativite = CREATIVITE_PAR_DEFAUT;
  let origineCreativite: NiveauReglage = "defaut";
  let style: StyleCamera | null = null;
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

/** Ce que l'assistant de création (`/nouveau`) envoie pour la mise en scène : créativité et style, validés. Une valeur absente ou inconnue retombe sur le départ de l'écran
 * (créativité « équilibrée », « aucun style »), jamais sur `null` : un projet créé par l'assistant porte ses valeurs EXPLICITES, que la page Brief affiche comme venant du projet. */
export function reglagesDepuisCharge(brut: unknown): { creativite: Creativite; styleCamera: StyleCamera | typeof STYLE_AUCUN } {
  const b = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  return { creativite: creativiteOuNull(b.creativite) ?? CREATIVITE_PAR_DEFAUT, styleCamera: styleCameraOuNull(b.styleCamera) ?? STYLE_AUCUN };
}

/** « Équilibrée · Immense et silencieux » : la mise en scène d'un projet en quelques mots (ruban de la conception, planche du clap). Une valeur absente vaut le défaut. */
export function resumeMiseEnScene(creativite: string | null | undefined, styleCamera: string | null | undefined): string {
  const r = resoudreReglages({ projet: { creativite, styleCamera } });
  return `${LIBELLE_CREATIVITE[r.creativite]} · ${r.styleCamera ? RESUME_STYLE_CAMERA[r.styleCamera] : "aucun style"}`;
}
