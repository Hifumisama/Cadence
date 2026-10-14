import { construireVue, type LignesEpisode, type VueEpisode } from "./vue-episode";

/** L'épisode d'essai « Le sel » de la maquette (docs/maquettes/revision-episode.html) : 14 plans, 2:34 pour 2:00 visées, trois scènes.
 * Sert aux tests et à l'essai du réalisateur (scripts/revision-essai.ts) : les mêmes chiffres que la maquette. */

type Etat = "brouillon" | "fiche" | "rendu";
const p = (n: number, sceneId: number, titre: string, duree: number, etat: Etat) => ({
  uuid: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  titre,
  description: "",
  duree,
  sceneId,
  statut: etat === "rendu" ? "termine" : "brouillon",
  aFiche: etat !== "brouillon",
  perime: false,
});

export const planUuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const LIGNES_LE_SEL: LignesEpisode = {
  episode: { id: 1, numero: 1, titre: "Le sel" },
  objectifSecondes: 120,
  scenes: [
    { id: 1, titre: "Le port à l'aube" },
    { id: 2, titre: "La lettre" },
    { id: 3, titre: "Le départ" },
  ],
  plans: [
    p(1, 1, "Plan large du port, brume", 10, "brouillon"),
    p(2, 1, "Les filets sur le quai", 9, "fiche"),
    p(3, 1, "Maya traverse le quai", 10, "fiche"),
    p(4, 1, "Gros plan : ses mains serrent la lettre", 8, "rendu"),
    p(5, 1, "Mouettes dans le ciel", 8, "brouillon"),
    p(6, 2, "Maya s'assoit sur la caisse de sel", 14, "fiche"),
    p(7, 2, "Maya lit la lettre", 15, "rendu"),
    p(8, 2, "Insert : l'écriture sur le papier", 8, "brouillon"),
    p(9, 2, "Le vieux pêcheur l'observe", 12, "fiche"),
    p(10, 2, "Plan de coupe : la mer", 10, "brouillon"),
    p(11, 3, "Maya se lève", 10, "brouillon"),
    p(12, 3, "Dialogue avec le pêcheur", 15, "fiche"),
    p(13, 3, "Le bateau s'éloigne", 15, "brouillon"),
    p(14, 3, "Plan final : le bateau disparaît dans la brume", 10, "brouillon"),
  ],
  repliques: [
    { uuid: "00000000-0000-4000-9000-000000000001", ordre: 0, texte: "Je ne reviendrai jamais.", locuteur: "CHAR_maya", liaisons: [{ planUuid: planUuid(7), slot: 1 }] },
    { uuid: "00000000-0000-4000-9000-000000000002", ordre: 1, texte: "Tu pars ?", locuteur: "CHAR_pecheur", liaisons: [{ planUuid: planUuid(12), slot: 1 }] },
    { uuid: "00000000-0000-4000-9000-000000000003", ordre: 2, texte: "Le sel ne ment pas.", locuteur: "CHAR_maya", liaisons: [{ planUuid: planUuid(12), slot: 2 }] },
  ],
};

export function vueLeSel(): VueEpisode {
  return construireVue(LIGNES_LE_SEL);
}
