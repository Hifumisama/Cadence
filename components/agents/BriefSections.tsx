"use client";






/** Sections that are LISTS of objects (episodes, characters…): one form per item instead of a raw
 * JSON. The input stays the JSON string that `depuisSaisie` reads back and that the server validates against the
 * section's sub-schema: the form only produces it. Fields the form does not show (the `statut` of a
 * character) are kept as they are. */
type ChampListe = { cle: string; libelle: string; type: "texte" | "long" | "bool" };
export const FORMULAIRES_LISTE: Record<string, { element: string; champs: ChampListe[]; nouveau: Record<string, unknown> }> = {
  episodes: {
    element: "Épisode",
    champs: [
      { cle: "titre", libelle: "Titre", type: "texte" },
      { cle: "resume", libelle: "Ce que l'épisode raconte", type: "long" },
      { cle: "portee", libelle: "Chapitres ou arc couverts (facultatif)", type: "texte" },
    ],
    nouveau: { titre: "", resume: "" },
  },
  personnages: {
    element: "Personnage",
    champs: [
      { cle: "nom", libelle: "Nom", type: "texte" },
      { cle: "role", libelle: "Rôle", type: "texte" },
      { cle: "age", libelle: "Âge apparent (ex. adolescente, 15 ans)", type: "texte" },
      { cle: "apparence", libelle: "Apparence : ce qu'on voit (corps, visage, cheveux, tenue)", type: "long" },
      { cle: "reconnaissable", libelle: "Ce qui le rend reconnaissable", type: "long" },
      { cle: "gestuelle", libelle: "Gestuelle : comment il bouge ou agit (facultatif)", type: "long" },
      { cle: "voix", libelle: "Impression vocale (s'il parle)", type: "texte" },
    ],
    nouveau: { nom: "", role: "", age: "", apparence: "", reconnaissable: "" },
  },
  lieux: {
    element: "Lieu",
    champs: [
      { cle: "nom", libelle: "Nom", type: "texte" },
      { cle: "description", libelle: "Description", type: "long" },
    ],
    nouveau: { nom: "", description: "" },
  },
};
