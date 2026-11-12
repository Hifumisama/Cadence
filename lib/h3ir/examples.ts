import type { ChoixMiseEnScene, Creativite, StyleCamera } from "./settings";

/** The aids that let one PICTURE oneself in the creativity and staging style choices (« Mise en scène » screen of /nouveau, lib/h3ir/settings.ts):
 * the same scene rendered at each choice, what each level adds, the films to know, when to pick it. Pure, no runtime import: readable client-side.
 *
 * The additions per level follow the Open H3 IR package (h3ir/creativity.py): « sobre » adds nothing; « équilibrée » only adds music; « audacieuse » and
 * « extrême » can add music, lyrics and on-screen text; « extrême » licenses nothing more, it pushes EACH choice to its maximum (wide and fast camera,
 * very tight or very wide frames, hard contrasts) without inventing any event. The example sentences are illustrative (our words, not an output of the model). */

/** The common scene of the examples: enough to compare the choices on the same action. */
export const SCENE_EXEMPLE = "Une femme ouvre une porte et découvre une pièce vide.";

// --- Creativity -------------------------------------------------------------------------------------------------------------------------------

export const PASTILLES_CREATIVITE = [
  { cle: "musique", libelle: "Musique" },
  { cle: "paroles", libelle: "Paroles" },
  { cle: "texteEcran", libelle: "Texte à l'écran" },
  { cle: "cameraAppuyee", libelle: "Caméra appuyée" },
  { cle: "maximum", libelle: "Tout au maximum" },
] as const;
export type ClePastille = (typeof PASTILLES_CREATIVITE)[number]["cle"];

/** What each level can add or push (true = allowed). Each level includes the one before it. */
export const AJOUTS_CREATIVITE: Record<Creativite, Record<ClePastille, boolean>> = {
  restrained: { musique: false, paroles: false, texteEcran: false, cameraAppuyee: false, maximum: false },
  balanced: { musique: true, paroles: false, texteEcran: false, cameraAppuyee: false, maximum: false },
  bold: { musique: true, paroles: true, texteEcran: true, cameraAppuyee: true, maximum: false },
  extreme: { musique: true, paroles: true, texteEcran: true, cameraAppuyee: true, maximum: true },
};

/** The same scene, rendered at each level. */
export const EXEMPLE_CREATIVITE: Record<Creativite, string> = {
  restrained: "Elle ouvre la porte et découvre la pièce vide. Rien de plus : pas de musique, pas de réplique, pas de texte, une caméra aussi simple que possible.",
  balanced: "Même scène, avec une musique discrète, un cadrage soigné sur sa main puis sur la pièce, le bruit du bois et l'écho d'un lieu vide. Aucun événement ajouté.",
  bold: "Même scène, où elle peut se permettre une musique qui monte, une réplique murmurée (« Il y a quelqu'un ? »), un mot discret qui s'inscrit à l'écran, et une caméra qui accompagne franchement son geste.",
  extreme: "Même scène, jouée à fond : travelling rapide jusqu'à son visage, gros plan extrême sur ses yeux, ombres très dures, un geste mené jusqu'au bout, avec musique, réplique et texte en plus.",
};

/** When to choose this level. */
export const QUAND_CREATIVITE: Record<Creativite, string> = {
  restrained: "Quand tu as tout écrit et que tu ne veux aucune surprise : l'IA n'ajoute que ce que ta description demande.",
  balanced: "Le choix de départ, sûr pour presque tout : l'IA met de la musique et soigne l'image, sans rien inventer d'autre.",
  bold: "Quand ta description est courte et que tu laisses l'IA proposer : elle se permet des mots, du texte à l'écran, de la musique et une caméra plus appuyée. Ce sont des permissions, pas des promesses : sur une scène déjà complète, la différence avec « équilibrée » reste discrète.",
  extreme: "Pour une scène spectaculaire ou très stylisée : tout est poussé le plus loin possible. Cela ne rajoute pas plus de choses que « audacieuse », cela les joue plus fort.",
};

// --- Staging style ------------------------------------------------------------------------------------------------------------------

