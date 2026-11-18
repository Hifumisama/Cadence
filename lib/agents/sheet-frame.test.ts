import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS_CADRE, appliquerNotes, demandesSurLeCadre, ficheComplete, type Fiche } from "./sheet";

// The frame of a designed project has one source, the form (2026-11-18): the notes model never writes it.

const fiche: Fiche = {
  contenu: { style: { nom: "Gouache", clause: "A matte gouache look." }, dureeEpisodeSecondes: 120, langueDialogues: "Français", rythme: "variable" },
  statuts: { style: "fourni", dureeEpisodeSecondes: "fourni", langueDialogues: "fourni", rythme: "fourni" },
};
const messages = ["Une sitcom au bureau. Finalement je veux 3 minutes."];
const sortie = {
  modifications: { dureeEpisodeSecondes: 180, genreTon: "Sitcom", rythme: "variable" },
  sources: [
    { section: "dureeEpisodeSecondes", origine: "dit", citation: "Finalement je veux 3 minutes" },
    { section: "genreTon", origine: "dit", citation: "Une sitcom au bureau" },
  ],
};

test("appliquerNotes : les sections verrouillées (le cadre) ne bougent pas, le reste s'applique", () => {
  const apres = appliquerNotes(fiche, sortie, messages, undefined, SECTIONS_CADRE);
  assert.equal(apres.contenu.dureeEpisodeSecondes, 120);
  assert.equal(apres.statuts.dureeEpisodeSecondes, "fourni");
  assert.equal(apres.contenu.genreTon, "Sitcom", "le genre se décide dans l'entretien");
  assert.equal(apres.statuts.genreTon, "fourni");
  // Without locks (a project without design), the duration follows the interview as before.
  assert.equal(appliquerNotes(fiche, sortie, messages).contenu.dureeEpisodeSecondes, 180);
});

test("demandesSurLeCadre : ce que le modèle a voulu changer dans le cadre (une valeur identique n'est pas une demande)", () => {
  assert.deepEqual(demandesSurLeCadre(fiche, sortie, SECTIONS_CADRE), [{ cle: "dureeEpisodeSecondes", valeur: 180 }]);
  assert.deepEqual(demandesSurLeCadre(fiche, sortie, []), []);
});

test("ficheComplete : « on peut s'arrêter là » clôt l'entretien quand l'essentiel est tranché, pas avant", () => {
  const essentiels: Fiche = {
    contenu: { arc: "a", genreTon: "g", style: { nom: "s", clause: "c" }, rythme: "variable", dureeEpisodeSecondes: 20, personnages: [{ nom: "Mia", age: "25 ans", apparence: "cheveux courts", tenue: { coupe: "inspirée de X" } }], moments: ["m1", "m2"] },
    statuts: { arc: "fourni", fin: "fourni", genreTon: "fourni", style: "fourni", rythme: "fourni", dureeEpisodeSecondes: "fourni", personnages: "fourni", moments: "fourni" },
  };
  assert.equal(ficheComplete(essentiels, ["a", "b", "c"]), false, "un détail reste à préciser");
  assert.equal(ficheComplete(essentiels, ["a", "b", "On peut s'arrêter là :)"]), true);
  assert.equal(ficheComplete({ ...essentiels, statuts: { ...essentiels.statuts, arc: "deduit" } }, ["a", "b", "On peut s'arrêter là"]), false, "l'essentiel manque");
});
