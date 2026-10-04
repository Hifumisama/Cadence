import assert from "node:assert/strict";
import { test } from "node:test";
import type { EstimationGeneration, SectionBrief, VueChangement, VueGroupe, VueLot, VueSousTache } from "./agents/types";
import {
  avancementLot,
  estGroupeEpisode,
  estLotActif,
  libelleChoixEpisodes,
  libelleEtatSousTache,
  parSousGroupe,
  sousTacheRelancable,
  decompterStatuts,
  depuisSaisie,
  etapeValide,
  etatCochage,
  filEtapes,
  formaterDureeEstimee,
  groupesBrief,
  libelleEstimation,
  libellePosition,
  libelleRangs,
  libelleTache,
  lignesDiff,
  ordonnerGroupes,
  resumeCompteurs,
  typeEdition,
  valeurEnTexte,
  versSaisie,
} from "./agents-affichage";

const changement = (o: Partial<VueChangement> = {}): VueChangement => ({
  id: 1, ordre: 0, sousGroupe: null, groupe: "g", cle: null, cibleType: "episode", cibleRef: null, libelle: "x", operation: "creer",
  avant: null, apres: null, position: null, rangsDeplaces: [], avertissements: [], ecrase: null,
  coche: true, bloque: false, refuseRaison: null, appliqueAt: null, ...o,
});
const groupe = (id: string, changements: VueChangement[] = []): VueGroupe => ({ id, titre: id, changements, coches: 0, total: changements.length });

test("fil d'étapes : courte et complète, retour possible seulement en arrière", () => {
  const courte = filEtapes("courte", "proposition", "proposition");
  assert.deepEqual(courte.map((e) => e.etape), ["consigne", "proposition", "applique"]);
  assert.deepEqual(courte.map((e) => e.etat), ["faite", "courante", "a_venir"]);
  assert.deepEqual(courte.map((e) => e.cliquable), [true, false, false], "on ne saute pas en avant");

  const complete = filEtapes("complete", "proposition", "brief");
  assert.deepEqual(complete.map((e) => e.etape), ["conversation", "brief", "proposition", "applique"]);
  assert.deepEqual(complete.map((e) => e.etat), ["faite", "courante", "a_venir", "a_venir"]);
  assert.deepEqual(complete.map((e) => e.cliquable), [true, false, true, false], "la proposition déjà atteinte reste cliquable");
});

test("étape du serveur ramenée à la profondeur", () => {
  assert.equal(etapeValide("courte", "brief"), "consigne");
  assert.equal(etapeValide("courte", "conversation"), "consigne");
  assert.equal(etapeValide("complete", "consigne"), "conversation");
  assert.equal(etapeValide("complete", "brief"), "brief");
});

test("tâche d'agent : file, travail, jetons, échec", () => {
  const base = { runUuid: "u", but: "tour" as const, progressionJetons: null, erreur: null, positionFile: null };
  assert.equal(libelleTache(null), null);
  assert.equal(libelleTache({ ...base, statut: "en_attente", positionFile: 2 }), "En file · n°2");
  assert.equal(libelleTache({ ...base, statut: "en_cours" }), "L'agent réfléchit…");
  assert.equal(libelleTache({ ...base, statut: "en_cours", but: "brief", progressionJetons: 340 }), "L'agent rédige le brief… · 340 jetons");
  assert.equal(libelleTache({ ...base, statut: "en_cours", but: "proposition", progressionJetons: 1 }), "L'agent prépare la proposition… · 1 jeton");
  assert.equal(libelleTache({ ...base, statut: "echoue", erreur: "Serveur injoignable" }), "Échec : Serveur injoignable");
  assert.equal(libelleTache({ ...base, statut: "annulee" }), "Annulée");
  assert.equal(libelleTache({ ...base, statut: "termine" }), null);
});

test("estimation : local gratuit, durée, file, et squelette sans modèle", () => {
  const e: EstimationGeneration = { fournisseur: "local", modele: "gemma", coutEstimeUsd: null, jetonsEntreeEstimes: 5200, dureeEstimeeSecondes: 80, tachesDevant: 0, skill: "prompt-asset" };
  assert.equal(libelleEstimation(e), "~80 s · 5,2 k jetons · local : gratuit · part tout de suite");
  assert.equal(libelleEstimation({ ...e, tachesDevant: 2, coutEstimeUsd: 0.05 }), "~80 s · 5,2 k jetons · ≈ 0,05 $ · 2 tâches devant");
  assert.equal(libelleEstimation({ ...e, skill: null }), "construite tout de suite, sans modèle · gratuit");
  assert.equal(formaterDureeEstimee(200), "~3 min");
  assert.equal(formaterDureeEstimee(0), "quelques secondes");
});