/** The same scene, filmed in each style (the 7 directors, then the 6 custom profiles, which cite neither studio nor author). */
export const EXEMPLE_STYLE: Record<ChoixMiseEnScene, string> = {
  cameron:
    "La caméra suit son geste en mouvement et finit ailleurs que là où elle a commencé ; la pièce paraît immense, une lampe dure découpe sa silhouette dans un bleu froid, avec un bruit de métal et de souffle.",
  tarantino:
    "Caméra immobile, de face ou presque à ras du sol : on regarde sa main sur la poignée, puis elle reste dans le cadre un instant de trop, dans une lumière chaude et saturée.",
  anderson:
    "Plan parfaitement de face et centré : la porte au milieu, la femme au centre, lumière douce et couleurs pastel ; la caméra pivote d'un coup, bien à l'horizontale, vers la pièce.",
  villeneuve:
    "Plan très large : la femme et la porte sont minuscules dans un immense mur, de la brume dans l'air, une seule couleur ; la caméra avance très lentement, très longtemps.",
  bigelow:
    "Caméra à l'épaule, un peu en retard sur elle, cadre serré à moitié gêné par ce qui passe devant ; lumière du lieu, couleurs ternes, on entend sa respiration.",
  wong:
    "Caméra basse et proche, qui la regarde par l'embrasure de la porte ; une enseigne verte et rouge dans la nuit, un reflet dans un miroir, des gestes qui n'osent pas aller au bout.",
  spielberg:
    "La caméra s'approche doucement de son visage pendant qu'elle découvre la pièce : on lit la surprise avant de voir la pièce ; un rayon de lumière chaude traverse la poussière.",
  claymation:
    "Tout bouge par petits à-coups, comme image par image : la main de pâte à modeler pousse la porte, un temps d'arrêt, puis le visage rond s'étonne ; caméra posée sur une table, lumière chaude de maquette, bruits de tissu et de glaise.",
  "anime-nerveux":
    "Elle s'arrête net sur la porte en pose tenue, puis tout s'accélère : la caméra plonge vers ses yeux, un coup de vent secoue le cadre, bruit sec sur chaque mouvement et silence juste avant la découverte.",
  "anime-contemplatif":
    "La caméra reste immobile : la porte s'ouvre lentement, le vent fait bouger ses cheveux, un rideau et des grains de poussière flottent dans la lumière ; elle regarde longtemps, sans un mot.",
  "3d-cinema":
    "Un jeu d'acteur franc et lisible : elle hésite, un sourcil se lève, la caméra virtuelle glisse en douceur de sa main au fond de la pièce, lumière de cinéma et musique d'orchestre qui accompagne chaque émotion.",
  sitcom:
    "Un plan large et fixe de la pièce, lumière franche et plate : elle entre, regarde, laisse un temps pour la réaction, puis champ/contrechamp sur son visage ; aucune musique, comme devant un public.",
  horreur:
    "Un long plan fixe, un peu décentré, sur la porte qui s'ouvre sans bruit ; une lumière chiche, un son de pièce trop silencieux, elle avance lentement et rien ne se passe, jusqu'à ce que quelque chose bouge.",
};

/** Films many have seen, to recognise the style without knowing its director (the director's own films). */
export const FILMS_STYLE: Record<StyleCamera, readonly string[]> = {
  cameron: ["Terminator 2", "Aliens", "Titanic", "Avatar"],
  tarantino: ["Pulp Fiction", "Reservoir Dogs", "Kill Bill", "Inglourious Basterds"],
  anderson: ["The Grand Budapest Hotel", "Moonrise Kingdom", "La Famille Tenenbaum"],
  villeneuve: ["Dune", "Blade Runner 2049", "Premier Contact", "Sicario"],
  bigelow: ["Démineurs", "Zero Dark Thirty", "Point Break", "Detroit"],
  wong: ["In the Mood for Love", "Chungking Express", "2046", "Les Anges déchus"],
  spielberg: ["E.T.", "Rencontres du troisième type", "Jurassic Park", "Les Dents de la mer"],
};

/** When to choose this style. */
export const QUAND_STYLE: Record<ChoixMiseEnScene, string> = {
  cameron: "Action, science-fiction, grandes machines : quand on doit sentir l'effort et la taille des choses.",
  tarantino: "Dialogues, tension qui monte lentement, scènes de table ou de voiture : quand les mots et les objets comptent.",
  anderson: "Comédie douce, univers de conte, décors très soignés : quand l'ordre et la symétrie font le charme.",
  villeneuve: "Science-fiction, mystère, solitude, grands espaces : quand le silence et l'échelle racontent l'histoire.",
  bigelow: "Action réaliste, thriller, scènes sous tension : quand on veut du vécu, sans embellir.",
  wong: "Histoires d'amour, nostalgie, villes la nuit : quand le non-dit compte plus que ce qui se passe.",
  spielberg: "Aventure, émerveillement, révélations : quand l'important est ce que ressent le personnage.",
  claymation: "Pour un film en pâte à modeler ou en maquette : le style de ton projet donne l'apparence, cette façon de filmer lui donne le mouvement saccadé et la caméra de table.",
  "anime-nerveux": "Pour de l'action dessinée : combats, poursuites, sauts. Poses fortes, accélérations brusques et caméra qui plonge. L'apparence reste celle de ton style.",
  "anime-contemplatif": "Pour une histoire douce et lente : nature, enfance, souvenirs. Du temps, du vent, des plans qui laissent regarder. L'apparence reste celle de ton style.",
  "3d-cinema": "Pour un film d'animation 3D grand public : émotions lisibles, humour, caméra fluide qui suit l'action. L'apparence reste celle de ton style.",
  sitcom: "Pour une comédie de situation : dialogues, plans larges fixes, rythme de réplique et aucune musique de fond. Idéal quand les mots font le film.",
  horreur: "Pour la peur qui monte : attente, plans fixes, lumière rare, silence, puis rupture brusque. Mieux vaut peu de musique et une scène courte.",
};

/** When « aucun style »: the AI decides alone. */
export const EXEMPLE_AUCUN_STYLE = "Aucun style imposé : l'IA choisit elle-même la mise en scène de chaque plan, d'après ta description et tes images de référence.";
export const QUAND_AUCUN_STYLE = "Quand tu n'as pas d'idée précise, ou quand tes images de référence disent déjà tout : c'est le choix de départ.";
