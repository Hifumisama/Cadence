/** Le premier message de l'entretien d'entrée : l'agent ouvre la conversation, de façon engageante, avec TROIS pistes très
 * différentes (à prendre, à mélanger ou à jeter) pour qui n'a pas d'idée, sans rien imposer à qui en a une. Écrit en code, sans
 * appel LLM : il est là dès l'ouverture, et le tirage au sort garantit trois genres distincts. Pur (le tirage est injectable). */

type Piste = { genre: string; idee: string };

export const PISTES: Piste[] = [
  { genre: "Comédie absurde", idee: "Un livreur trouve au fond d'un colis le mode d'emploi pour sauver le monde, et une seule journée pour l'appliquer." },
  { genre: "Thriller", idee: "Une traductrice entend dans un enregistrement banal la preuve d'un crime, et ne peut la dire à personne dans sa langue." },
  { genre: "Conte", idee: "Un phare que le sel recouvre peu à peu, et une gardienne qui ne dort plus." },
  { genre: "Science-fiction contemplative", idee: "Le dernier jardinier d'une station orbitale apprend que la Terre a cessé de répondre." },
  { genre: "Drame intime", idee: "Deux frères vident la maison de leur père en un week-end et retrouvent ce qu'ils s'étaient promis d'oublier." },
  { genre: "Aventure", idee: "Une voleuse infiltre un riad à Tanger pour reprendre ce qu'on lui a pris." },
  { genre: "Fantastique", idee: "Chaque soir à 19 h 12, l'ascenseur d'un immeuble s'arrête à un étage qui n'existe pas." },
  { genre: "Animation poétique", idee: "Une goutte de pluie raconte son voyage jusqu'à la mer, vu de là-haut." },
  { genre: "Film noir", idee: "Un détective endetté cherche un chat disparu et découvre que c'est celui du maire." },
  { genre: "Comédie romantique", idee: "Deux voisins qui se détestent se retrouvent coincés dans le même escape game, une nuit de panne d'électricité." },
];

/** Trois pistes de genres différents (les genres du pool sont tous distincts), tirées avec `hasard` (0 ≤ x < 1). */
export function tirerPistes(hasard: () => number = Math.random, n = 3): Piste[] {
  const pool = [...PISTES];
  const tirees: Piste[] = [];
  while (tirees.length < n && pool.length) tirees.push(pool.splice(Math.floor(hasard() * pool.length), 1)[0]!);
  return tirees;
}

export function accrocheEntretien(hasard: () => number = Math.random): string {
  const pistes = tirerPistes(hasard)
    .map((p) => `• ${p.genre} : ${p.idee}`)
    .join("\n");
  return [
    "Salut ! Ça te dirait de faire un film aujourd'hui ?",
    "Si tu as déjà ton idée, raconte-la-moi comme elle vient, même en une phrase : je te poserai des questions pour la creuser avec toi. Sinon, voici trois pistes très différentes pour te lancer. Prends-en une, mélange-les, ou jette-les toutes :",
    pistes,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Accroche d'un projet CONÇU (conception.ts) : le cadre est posé (genre, ton, durée), l'agent se présente en scénariste et ne demande
// que l'essentiel. Choisie en code selon le ton et le genre, sans appel LLM ; `variante` fait tourner les phrases (« une autre accroche »).
// ---------------------------------------------------------------------------

type CadreAccroche = { genres: string[]; ton: number; dureeSecondes: number; format: "film" | "serie" };

const OUVERTURES: Record<"sombre" | "leger" | "neutre", string[]> = {
  sombre: [
    "Bien. Le décor est posé : {g}, sombre, {d}. Alors dites-moi : qu'est-ce qui se joue vraiment ici ?",
    "On part dans le noir, je le sens. Avant d'y mettre des visages : quelle est la blessure au centre de tout ça ?",
    "{G}, sans filet. Je prends des notes. Racontez-moi le moment où tout bascule.",
  ],
  leger: [
    "Excellent, on va s'amuser ! {G}, {d}, ton léger. Dites-moi tout : c'est quoi, l'histoire ?",
    "Ça sent la bonne humeur. Je suis votre scénariste. Par où commence-t-on : un personnage, une situation, une mauvaise idée ?",
    "Une histoire {g} qui ne se prend pas trop au sérieux, j'adore. Quel est le point de départ ?",
  ],
  neutre: [
    "Bonjour, je serai votre scénariste. J'ai le cadre ({g}, {d}), il me manque l'essentiel : de quoi parle l'histoire ?",
    "Le terrain est prêt. Racontez-moi l'histoire comme à quelqu'un qui n'en sait rien : par quoi ça commence ?",
    "Je vous écoute. Pas besoin d'être structuré : jetez-moi l'idée, je m'occupe de la mettre en forme.",
  ],
};

/** Une phrase propre à certains genres, placée AVANT les ouvertures générales (elle sort donc à la variante 0). */
const PAR_GENRE: Record<string, string> = {
  Horreur: "Vous voulez faire peur. Bien. Qu'est-ce qui doit glacer le spectateur : ce qu'il voit, ou ce qu'il devine ?",
  Comédie: "Une comédie : le plus dur de tous les genres. Qui rit, de quoi, et aux dépens de qui ?",
  Romance: "Une histoire d'amour. Qui sont-ils, et qu'est-ce qui les empêche d'être ensemble ?",
  "Science-fiction": "De la science-fiction : quelle question posons-nous au monde, et quelle règle change tout ?",
  Western: "Un western. Qui arrive en ville, et qui l'attend à la sortie ?",
  Conte: "Il était une fois… quoi, exactement ? Je vous laisse la première phrase.",
};

const familleTon = (ton: number): "sombre" | "leger" | "neutre" => (ton <= 38 ? "leger" : ton >= 63 ? "sombre" : "neutre");
const dureeEnTexte = (s: number): string => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${String(s % 60).padStart(2, "0")}` : ""}`);

/** Les accroches possibles pour ce cadre, dans l'ordre : celles des genres choisis d'abord, puis les ouvertures du ton. */
export function accrochesConception(c: CadreAccroche): string[] {
  const g = c.genres.length ? c.genres.join(" et ").toLowerCase() : "sans genre arrêté";
  const majuscule = g.charAt(0).toUpperCase() + g.slice(1);
  const speciales = c.genres.map((x) => PAR_GENRE[x]).filter((x): x is string => !!x);
  return [...speciales, ...OUVERTURES[familleTon(c.ton)]].map((t) => t.replaceAll("{g}", g).replaceAll("{G}", majuscule).replaceAll("{d}", dureeEnTexte(c.dureeSecondes)));
}

/** L'accroche numéro `variante` (qui tourne : 0, 1, 2… reviennent au début après la dernière). */
export function accrocheConception(c: CadreAccroche, variante = 0): string {
  const toutes = accrochesConception(c);
  return toutes[((variante % toutes.length) + toutes.length) % toutes.length]!;
}