test("brief : groupes dans l'ordre, trois états comptés", () => {
  const s = (cle: string, groupe: string, statut: SectionBrief["statut"]): SectionBrief => ({ cle: cle as SectionBrief["cle"], libelle: cle, groupe, statut, valeur: null });
  const sections = [s("titre", "Univers", "fourni"), s("arc", "Univers", "deduit"), s("style", "Style", "a_valider"), s("lieux", "Lieux", "deduit")];
  assert.deepEqual(groupesBrief(sections).map((g) => [g.groupe, g.sections.length]), [["Univers", 2], ["Style", 1], ["Lieux", 1]]);
  assert.deepEqual(decompterStatuts(sections), { fourni: 1, deduit: 2, a_valider: 1 });
});

test("valeurs du brief en texte lisible", () => {
  assert.equal(valeurEnTexte(null), "—");
  assert.equal(valeurEnTexte(["a", "b"]), "• a\n• b");
  assert.equal(valeurEnTexte({ nom: "Maya", role: "" , voix: "grave" }), "nom : Maya — voix : grave");
  assert.equal(valeurEnTexte([{ titre: "Le sel", resume: "Un phare" }]), "• titre : Le sel — resume : Un phare");
  assert.equal(valeurEnTexte(210), "210");
});

test("édition du brief : type de champ, aller-retour, erreurs", () => {
  assert.equal(typeEdition("dureeEpisodeSecondes"), "nombre");
  assert.equal(typeEdition("arc"), "texte");
  assert.equal(typeEdition("inventions"), "lignes");
  assert.equal(typeEdition("personnages"), "json");
  assert.deepEqual(depuisSaisie("dureeEpisodeSecondes", "210,4"), { ok: true, valeur: 210 });
  assert.equal(depuisSaisie("dureeEpisodeSecondes", "abc").ok, false);
  assert.equal(depuisSaisie("arc", "   ").ok, false);
  assert.equal(depuisSaisie("genreTon", "   ").ok, true, "le genre est optionnel");
  assert.deepEqual(depuisSaisie("inventions", "a\n\n b \n"), { ok: true, valeur: ["a", "b"] });
  assert.deepEqual(depuisSaisie("style", versSaisie("style", { nom: "N", clause: "C" })), { ok: true, valeur: { nom: "N", clause: "C" } });
  const mauvais = depuisSaisie("personnages", "[{");
  assert.equal(mauvais.ok, false);
});

test("revue : écrasement en tête, puis brief, puis l'ordre du serveur", () => {
  const ordre = ordonnerGroupes([groupe("episodes"), groupe("brief"), groupe("plans"), groupe("ecrasement")]);
  assert.deepEqual(ordre.map((g) => g.id), ["ecrasement", "brief", "episodes", "plans"]);
});

test("cochage d'un groupe : sur les seuls changements cochables", () => {
  assert.equal(etatCochage(groupe("a", [changement({ coche: true }), changement({ coche: true })])), "tous");
  assert.equal(etatCochage(groupe("a", [changement({ coche: false }), changement({ coche: false })])), "aucun");
  assert.equal(etatCochage(groupe("a", [changement({ coche: true }), changement({ coche: false })])), "partiel");
  assert.equal(etatCochage(groupe("a", [changement({ coche: true }), changement({ coche: false, bloque: true })])), "tous", "un bloqué ne compte pas");
  assert.equal(etatCochage(groupe("a", [changement({ coche: false, refuseRaison: "hors portée" })])), "indisponible");
});

test("compteurs : les zéros sont omis, pluriels corrects", () => {
  const c = { total: 17, selectionnes: 12, ecartes: 3, bloques: 1, refuses: 1, ecrasementsSelectionnes: 0, inventions: 0 };
  assert.equal(resumeCompteurs(c), "12 sélectionnés · 3 écartés · 1 bloqué · 1 refusé");
  assert.equal(resumeCompteurs({ ...c, selectionnes: 1, ecartes: 0, bloques: 0, refuses: 0 }), "1 sélectionné");
});

test("position d'un plan : rang affiché, jamais un identifiant", () => {
  assert.equal(libellePosition(null), null);
  assert.equal(libellePosition({ debut: true }), "Au début de l'épisode");
  assert.equal(libellePosition({ fin: true }), "À la fin de l'épisode");
  assert.equal(libellePosition({ apresPlanUuid: "u1" }, (u) => (u === "u1" ? 4 : null)), "Après le plan 04");
  assert.equal(libellePosition({ apresPlanUuid: "u2" }, () => null), "Après un plan existant");
  const rangs = [5, 6, 7, 8, 9].map((n) => ({ planUuid: `p${n}`, titre: "t", rangAvant: n, rangApres: n + 1 }));
  assert.equal(libelleRangs([]), null);
  assert.equal(libelleRangs(rangs.slice(0, 1)), "Le plan suivant bouge : 05 → 06");
  assert.equal(libelleRangs(rangs), "Les plans suivants bougent : 05 → 06, 06 → 07, 07 → 08, 08 → 09, …");
});

