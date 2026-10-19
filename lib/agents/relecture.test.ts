import assert from "node:assert/strict";
import { test } from "node:test";
import { valider } from "../llm/validation";
import { chargerSkill } from "../llm/skills";
import { cocheParDefaut } from "./cochage";
import { controleurPourSkill } from "../llm/controles";
import { MAX_CORRECTIONS, depuisRelecture, partConservee, problemesDeRelecture, repliquesDe, type EntreeRelecture, type SortieRelecture } from "./relecture";
import { validerOperations } from "./revision/operations";
import { operationsVersChangements } from "./revision/operations-vers-changements";
import { construireVue } from "./revision/vue-episode";

// Un petit épisode fabriqué : des cavaliers arrivent à cheval (P03), parlent « au bord de la rue » (P04), ne descendent qu'en P05 ; P06 et P07 racontent
// le même départ du train ; le dernier plan ne résout rien.
const D = (corps: string, etat: string) => `${corps}\nÉtat en fin de plan : ${etat}`;
const plansDonnes = [
  { uuid: "u1", titre: "La shérif devant le train", description: D("Elias se tient sur le quai.", "Elias est debout sur le quai."), duree: 8, sceneId: 1, statut: "brouillon", liaison: "coupe" },
  { uuid: "u2", titre: "La bande arrive", description: D("Cinq cavaliers entrent dans la rue.", "Les cavaliers sont à cheval au début de la rue."), duree: 8, sceneId: 1, statut: "brouillon", liaison: "suite" },
  { uuid: "u3", titre: "Le face-à-face", description: D("Red Jack parle à Elias depuis le bord de la rue.\nRed Jack : « Le train s'arrête, shérif. »\nElias : « Il part. »", "Red Jack est au bord de la rue."), duree: 8, sceneId: 1, statut: "brouillon", liaison: "suite" },
  { uuid: "u4", titre: "Le train démarre", description: D("Le train quitte le quai vers la vallée.", "Le train s'éloigne vers la vallée."), duree: 8, sceneId: 1, statut: "brouillon", liaison: "suite" },
  { uuid: "u5", titre: "Le train s'éloigne", description: D("Le train continue de s'éloigner vers la vallée.", "Le train est loin vers la vallée."), duree: 8, sceneId: 1, statut: "brouillon", liaison: "suite" },
  { uuid: "u6", titre: "Elias reste", description: D("Elias garde sa position.", "Elias est debout sur le quai."), duree: 8, sceneId: 2, statut: "brouillon", liaison: "suite" },
];
const vue = construireVue({
  episode: { id: 9, numero: 1, titre: "Le dernier train" },
  objectifSecondes: 48,
  scenes: [{ id: 1, titre: "Le départ" }, { id: 2, titre: "Le duel" }],
  plans: plansDonnes.map((p) => ({ ...p, aFiche: false, perime: false })),
});
const entree: EntreeRelecture = {
  plans: plansDonnes.map((p, i) => ({ plan: `P${String(i + 1).padStart(2, "0")}`, scene: p.sceneId === 1 ? "Le départ" : "Le duel", titre: p.titre, liaison: p.liaison, dureeSecondes: p.duree, description: p.description })),
  dureeCibleSecondes: 48,
};
const sortie = (corrections: SortieRelecture["corrections"], constats: SortieRelecture["constats"] = []): SortieRelecture => ({ constats, corrections, notes: "" });

const descP4 = D("Red Jack parle à Elias depuis le bord de la rue, toujours à cheval.\nRed Jack : « Le train s'arrête, shérif. »\nElias : « Il part. »", "Red Jack est au bord de la rue, à cheval.");
const bonne: SortieRelecture = sortie(
  [
    { type: "modifier_plan", plan: "P03", description: descP4, critere: "physique", motif: "Les cavaliers sont à cheval en P02 et le restent en P03." },
    { type: "couper_plan", plan: "P05", critere: "doublon", motif: "P04 montre déjà le train qui s'éloigne." },
    { type: "duree_plan", plan: "P04", secondes: 15, critere: "doublon", motif: "Compense la durée du plan coupé." },
  ],
  [{ critere: "doublon", plans: ["P04", "P05"], probleme: "Le départ du train est raconté deux fois." }],
);

