import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerSkill } from "../llm/skills";
import { compilerSchema } from "../llm/validation";
import { accrocheEntretien, PISTES, tirerPistes } from "./accroche";
import {
  FICHE_VIDE,
  REQUIS,
  SECTIONS_PATCHABLES,
  appliquerNotes,
  briefVersFiche,
  entreeNotes,
  ficheComplete,
  ficheVersBrief,
  lireFiche,
  manquesFiche,
  suppositions,
  type Fiche,
} from "./fiche";

const heros = { nom: "Théo", role: "héros", age: "homme d'une trentaine d'années", apparence: "cheveux courts, parka grise", reconnaissable: "sa parka", statut: "fourni" };
const style = { nom: "Live-action réaliste", clause: "Naturalistic live-action, soft daylight." };

test("une citation vérifiée (accents, casse et ponctuation ignorés) fournit la section", () => {
  const f = appliquerNotes(
    FICHE_VIDE,
    { modifications: { genreTon: "Comédie absurde" }, sources: [{ section: "genreTon", origine: "dit", citation: "UN TRUC incontrôlé, et assez absurde" }] },
    ["C'est un truc incontrôlé et assez absurde."],
  );
  assert.equal(f.contenu.genreTon, "Comédie absurde");
  assert.equal(f.statuts.genreTon, "fourni");
});

test("une citation inventée ou trop courte ne prouve rien : la section reste déduite", () => {
  const f = appliquerNotes(
    FICHE_VIDE,
    {
      modifications: { genreTon: "Drame", rythme: "lent" },
      sources: [
        { section: "genreTon", origine: "dit", citation: "un drame poignant et sombre" },
        { section: "rythme", origine: "dit", citation: "oui" },
      ],
    },
    ["oui", "C'est léger."],
  );
  assert.equal(f.statuts.genreTon, "deduit");
  assert.equal(f.statuts.rythme, "deduit");
});

test("une source « invente » n'est jamais fournie, même avec une citation exacte", () => {
  const f = appliquerNotes(FICHE_VIDE, { modifications: { titre: "L'Éveil" }, sources: [{ section: "titre", origine: "invente", citation: "léger" }] }, ["léger"]);
  assert.equal(f.statuts.titre, "deduit");
});

test("un patch vide ou une valeur vide n'efface rien", () => {
  const avant: Fiche = { contenu: { arc: "Un arc", personnages: [heros] }, statuts: { arc: "fourni", personnages: "fourni" } };
  const f = appliquerNotes(avant, { modifications: { arc: "", personnages: [], inconnue: "x" }, sources: [] }, ["message"]);
  assert.deepEqual(f, avant);
});

test("confirmer une section déjà notée la fournit, sans la modifier", () => {
  const avant: Fiche = { contenu: { dureeEpisodeSecondes: 180 }, statuts: { dureeEpisodeSecondes: "deduit" } };
  const f = appliquerNotes(avant, { modifications: {}, sources: [{ section: "dureeEpisodeSecondes", origine: "dit", citation: "environ 3 minutes" }] }, ["Un court métrage d'environ 3 minutes."]);
  assert.equal(f.statuts.dureeEpisodeSecondes, "fourni");
  assert.equal(f.contenu.dureeEpisodeSecondes, 180);
});

test("la fin n'est pas une section : elle se suit par sa seule source", () => {
  const f = appliquerNotes(FICHE_VIDE, { modifications: {}, sources: [{ section: "fin", origine: "dit", citation: "ça finit en fou rire" }] }, ["Ça finit en fou rire."]);
  assert.equal(f.statuts.fin, "fourni");
  assert.equal(f.contenu.fin, undefined);
});

test("le champ `fin` de la sortie est vérifié comme une source : sa citation doit être dans un message de l'utilisateur", () => {
  const dit = appliquerNotes(FICHE_VIDE, { modifications: {}, fin: { origine: "dit", citation: "L'hydre devient adorable" }, sources: [] }, ["Ouaip", "L'hydre devient adorable ^^'"]);
  assert.equal(dit.statuts.fin, "fourni");
  assert.equal(appliquerNotes(FICHE_VIDE, { modifications: {}, fin: { origine: "dit", citation: "elle finit en larmes" }, sources: [] }, ["non"]).statuts.fin, undefined, "citation inventée");
  assert.equal(appliquerNotes(dit, { modifications: {}, fin: { origine: "aucune", citation: "" }, sources: [] }, ["x"]).statuts.fin, "fourni", "ce qui est dit ne se perd pas");
});

