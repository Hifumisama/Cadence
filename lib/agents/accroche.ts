/** Le premier message de l'entretien d'entrée : l'agent ouvre la conversation, de façon engageante, avec TROIS pistes très
 * différentes (à prendre, à mélanger ou à jeter) pour qui n'a pas d'idée, sans rien imposer à qui en a une. Écrit en code, sans
 * appel LLM : il est là dès l'ouverture, et le tirage au sort garantit trois genres distincts. Pur (le tirage est injectable). */

import { motDuTon, type Conception } from "../conception";

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
// Accroche d'un projet CONÇU (conception.ts) : écrite par le modèle (skill `accroche-scenariste`), une seule fois, à la création de
// l'entretien. Elle ne se régénère pas : ni « une autre accroche », ni quand l'utilisateur revient changer un choix. Le code ne fait que
// lui dire ce qui est choisi.
// ---------------------------------------------------------------------------

/** Marque que le skill `accroche-scenariste` connaît (voir son SKILL.md). */
export const MARQUE_PROJET_CONCU = "[Projet conçu par l'utilisateur]";

const dureeEnTexte = (s: number): string => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${String(s % 60).padStart(2, "0")}` : ""}`);

/** L'entrée du skill : un seul message, qui liste les choix déjà faits (format, genres, ton, durée, langue, style). Pur. */
export function entreeAccroche(c: Conception, style: { nom: string; clause: string }): { role: "user"; content: string }[] {
  const format = c.format === "serie" ? `série${c.episodesPrevus ? ` (${c.episodesPrevus} épisodes prévus)` : ""}` : "film";
  const lignes = [
    MARQUE_PROJET_CONCU,
    `Format : ${format}`,
    `Genre : ${c.genres.length ? c.genres.join(", ") : "non arrêté"}`,
    `Ton : ${motDuTon(c.ton)}`,
    `Durée : ${dureeEnTexte(c.dureeSecondes)}${c.format === "serie" ? " par épisode" : ""}`,
    `Langue des dialogues : ${c.langue}`,
    `Style visuel : « ${style.nom || "style libre"} »${style.clause.trim() ? ` : ${style.clause.trim()}` : ""}`,
  ];
  return [{ role: "user", content: lignes.join("\n") }];
}