test("le schéma de sortie accepte une relecture et refuse un plan sans motif", () => {
  const schema = chargerSkill("relecture-scenario").schema;
  assert.equal(valider(schema, bonne).ok, true);
  assert.equal(valider(schema, sortie([])).ok, true, "rien à corriger est une réponse valable");
  const sansMotif = sortie([{ type: "couper_plan", plan: "P05", critere: "doublon" } as never]);
  assert.equal(valider(schema, sansMotif).ok, false);
  const longue = sortie(Array.from({ length: MAX_CORRECTIONS + 1 }, () => ({ type: "couper_plan", plan: "P05", critere: "doublon", motif: "x" }) as never));
  assert.equal(valider(schema, longue).ok, false, "au plus 8 corrections");
});

test("une relecture minimale ne soulève aucun défaut", () => {
  assert.deepEqual(problemesDeRelecture(bonne, entree), []);
  assert.deepEqual(problemesDeRelecture(sortie([]), entree), []);
});

test("défauts : renvoi à un autre plan, état de fin absent, réécriture trop large, poignée inconnue, motif absent", () => {
  const messages = (c: SortieRelecture["corrections"]) => problemesDeRelecture(sortie(c), entree).map((p) => p.message);
  assert.match(messages([{ type: "modifier_plan", plan: "P03", description: D("Red Jack parle comme au plan précédent.", "Red Jack est au bord de la rue."), critere: "physique", motif: "m" }]).join("|"), /ne renvoie à aucun autre plan/);
  assert.match(messages([{ type: "modifier_plan", plan: "P03", description: D("Red Jack parle, voir P02.", "Red Jack est au bord de la rue."), critere: "physique", motif: "m" }]).join("|"), /ne renvoie à aucun autre plan/);
  assert.match(messages([{ type: "modifier_plan", plan: "P03", description: "Red Jack parle à Elias depuis le bord de la rue, toujours à cheval.\nRed Jack : « Le train s'arrête, shérif. »", critere: "physique", motif: "m" }]).join("|"), /État en fin de plan/);
  assert.match(messages([{ type: "modifier_plan", plan: "P03", description: D("Une toute autre histoire commence ici sur une plage lointaine sans aucun rapport.", "Personne n'est nulle part."), critere: "physique", motif: "m" }]).join("|"), /presque en entier/);
  assert.match(messages([{ type: "couper_plan", plan: "P42", critere: "doublon", motif: "m" }]).join("|"), /« P42 » n'est pas un plan/);
  assert.match(messages([{ type: "couper_plan", plan: "P05", critere: "doublon", motif: " " }]).join("|"), /POURQUOI/);
  assert.match(messages([{ type: "modifier_plan", plan: "P01", description: D("Elias se tient sur le quai, la caméra en gros plan sur son visage.", "Elias est debout."), critere: "motif", motif: "m" }]).join("|"), /pas de cadrage/);
  assert.match(messages([{ type: "modifier_plan", plan: "P03", description: plansDonnes[2]!.description, critere: "physique", motif: "m" }]).join("|"), /identique/);
});

test("les mots de l'auteur sont intouchables : une réplique mot pour mot dans ses paroles ne peut ni disparaître ni être coupée", () => {
  const avecAuteur: EntreeRelecture = { ...entree, parolesDeLAuteur: ["Et Red Jack dit au shérif : Le train s'arrête, shérif. Elle répond Il part."] };
  const sansReplique = D("Red Jack parle à Elias depuis le bord de la rue, toujours à cheval.\nElias : « Il part. »", "Red Jack est au bord de la rue.");
  const p = problemesDeRelecture(sortie([{ type: "modifier_plan", plan: "P03", description: sansReplique, critere: "dialogue", motif: "m" }]), avecAuteur).map((x) => x.message).join("|");
  assert.match(p, /est de l'auteur/);
  const coupe = problemesDeRelecture(sortie([{ type: "couper_plan", plan: "P03", critere: "doublon", motif: "m" }]), avecAuteur).map((x) => x.message).join("|");
  assert.match(coupe, /réplique de l'auteur/);
  assert.deepEqual(problemesDeRelecture(sortie([{ type: "modifier_plan", plan: "P03", description: descP4, critere: "physique", motif: "m" }]), avecAuteur), [], "garder la réplique est permis");
});

test("trop de corrections, deux gestes sur un plan, un plan modifié puis coupé, deux plans ajoutés", () => {
  const c = (n: number) => Array.from({ length: n }, (_, i) => ({ type: "duree_plan", plan: `P0${(i % 6) + 1}`, secondes: 8, critere: "doublon", motif: "m" }) as SortieRelecture["corrections"][number]);
  assert.match(problemesDeRelecture(sortie(c(MAX_CORRECTIONS + 1)), { ...entree, dureeCibleSecondes: null }).map((p) => p.message).join("|"), /9 corrections/);
  assert.match(problemesDeRelecture(sortie([c(1)[0]!, c(1)[0]!]), { ...entree, dureeCibleSecondes: null }).map((p) => p.message).join("|"), /un seul geste par plan/);
  const coupeEtModif = sortie([
    { type: "couper_plan", plan: "P05", critere: "doublon", motif: "m" },
    { type: "duree_plan", plan: "P05", secondes: 9, critere: "doublon", motif: "m" },
  ]);
  assert.match(problemesDeRelecture(coupeEtModif, { ...entree, dureeCibleSecondes: null }).map((p) => p.message).join("|"), /supprimé par une autre correction/);
  const deux = sortie([
    { type: "ajouter_plan", apres: "P06", titre: "Fin", description: D("Elias rengaine.", "Elias est seule."), secondes: 6, critere: "resolution", motif: "m" },
    { type: "ajouter_plan", apres: "P06", titre: "Fin bis", description: D("Elias s'en va.", "Elias est partie."), secondes: 6, critere: "resolution", motif: "m" },
  ]);
  assert.match(problemesDeRelecture(deux, { ...entree, dureeCibleSecondes: null }).map((p) => p.message).join("|"), /Un seul plan ajouté/);
});

test("la durée totale ne sort pas de la tolérance du brief à cause de la relecture", () => {
  // 6 plans × 8 s = 48 s pour 48 s visées (±20 % : 39–57). Couper deux plans sans compenser tombe à 32 s.
  const deuxCoupes = sortie([
    { type: "couper_plan", plan: "P04", critere: "doublon", motif: "m" },
    { type: "couper_plan", plan: "P05", critere: "doublon", motif: "m" },
  ]);
  assert.match(problemesDeRelecture(deuxCoupes, entree).map((p) => p.message).join("|"), /passer l'épisode de 48 s à 32 s/);
  assert.deepEqual(problemesDeRelecture(deuxCoupes, { ...entree, dureeCibleSecondes: null }), [], "sans durée visée, rien à comparer");
  assert.deepEqual(problemesDeRelecture(sortie([{ type: "couper_plan", plan: "P05", critere: "doublon", motif: "m" }]), entree), [], "40 s restent dans la tolérance");
});

test("première liaison : le premier plan ne passe jamais en suite", () => {
  const m = problemesDeRelecture(sortie([{ type: "modifier_plan", plan: "P01", liaison: "suite", critere: "temps", motif: "m" }]), entree).map((p) => p.message).join("|");
  assert.match(m, /premier plan de l'épisode est une coupe/);
});

test("répliques et part conservée", () => {
  assert.deepEqual(repliquesDe("a\nRed Jack : « Bonjour, shérif. »\nElias : «Il part.»"), ["Bonjour, shérif.", "Il part."]);
  assert.equal(partConservee("un deux trois quatre", "un deux trois quatre"), 1);
  assert.equal(partConservee("un deux trois quatre", "un deux trois cinq"), 0.75);
  assert.equal(partConservee("", "x"), 1);
});

test("conversion : poignées → uuid, descriptions, suppression d'un plan sans fiche cochée d'office, groupe et scène", () => {
  const r = depuisRelecture(bonne, vue, entree, { groupe: "ep-9" });
  assert.deepEqual(r.refusees, []);
  assert.equal(r.bruts.length, 3);
  const [modif, coupe, duree] = r.bruts as [(typeof r.bruts)[number], (typeof r.bruts)[number], (typeof r.bruts)[number]];
  assert.equal(modif.cibleRef, "u3");
  assert.equal(modif.operation, "modifier");
  assert.equal((modif.apres as { description: string }).description, descP4);
  assert.equal(modif.groupe, "ep-9");
  assert.equal(modif.sousGroupe, "Le départ");
  assert.ok(modif.avertissements?.some((a) => a.type === "info" && /Relecture · cohérence physique/.test(a.texte)));
  assert.equal(coupe.cibleRef, "u5");
  assert.equal(coupe.operation, "supprimer");
  assert.equal(coupe.cocheOffice, true);
  assert.equal((duree.apres as { dureeGenerationSecondes: number }).dureeGenerationSecondes, 15);
  assert.ok(r.bruts.every((b) => !b.avertissements?.some((a) => a.type === "bloque_controle")));
  assert.match(r.constats[0]!, /doublon \(P04, P05\)/);
  // aucune trace d'un rang dans ce qui sera écrit
  assert.ok(!JSON.stringify(r.bruts.map((b) => b.apres)).includes("P0"));
});

test("conversion : un plan qui a une fiche n'est pas coché d'office à la suppression ; un défaut qui persiste bloque la correction", () => {
  const vueFiche = construireVue({
    episode: { id: 9, numero: 1, titre: "x" },
    objectifSecondes: null,
    scenes: [{ id: 1, titre: "Le départ" }],
    plans: plansDonnes.map((p) => ({ ...p, sceneId: 1, aFiche: p.uuid === "u5", perime: false })),
  });
  const coupe = depuisRelecture(sortie([{ type: "couper_plan", plan: "P05", critere: "doublon", motif: "m" }]), vueFiche, { ...entree, dureeCibleSecondes: null }, { groupe: "ep-9" });
  assert.equal(coupe.bruts[0]!.cocheOffice, undefined);
  const mauvaise = depuisRelecture(
    sortie([{ type: "modifier_plan", plan: "P03", description: "Red Jack parle comme au plan précédent.", critere: "physique", motif: "m" }]),
    vue,
    entree,
    { groupe: "ep-9" },
  );
  assert.ok(mauvaise.bruts[0]!.avertissements?.some((a) => a.type === "bloque_controle"), "non cochable : l'installateur relance la sous-tâche");
});

test("conversion : une liaison seule, un plan ajouté après le dernier, une poignée inconnue écartée", () => {
  const r = depuisRelecture(
    sortie([
      { type: "modifier_plan", plan: "P03", liaison: "coupe", critere: "temps", motif: "Autre moment." },
      { type: "ajouter_plan", apres: "P06", titre: "La fin", description: D("Elias rengaine son revolver et regarde la rue vide.", "Elias est seule sur le quai."), secondes: 6, critere: "resolution", motif: "Rien ne conclut." },
      { type: "couper_plan", plan: "P77", critere: "doublon", motif: "m" },
    ]),
    vue,
    { ...entree, dureeCibleSecondes: null },
    { groupe: "ep-9" },
  );
  assert.equal((r.bruts[0]!.apres as { liaison: string }).liaison, "coupe");
  const ajout = r.bruts[1]!;
  assert.equal(ajout.operation, "creer");
  assert.deepEqual(ajout.position, { apresPlanUuid: "u6" });
  assert.equal((ajout.apres as { dureeGenerationSecondes: number }).dureeGenerationSecondes, 6);
  assert.equal(r.refusees.length, 1);
  assert.equal(r.refusees[0]!.index, 2);
});

test("cochage : une suppression « office » est cochée, jamais si elle écrase ou est bloquée", () => {
  const base = { operation: "supprimer" as const, avertissements: [], ecrase: null, refuseRaison: null };
  assert.equal(cocheParDefaut(base), false, "la règle d'avant tient");
  assert.equal(cocheParDefaut({ ...base, office: true }), true);
  assert.equal(cocheParDefaut({ ...base, office: true, ecrase: "rendu réussi" }), false);
  assert.equal(cocheParDefaut({ ...base, office: true, avertissements: [{ type: "bloque_controle", texte: "x" }] }), false);
  assert.equal(cocheParDefaut({ ...base, office: true, refuseRaison: "hors portée" }), false);
});

test("opérations du réalisateur : la liaison d'un modifier_plan est validée et écrite", () => {
  const ok = validerOperations([{ type: "modifier_plan", plan: "P04", liaison: "coupe" }], vue);
  assert.deepEqual(ok.refusees, []);
  const ch = operationsVersChangements(ok.valides, vue);
  assert.deepEqual(ch[0]!.apres, { liaison: "coupe" });
  const mauvaise = validerOperations([{ type: "modifier_plan", plan: "P04", liaison: "plus tard" }], vue);
  assert.match(mauvaise.refusees[0]!.raison, /liaison « plus tard » inconnue/);
  const vide = validerOperations([{ type: "modifier_plan", plan: "P04" }], vue);
  assert.match(vide.refusees[0]!.raison, /ni nouveau titre/);
});

test("le contrôleur du skill renvoie les défauts au modèle, et ne fait rien sans l'entrée attendue", () => {
  const ctl = controleurPourSkill("relecture-scenario", entree)!;
  assert.deepEqual(ctl(bonne), []);
  assert.ok(ctl(sortie([{ type: "couper_plan", plan: "P42", critere: "doublon", motif: "m" }])).length > 0);
  assert.equal(controleurPourSkill("relecture-scenario", {}), undefined);
});