test("enrichir une section dite (liste ou texte) sans citation ne lui ôte pas son statut", () => {
  const avant: Fiche = { contenu: { personnages: [heros], arc: "A" }, statuts: { personnages: "fourni", arc: "fourni" } };
  const f = appliquerNotes(avant, { modifications: { personnages: [heros, { ...heros, nom: "Mamie", statut: "deduit" }], arc: "B" }, sources: [] }, ["m"]);
  assert.equal(f.statuts.personnages, "fourni");
  assert.equal(f.statuts.arc, "fourni");
  assert.equal(appliquerNotes(FICHE_VIDE, { modifications: { arc: "B" }, sources: [] }, ["m"]).statuts.arc, "deduit", "mais une section jamais dite reste supposée");
});

test("une délégation citée (« je te laisse choisir ») tranche la question sans en faire une parole de l'utilisateur", () => {
  const f = appliquerNotes(
    FICHE_VIDE,
    { modifications: { rythme: "soutenu" }, sources: [{ section: "rythme", origine: "delegue", citation: "Je te laisse proposer" }] },
    ["Je te laisse proposer, je suis ouvert."],
  );
  assert.equal(f.statuts.rythme, "delegue");
  assert.ok(!manquesFiche(f).includes(REQUIS.find((r) => r.cle === "rythme")!.libelle), "le rythme n'est plus à demander");
  assert.deepEqual(suppositions(f), ["rythme"], "mais il reste signalé comme proposé par l'agent");
  const sansCitation = appliquerNotes(FICHE_VIDE, { modifications: { rythme: "soutenu" }, sources: [{ section: "rythme", origine: "delegue", citation: "comme il voudra" }] }, ["ok"]);
  assert.equal(sansCitation.statuts.rythme, "deduit", "une délégation sans citation vérifiée n'est pas une délégation");
  const dit = appliquerNotes(f, { modifications: {}, sources: [{ section: "rythme", origine: "dit", citation: "nerveux" }] }, ["Je te laisse proposer", "plutôt nerveux"]);
  assert.equal(dit.statuts.rythme, "fourni", "une parole de l'utilisateur l'emporte sur une délégation");
  assert.equal(ficheVersBrief(f, "T").statuts.rythme, "deduit", "le brief ne connaît que fourni et déduit");
  assert.equal(briefVersFiche({ contenu: { rythme: "soutenu" }, statuts: { rythme: "deduit" } }, f).statuts.rythme, "delegue", "relire le brouillon n'efface pas la délégation");
});

function ficheDite(): Fiche {
  return {
    contenu: { arc: "A", genreTon: "T", style, rythme: "soutenu", dureeEpisodeSecondes: 180, personnages: [heros] },
    statuts: { arc: "fourni", fin: "fourni", genreTon: "fourni", style: "fourni", rythme: "fourni", dureeEpisodeSecondes: "fourni", personnages: "fourni" },
  };
}

test("manques : tout l'essentiel, dans l'ordre, sur une fiche vide", () => {
  assert.deepEqual(manquesFiche(FICHE_VIDE), REQUIS.map((r) => r.libelle));
});

test("complète : l'essentiel dit ET au moins deux messages de l'utilisateur ; supposé ne suffit pas", () => {
  const f = ficheDite();
  assert.deepEqual(manquesFiche(f), []);
  assert.equal(ficheComplete(f, 1), false, "un seul message : on n'a pas encore creusé");
  assert.equal(ficheComplete(f, 2), true);
  const sansFin: Fiche = { ...f, statuts: { ...f.statuts, fin: "deduit" } };
  assert.equal(ficheComplete(sansFin, 5), false);
  assert.deepEqual(manquesFiche(sansFin), [REQUIS[1]!.libelle]);
  assert.equal(ficheComplete({ ...f, contenu: { ...f.contenu, personnages: [] } }, 5), false, "présent ET dit");
});