test("diff : champ par champ pour deux objets, une ligne sinon", () => {
  const d = lignesDiff({ titre: "Le sel", duree: 8, resume: "A" }, { titre: "Le sel", duree: 12, resume: "A", acte: "I" });
  assert.equal(d.identiques, 2);
  assert.deepEqual(d.lignes, [
    { cle: "duree", avant: "8", apres: "12", etat: "modifie" },
    { cle: "acte", avant: null, apres: "I", etat: "ajoute" },
  ]);
  assert.deepEqual(lignesDiff(null, { a: 1 }).lignes, [{ cle: "a", avant: null, apres: "1", etat: "ajoute" }]);
  assert.deepEqual(lignesDiff({ a: 1 }, null).lignes, [{ cle: "a", avant: "1", apres: null, etat: "retire" }]);
  assert.deepEqual(lignesDiff("avant", "après").lignes, [{ cle: null, avant: "avant", apres: "après", etat: "modifie" }]);
  assert.deepEqual(lignesDiff("pareil", "pareil"), { lignes: [], identiques: 1 });
  assert.deepEqual(lignesDiff(null, null), { lignes: [], identiques: 0 });
});

// --- lots et revue par épisode ---------------------------------------------------

const sous = (o: Partial<VueSousTache> = {}): VueSousTache => ({
  cle: "ep:1", libelle: "Épisode 1 · Le sel", episodeId: 1, runUuid: "u", statut: "termine", progressionJetons: null,
  erreur: null, positionFile: null, nbChangements: 0, relancee: false, ...o,
});

test("lot : avancement « 3/12 », échecs et annulations comptés comme clos", () => {
  const lot: VueLot = { sousTaches: [], total: 12, terminees: 3, echecs: 1, annulees: 2, actives: 6 };
  assert.deepEqual(avancementLot(lot), { valeur: 6, max: 12, texte: "6/12 · 1 échec · 2 annulées" });
  assert.equal(estLotActif(lot), true);
  assert.equal(estLotActif({ ...lot, actives: 0 }), false);
  assert.equal(estLotActif(null), false);
});

test("sous-tâche : ce qu'on en dit et quand on peut la relancer", () => {
  assert.equal(libelleEtatSousTache(sous({ statut: "en_attente", positionFile: 3 })), "En file · n°3");
  assert.equal(libelleEtatSousTache(sous({ statut: "en_cours", progressionJetons: 420 })), "En cours · 420 jetons");
  assert.equal(libelleEtatSousTache(sous({ statut: "en_cours" })), "En cours · démarrage…");
  assert.equal(libelleEtatSousTache(sous({ nbChangements: 1 })), "Terminé · 1 changement");
  assert.equal(libelleEtatSousTache(sous({ statut: "echoue", erreur: "panne" })), "Échec : panne");
  assert.equal(libelleEtatSousTache(sous({ statut: "annulee" })), "Annulée");
  assert.deepEqual((["en_attente", "en_cours", "termine", "echoue", "annulee"] as const).map((statut) => sousTacheRelancable({ statut })), [false, false, true, true, true]);
});

test("revue d'un lot : un groupe par épisode, les changements rangés par scène dans l'ordre", () => {
  assert.equal(estGroupeEpisode("ep-12"), true);
  assert.equal(estGroupeEpisode("plans"), false);
  assert.equal(estGroupeEpisode("ep-"), false);
  const liste = [
    changement({ id: 1, sousGroupe: null, cibleType: "episode" }),
    changement({ id: 2, sousGroupe: "Le pont", cibleType: "scene" }),
    changement({ id: 3, sousGroupe: "Le pont", cibleType: "plan" }),
    changement({ id: 4, sousGroupe: "La lampe", cibleType: "plan" }),
    changement({ id: 5, sousGroupe: "Le pont", cibleType: "replique" }),
  ];
  const blocs = parSousGroupe(liste);
  assert.deepEqual(blocs.map((b) => b.titre), [null, "Le pont", "La lampe"]);
  assert.deepEqual(blocs[1]!.changements.map((c) => c.id), [2, 3, 5]);
  // L'épisode lui-même passe en tête même s'il n'est pas le premier changement.
  assert.equal(parSousGroupe([liste[1]!, liste[0]!])[0]!.titre, null);
});

test("sélecteur d'épisodes : la ligne d'aide", () => {
  assert.equal(libelleChoixEpisodes(0, 0, 0), "Aucun épisode.");
  assert.equal(libelleChoixEpisodes(3, 2, 2), "2 épisodes sur 3 sélectionnés · 2 vides (cochés d'office)");
  assert.equal(libelleChoixEpisodes(1, 1, 1), "1 épisode sur 1 sélectionné · 1 vide (cochés d'office)");
});
