import type { Creativite, StyleCamera } from "./reglages";

/** Les aides qui permettent de SE PROJETER dans les choix de créativité et de style de mise en scène (écran « Mise en scène » de /nouveau, lib/h3ir/reglages.ts) :
 * une même scène rendue à chaque choix, ce que chaque niveau ajoute, les films à connaître, quand le choisir. Pur, sans import à l'exécution : lisible côté client.
 *
 * Les ajouts par niveau suivent le paquet Open H3 IR (h3ir/creativity.py) : « sobre » n'ajoute rien ; « équilibrée » ajoute seulement de la musique ; « audacieuse » et
 * « extrême » peuvent ajouter musique, paroles et texte à l'écran ; « extrême » ne licencie rien de plus, il pousse CHAQUE choix à son maximum (caméra ample et rapide,
 * cadres très serrés ou très larges, contrastes durs) sans inventer d'événement. Les phrases d'exemple sont illustratives (nos mots, pas une sortie du modèle). */

/** La scène commune des exemples : de quoi comparer les choix sur la même action. */
export const SCENE_EXEMPLE = "Une femme ouvre une porte et découvre une pièce vide.";

// --- Créativité -------------------------------------------------------------------------------------------------------------------------------

export const PASTILLES_CREATIVITE = [
  { cle: "musique", libelle: "Musique" },
  { cle: "paroles", libelle: "Paroles" },
  { cle: "texteEcran", libelle: "Texte à l'écran" },
  { cle: "cameraAppuyee", libelle: "Caméra appuyée" },
  { cle: "maximum", libelle: "Tout au maximum" },
] as const;
export type ClePastille = (typeof PASTILLES_CREATIVITE)[number]["cle"];

/** Ce que chaque niveau peut ajouter ou pousser (vrai = permis). Chaque niveau reprend celui d'avant. */
export const AJOUTS_CREATIVITE: Record<Creativite, Record<ClePastille, boolean>> = {
  restrained: { musique: false, paroles: false, texteEcran: false, cameraAppuyee: false, maximum: false },
  balanced: { musique: true, paroles: false, texteEcran: false, cameraAppuyee: false, maximum: false },
  bold: { musique: true, paroles: true, texteEcran: true, cameraAppuyee: true, maximum: false },
  extreme: { musique: true, paroles: true, texteEcran: true, cameraAppuyee: true, maximum: true },
};

/** La même scène, rendue à chaque niveau. */
export const EXEMPLE_CREATIVITE: Record<Creativite, string> = {
  restrained: "Elle ouvre la porte et découvre la pièce vide. Rien de plus : pas de musique, pas de réplique, pas de texte, une caméra aussi simple que possible.",
  balanced: "Même scène, avec une musique discrète, un cadrage soigné sur sa main puis sur la pièce, le bruit du bois et l'écho d'un lieu vide. Aucun événement ajouté.",
  bold: "Même scène, où elle peut se permettre une musique qui monte, une réplique murmurée (« Il y a quelqu'un ? »), un mot discret qui s'inscrit à l'écran, et une caméra qui accompagne franchement son geste.",
  extreme: "Même scène, jouée à fond : travelling rapide jusqu'à son visage, gros plan extrême sur ses yeux, ombres très dures, un geste mené jusqu'au bout, avec musique, réplique et texte en plus.",
};

/** Quand choisir ce niveau. */
export const QUAND_CREATIVITE: Record<Creativite, string> = {
  restrained: "Quand tu as tout écrit et que tu ne veux aucune surprise : l'IA n'ajoute que ce que ta description demande.",
  balanced: "Le choix de départ, sûr pour presque tout : l'IA met de la musique et soigne l'image, sans rien inventer d'autre.",
  bold: "Quand ta description est courte et que tu laisses l'IA proposer : elle se permet des mots, du texte à l'écran, de la musique et une caméra plus appuyée. Ce sont des permissions, pas des promesses : sur une scène déjà complète, la différence avec « équilibrée » reste discrète.",
  extreme: "Pour une scène spectaculaire ou très stylisée : tout est poussé le plus loin possible. Cela ne rajoute pas plus de choses que « audacieuse », cela les joue plus fort.",
};

// --- Style de mise en scène ------------------------------------------------------------------------------------------------------------------

/** La même scène, filmée dans chaque style. */
export const EXEMPLE_STYLE: Record<StyleCamera, string> = {
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
};

/** Des films que beaucoup ont vus, pour reconnaître le style sans connaître son réalisateur (les films du réalisateur lui-même). */
export const FILMS_STYLE: Record<StyleCamera, readonly string[]> = {
  cameron: ["Terminator 2", "Aliens", "Titanic", "Avatar"],
  tarantino: ["Pulp Fiction", "Reservoir Dogs", "Kill Bill", "Inglourious Basterds"],
  anderson: ["The Grand Budapest Hotel", "Moonrise Kingdom", "La Famille Tenenbaum"],
  villeneuve: ["Dune", "Blade Runner 2049", "Premier Contact", "Sicario"],
  bigelow: ["Démineurs", "Zero Dark Thirty", "Point Break", "Detroit"],
  wong: ["In the Mood for Love", "Chungking Express", "2046", "Les Anges déchus"],
  spielberg: ["E.T.", "Rencontres du troisième type", "Jurassic Park", "Les Dents de la mer"],
};

/** Quand choisir ce style. */
export const QUAND_STYLE: Record<StyleCamera, string> = {
  cameron: "Action, science-fiction, grandes machines : quand on doit sentir l'effort et la taille des choses.",
  tarantino: "Dialogues, tension qui monte lentement, scènes de table ou de voiture : quand les mots et les objets comptent.",
  anderson: "Comédie douce, univers de conte, décors très soignés : quand l'ordre et la symétrie font le charme.",
  villeneuve: "Science-fiction, mystère, solitude, grands espaces : quand le silence et l'échelle racontent l'histoire.",
  bigelow: "Action réaliste, thriller, scènes sous tension : quand on veut du vécu, sans embellir.",
  wong: "Histoires d'amour, nostalgie, villes la nuit : quand le non-dit compte plus que ce qui se passe.",
  spielberg: "Aventure, émerveillement, révélations : quand l'important est ce que ressent le personnage.",
};

/** Quand « aucun style » : l'IA décide seule. */
export const EXEMPLE_AUCUN_STYLE = "Aucun style imposé : l'IA choisit elle-même la mise en scène de chaque plan, d'après ta description et tes images de référence.";
export const QUAND_AUCUN_STYLE = "Quand tu n'as pas d'idée précise, ou quand tes images de référence disent déjà tout : c'est le choix de départ.";