test("suppositions : ce que l'agent a posé sans que l'utilisateur le dise", () => {
  const f = ficheDite();
  f.contenu.titre = "L'Éveil";
  f.statuts.titre = "deduit";
  f.contenu.inventions = ["Le héros s'appelle Théo"];
  f.statuts.inventions = "deduit";
  assert.deepEqual(suppositions(f), ["titre"]);
});

test("fiche → brief : la forme complète, avec ce que le code peut poser sans inventer d'important", () => {
  const { contenu, statuts } = ficheVersBrief(ficheDite(), "Self made man");
  assert.equal(contenu.titre, "Self made man");
  assert.equal(contenu.langueDialogues, "Français");
  assert.equal(statuts.langueDialogues, "deduit");
  assert.equal(contenu.episodes.length, 1);
  assert.equal(contenu.source, "pitch");
  assert.deepEqual(contenu.pieges, []);
  assert.equal(statuts.arc, "fourni");
  assert.equal((statuts as Record<string, string>).fin, undefined, "la fin n'est pas une section du brief");
  const valide = compilerSchema(chargerSkill("brief-projet").schema);
  assert.ok(valide({ ...contenu }), JSON.stringify(valide.errors));
});

test("brouillon → fiche : le brouillon fait foi, la fin vient de la fiche mémorisée", () => {
  const memorisee = lireFiche({ contenu: { arc: "vieux" }, statuts: { fin: "fourni", arc: "deduit" } });
  const f = briefVersFiche({ contenu: { arc: "corrigé à la main" }, statuts: { arc: "fourni", style: "a_valider" } }, memorisee);
  assert.equal(f.contenu.arc, "corrigé à la main");
  assert.equal(f.statuts.arc, "fourni");
  assert.equal(f.statuts.style, "deduit");
  assert.equal(f.statuts.fin, "fourni");
});

test("lireFiche : une forme inattendue donne une fiche vide", () => {
  assert.deepEqual(lireFiche(null), FICHE_VIDE);
  assert.deepEqual(lireFiche({ contenu: 3, statuts: { a: "x", b: "fourni" } }), { contenu: {}, statuts: { b: "fourni" } });
});

test("entreeNotes : la fiche et la conversation (qui parle)", () => {
  const e = entreeNotes([{ role: "assistant", content: "Salut" }, { role: "user", content: "Idée" }], FICHE_VIDE);
  assert.deepEqual(e.conversation.map((c) => c.qui), ["agent", "utilisateur"]);
  assert.deepEqual(e.fiche, { contenu: {}, statuts: {} });
});

test("notes-entretien : les sections patchables reprennent EXACTEMENT les sous-schémas du brief", () => {
  const notes = chargerSkill("notes-entretien").schema as unknown as { properties: { modifications: { properties: Record<string, unknown> }; sources: { items: { properties: { section: { enum: string[] } } } } } };
  const brief = chargerSkill("brief-projet").schema as unknown as { properties: Record<string, unknown> };
  assert.deepEqual(Object.keys(notes.properties.modifications.properties).sort(), [...SECTIONS_PATCHABLES].sort());
  for (const cle of SECTIONS_PATCHABLES) assert.deepEqual(notes.properties.modifications.properties[cle], brief.properties[cle], cle);
  assert.deepEqual([...notes.properties.sources.items.properties.section.enum].sort(), [...SECTIONS_PATCHABLES, "fin"].sort());
});

test("accroche : trois pistes de genres différents, tirage au sort, le message invite sans imposer", () => {
  const pistes = tirerPistes();
  assert.equal(pistes.length, 3);
  assert.equal(new Set(pistes.map((p) => p.genre)).size, 3);
  assert.equal(new Set(PISTES.map((p) => p.genre)).size, PISTES.length, "genres tous distincts dans le pool");
  const t = accrocheEntretien(() => 0);
  assert.match(t, /Ça te dirait de faire un film/);
  assert.equal(t.split("\n").filter((l) => l.startsWith("• ")).length, 3);
  assert.notEqual(accrocheEntretien(() => 0), accrocheEntretien(() => 0.99));
});
