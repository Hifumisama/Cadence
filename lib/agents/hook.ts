/** The first message of the intake interview: the agent opens the conversation, engagingly, with THREE very
 * different leads (to take, to mix, or to throw away) for whoever has no idea, without imposing anything on whoever has one. Written in code, without an
 * LLM call: it is there from the opening, and the random draw guarantees three distinct genres. Pure (the draw is injectable). */

import { motDuTon, type Conception } from "../projects/design";

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

/** Three leads of different genres (the genres in the pool are all distinct), drawn with `hasard` (0 ≤ x < 1). */
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
// Hook of a DESIGNED project (design.ts): written by the model (skill `accroche-scenariste`), only once, when the
// interview is created. It is never regenerated: neither "another hook", nor when the user comes back to change a choice. The code only
// tells it what is chosen.
// ---------------------------------------------------------------------------

/** Marker the `accroche-scenariste` skill knows (see its SKILL.md). */
export const MARQUE_PROJET_CONCU = "[Projet conçu par l'utilisateur]";

const dureeEnTexte = (s: number): string => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${String(s % 60).padStart(2, "0")}` : ""}`);

/** The skill input: a single message listing the choices already made (genres, tone, duration, language, style). Pure. */
export function entreeAccroche(c: Conception, style: { nom: string; clause: string }): { role: "user"; content: string }[] {
  const lignes = [
    MARQUE_PROJET_CONCU,
    `Format : film`,
    `Genre : ${c.genres.length ? c.genres.join(", ") : "non arrêté"}`,
    `Ton : ${motDuTon(c.ton)}`,
    `Durée : ${dureeEnTexte(c.dureeSecondes)}`,
    `Langue des dialogues : ${c.langue}`,
    `Style visuel : « ${style.nom || "style libre"} »${style.clause.trim() ? ` : ${style.clause.trim()}` : ""}`,
  ];
  return [{ role: "user", content: lignes.join("\n") }];
}
