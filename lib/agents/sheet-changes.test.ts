import { test } from "node:test";
import assert from "node:assert/strict";
import { entreeTour, noteChangements } from "./brief-input";
import { changementsDeFiche, type Fiche } from "./sheet";

const avant: Fiche = {
  contenu: { genreTon: "Drame mélancolique", moments: ["Elle danse", "Elle se fane"], lieux: [{ nom: "Le Jardin", description: "murs de pierre" }] },
  statuts: { genreTon: "fourni", moments: "fourni", lieux: "deduit" },
};
const messages = ["Une danseuse dans un jardin", "En fait je veux que ce soit joyeux, la mort danse avec toi !"];

test("changementsDeFiche : un point tranché que le dernier message modifie", () => {
  const apres: Fiche = { ...avant, contenu: { ...avant.contenu, genreTon: "Fête joyeuse et macabre" } };
  const sortie = { sources: [{ section: "genreTon", origine: "dit", citation: "je veux que ce soit joyeux" }] };
  const c = changementsDeFiche(avant, apres, sortie, messages);
  assert.deepEqual(c.map((x) => x.cle), ["genreTon"]);
  assert.equal(c[0]!.avant, "Drame mélancolique");
  const note = noteChangements(c);
  assert.match(note, /Changement de direction/);
  assert.match(note, /trancher avec la carte/);
  assert.match(note, /moments du film, musique du film, lieux/i);
});

test("changementsDeFiche : une reformulation du modèle seul, ou un point jamais tranché, n'est pas un changement", () => {
  const reformule: Fiche = { ...avant, contenu: { ...avant.contenu, genreTon: "Drame mélancolique et lent" } };
  assert.deepEqual(changementsDeFiche(avant, reformule, { sources: [] }, messages), []);
  // citation from an older message: not a change made by THIS message
  assert.deepEqual(changementsDeFiche(avant, reformule, { sources: [{ section: "genreTon", origine: "dit", citation: "Une danseuse dans un jardin" }] }, messages), []);
  // `lieux` was only assumed: rewriting it is not a change of direction
  const lieu: Fiche = { ...avant, contenu: { ...avant.contenu, lieux: [{ nom: "Le Jardin", description: "sans murs" }] } };
  assert.deepEqual(changementsDeFiche(avant, lieu, { sources: [{ section: "lieux", origine: "dit", citation: "la mort danse avec toi" }] }, messages), []);
});

test("entreeTour : la note de changement accompagne le dernier message", () => {
  const apres: Fiche = { ...avant, contenu: { ...avant.contenu, genreTon: "Fête joyeuse" } };
  const c = changementsDeFiche(avant, apres, { sources: [{ section: "genreTon", origine: "dit", citation: "joyeux" }] }, messages);
  const m = entreeTour([{ role: "user", content: messages[0]! }, { role: "assistant", content: "Ok" }, { role: "user", content: messages[1]! }], apres, { manques: [], complete: false }, undefined, c);
  assert.match(m[m.length - 1]!.content, /\[Changement de direction/);
});

test("appliquerNotes : après un changement de ton, la séquence réécrite par l'agent est à revalider", async () => {
  const { appliquerNotes } = await import("./sheet");
  const sortie = {
    modifications: { genreTon: "Fête joyeuse et macabre", moments: ["Elle danse en riant", "Les squelettes l'applaudissent"] },
    sources: [{ section: "genreTon", origine: "dit", citation: "je veux que ce soit joyeux" }],
    fin: { origine: "aucune", citation: "" },
  };
  const f = appliquerNotes(avant, sortie, messages);
  assert.equal(f.statuts.genreTon, "fourni");
  assert.equal(f.statuts.moments, "deduit");
  // the same rewording without a change of tone keeps the validation
  const g = appliquerNotes(avant, { modifications: { moments: ["Elle danse en riant", "Elle se fane"] }, sources: [], fin: { origine: "aucune", citation: "" } }, messages);
  assert.equal(g.statuts.moments, "fourni");
});
