import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { messageBriefPret } from "./brief-input";
import { chargerSkill } from "../llm/skills";
import { compilerSchema } from "../llm/validation";
import { controleurPourSkill } from "../llm/checks";
import { SCHEMA_BRIEF } from "./brief";
import { accrocheEntretien, PISTES, tirerPistes } from "./hook";
import {
  FICHE_VIDE,
  MIN_MESSAGES_FICHE,
  MIN_MESSAGES_GROS_BLOC,
  PLAFOND_MESSAGES_DETAILS,
  PLAFOND_MESSAGES_MOMENTS,
  REQUIS,
  SECTIONS_PATCHABLES,
  SEUIL_GROS_BLOC,
  appliquerNotes,
  briefVersFiche,
  delegationGlobale,
  detailsAPreciser,
  ditImmobilite,
  immobiliteDansNotes,
  momentsRequis,
  entreeNotes,
  ficheComplete,
  ficheVersBrief,
  formuleVague,
  lireFiche,
  manquesEssentiels,
  manquesFiche,
  minMessagesFiche,
  suppositions,
  titreAAdopter,
  type Fiche,
} from "./sheet";

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

const tenueTheo = { coupe: "parka longue, jean droit", couleurs: "gris anthracite, écharpe rouge", matieres: "nylon mat, laine", evolution: "identique du début à la fin" };

/** `n` moments with a visible action. */
const momentsDe = (n: number): string[] => Array.from({ length: n }, (_, i) => `Théo traverse la rue n° ${i + 1} en courant.`);

function ficheDite(): Fiche {
  return {
    contenu: { arc: "A", moments: momentsDe(18), genreTon: "T", style, rythme: "soutenu", dureeEpisodeSecondes: 180, personnages: [{ ...heros, tenue: tenueTheo }] },
    statuts: { arc: "fourni", fin: "fourni", moments: "fourni", genreTon: "fourni", style: "fourni", rythme: "fourni", dureeEpisodeSecondes: "fourni", personnages: "fourni" },
    details: { "tenue:theo": "fourni", raccords: "fourni" },
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

// --- Enriched interview (2026-11-08): details to specify, bounded delegations, big first block --------------------------------------

/** The essentials settled, a hero without costume, a place without look, an effect without colour: details remain. */
function ficheEssentielle(): Fiche {
  const f = ficheDite();
  return {
    contenu: {
      ...f.contenu,
      personnages: [heros, { nom: "Mamie", role: "grand-mère", age: "70 ans", apparence: "petite, cheveux blancs", reconnaissable: "ses lunettes" }],
      lieux: [{ nom: "La rue", description: "Une rue pavée" }],
      elements: [{ nom: "Le souffle", nature: "vfx", description: "Un coup de vent" }],
    },
    statuts: f.statuts,
  };
}

test("détails : générés depuis la fiche, dans l'ordre tenues, décors, effets, raccords ; ils retiennent l'entretien", () => {
  const f = ficheEssentielle();
  assert.deepEqual(detailsAPreciser(f).map((d) => d.cle), ["tenue:theo", "tenue:mamie", "lieu:la rue", "element:le souffle", "raccords"]);
  assert.deepEqual(manquesEssentiels(f), []);
  assert.deepEqual(manquesFiche(f), detailsAPreciser(f).map((d) => d.libelle), "manquesFiche liste les détails après l'essentiel");
  assert.match(manquesFiche(f)[0]!, /tenue de Théo/);
  assert.equal(ficheComplete(f, 5), false, "l'essentiel ne suffit plus");
  assert.equal(ficheComplete(f, PLAFOND_MESSAGES_DETAILS), true, "au plafond, les détails ne retiennent plus : l'entretien ne s'éternise pas");
  assert.deepEqual(entreeNotes([], f).detailsATrancher.map((d) => d.cle), detailsAPreciser(f).map((d) => d.cle));
  assert.deepEqual(entreeNotes([], f).aTrancher, [], "aTrancher reste l'essentiel");
});

test("détails : une tenue dite précisément est tranchée, une formule vague reste « incertain »", () => {
  const msg = "Théo porte une parka longue grise en nylon mat, avec une écharpe rouge.";
  const precis = appliquerNotes(
    ficheEssentielle(),
    { modifications: { personnages: [{ ...heros, tenue: { coupe: "parka longue", couleurs: "gris, écharpe rouge", matieres: "nylon mat" } }] }, sources: [], details: [{ detail: "tenue:Théo", origine: "dit", citation: "une parka longue grise en nylon mat" }] },
    [msg],
  );
  assert.equal(precis.details?.["tenue:theo"], "fourni");
  assert.ok(!detailsAPreciser(precis).some((d) => d.cle === "tenue:theo"));
  assert.equal((precis.contenu.personnages as { tenue?: { statut?: string } }[])[0]!.tenue!.statut, "fourni", "le statut est recopié dans le brief");

  const vague = "Sa tenue est inspirée du dessin animé, cheveux longs.";
  const flou = appliquerNotes(
    ficheEssentielle(),
    { modifications: { personnages: [{ ...heros, tenue: { coupe: "inspirée du dessin animé", couleurs: "les couleurs du dessin animé" } }] }, sources: [], details: [{ detail: "tenue:theo", origine: "dit", citation: "Sa tenue est inspirée du dessin animé" }] },
    [vague],
  );
  assert.equal(flou.details?.["tenue:theo"], "incertain");
  assert.ok(detailsAPreciser(flou).some((d) => d.cle === "tenue:theo"), "une référence sans couleur ni matière se redemande");
  assert.equal(formuleVague("style manga"), true);
  assert.equal(formuleVague("inspirée des moines, safran et ocre"), false, "une couleur nommée : ce n'est plus vague");
  assert.equal(formuleVague("tunique de lin"), false);
});

test("délégations bornées : « je te laisse décider » répondant à UNE question ne vaut que pour elle", () => {
  const conversation = [
    { role: "user", content: "Un garçon qui maîtrise l'air." },
    { role: "assistant", content: "Et pour la musique, tu entends quoi ?" },
    { role: "user", content: "Je te laisse décider." },
  ];
  const utilisateur = conversation.filter((m) => m.role === "user").map((m) => m.content);
  const sortie = {
    modifications: { genreTon: "Aventure", rythme: "soutenu", dureeEpisodeSecondes: 120 },
    sources: ["genreTon", "rythme", "dureeEpisodeSecondes"].map((section) => ({ section, origine: "delegue", citation: "Je te laisse décider" })),
    fin: { origine: "delegue", citation: "Je te laisse décider" },
  };
  const f = appliquerNotes(FICHE_VIDE, sortie, utilisateur, conversation);
  assert.deepEqual([f.statuts.genreTon, f.statuts.rythme, f.statuts.dureeEpisodeSecondes, f.statuts.fin], ["deduit", "deduit", "deduit", undefined], "une réponse à la question sur la musique ne délègue ni le ton, ni le rythme, ni la durée, ni la fin");

  // The question named the rhythm: only the rhythm is delegated.
  const surLeRythme = [...conversation.slice(0, 1), { role: "assistant", content: "Côté rythme, plutôt lent ou nerveux ?" }, conversation[2]!];
  const g = appliquerNotes(FICHE_VIDE, sortie, utilisateur, surLeRythme);
  assert.deepEqual([g.statuts.rythme, g.statuts.genreTon], ["delegue", "deduit"]);

  // A global delegation ("carte blanche pour le reste") holds for everything it covers, details included.
  const globale = [...conversation.slice(0, 2), { role: "user", content: "Carte blanche pour le reste !" }];
  const h = appliquerNotes(
    FICHE_VIDE,
    {
      ...sortie,
      sources: sortie.sources.map((s) => ({ ...s, citation: "Carte blanche pour le reste" })),
      fin: { origine: "delegue", citation: "Carte blanche pour le reste" },
      modifications: { ...sortie.modifications, personnages: [{ ...heros, tenue: tenueTheo }] },
      details: [{ detail: "tenue:theo", origine: "delegue", citation: "Carte blanche pour le reste" }, { detail: "raccords", origine: "delegue", citation: "Carte blanche pour le reste" }],
    },
    globale.filter((m) => m.role === "user").map((m) => m.content),
    globale,
  );
  assert.deepEqual([h.statuts.genreTon, h.statuts.rythme, h.statuts.fin, h.details?.["tenue:theo"], h.details?.raccords], ["delegue", "delegue", "delegue", "delegue", "delegue"]);
  assert.equal(delegationGlobale("je te laisse décider"), false);
  assert.equal(delegationGlobale("imagine le reste"), true);
});

test("délégations : un détail délégué par son nom est tranché ; une délégation sur les questions ouvertes ne tranche rien", () => {
  const conversation = [
    { role: "user", content: "Théo a trente ans." },
    { role: "assistant", content: "Comment est habillé Théo ?" },
    { role: "user", content: "Comme tu veux pour lui." },
  ];
  const f = appliquerNotes(
    ficheEssentielle(),
    {
      modifications: { personnages: [{ ...heros, tenue: tenueTheo }], questionsOuvertes: ["La musique ?"] },
      sources: [{ section: "questionsOuvertes", origine: "delegue", citation: "Comme tu veux pour lui" }],
      details: [{ detail: "tenue:theo", origine: "delegue", citation: "Comme tu veux pour lui" }],
    },
    conversation.filter((m) => m.role === "user").map((m) => m.content),
    conversation,
  );
  assert.equal(f.details?.["tenue:theo"], "delegue");
  assert.equal(f.statuts.questionsOuvertes, "deduit", "une délégation sur les questions ouvertes reste une supposition");
  assert.ok(!detailsAPreciser(f).some((d) => d.cle === "tenue:theo"));
});

test("gros premier bloc : trois messages au moins avant la complétude", () => {
  const bloc = "x".repeat(SEUIL_GROS_BLOC);
  assert.equal(minMessagesFiche([bloc]), MIN_MESSAGES_GROS_BLOC);
  assert.equal(minMessagesFiche(["Un phare."]), MIN_MESSAGES_FICHE);
  const f = ficheDite();
  assert.equal(ficheComplete(f, [bloc, "ok"]), false, "un gros bloc et une réponse : trop tôt");
  assert.equal(ficheComplete(f, [bloc, "ok", "oui"]), true);
  assert.equal(ficheComplete(f, ["Un phare.", "ok"]), true);
});

test("détails : lus depuis la base, gardés à la relecture du brouillon, et jamais recopiés comme section du brief", () => {
  const lue = lireFiche({ contenu: {}, statuts: {}, details: { "tenue:theo": "incertain", raccords: "n'importe quoi" } });
  assert.deepEqual(lue.details, { "tenue:theo": "incertain" });
  const relue = briefVersFiche({ contenu: { arc: "A" }, statuts: { arc: "fourni" } }, ficheDite());
  assert.deepEqual(relue.details, ficheDite().details);
  const { contenu, statuts } = ficheVersBrief(ficheDite(), "T");
  assert.ok(!("details" in contenu) && !("details" in statuts));
  assert.ok(compilerSchema(SCHEMA_BRIEF)({ ...contenu }), "un brief avec tenue reste valide");
});

// --- The screenwriter who digs (2026-11-17): enough moments for the duration ------------------------------------------------------

test("momentsRequis : un moment distinct toutes les dix secondes, arrondi au-dessus", () => {
  assert.equal(momentsRequis(120), 12);
  assert.equal(momentsRequis(125), 13);
  assert.equal(momentsRequis(180), 18);
  assert.equal(momentsRequis(undefined), 0);
  assert.equal(momentsRequis(0), 0);
});

/** Project 259: 120 s, everything settled, and only the beats the user gave. */
function fiche120(moments: string[], statut: "fourni" | "delegue" | "deduit" = "fourni"): Fiche {
  const f = ficheDite();
  return { ...f, contenu: { ...f.contenu, dureeEpisodeSecondes: 120, moments }, statuts: { ...f.statuts, moments: statut } };
}

test("moments : trois pour 120 s ne suffisent pas ; douze validés, si", () => {
  const trois = fiche120(["La danseuse danse sur la scène.", "Elle bascule dans un enfer de flammes vertes.", "Elle disparaît dans les flammes."]);
  assert.equal(ficheComplete(trois, 5), false, "la durée est un plancher");
  assert.deepEqual(manquesEssentiels(trois), ["les moments du film (3 sur 12)"]);
  assert.equal(ficheComplete(fiche120(momentsDe(12)), 5), true);
  const proposes = fiche120(momentsDe(12), "deduit");
  assert.equal(ficheComplete(proposes, 5), false, "proposés mais pas validés par l'utilisateur");
  assert.match(manquesEssentiels(proposes)[0]!, /12 notés sur 12, pas encore validés/);
  assert.equal(ficheComplete(fiche120(momentsDe(12), "delegue"), 5), true, "« je te laisse faire » : la suite proposée tranche");
  assert.equal(ficheComplete(trois, PLAFOND_MESSAGES_DETAILS), false, "le plafond des détails ne libère pas les moments");
  assert.equal(ficheComplete(trois, PLAFOND_MESSAGES_MOMENTS), true, "filet de sécurité : l'entretien ne reste jamais bloqué");
  assert.deepEqual(entreeNotes([], trois).aTrancher, ["moments"]);
  assert.equal(entreeNotes([], trois).momentsRequis, 12);
});

test("appliquerNotes : les moments dits ou validés sont notés ; une suite ajoutée sans preuve redevient supposée", () => {
  const conversation = [
    { role: "user", content: "Une danseuse qui bascule dans un enfer de flammes vertes." },
    { role: "assistant", content: "Voici la suite des moments que je vois : 1. … 12. … Ça te va ?" },
    { role: "user", content: "Ça me va, garde cette suite." },
  ];
  const utilisateur = conversation.filter((m) => m.role === "user").map((m) => m.content);
  const valide = appliquerNotes(fiche120([], "deduit"), { modifications: { moments: momentsDe(12) }, sources: [{ section: "moments", origine: "dit", citation: "Ça me va, garde cette suite" }] }, utilisateur, conversation);
  assert.deepEqual(valide.contenu.moments, momentsDe(12));
  assert.equal(valide.statuts.moments, "fourni");
  assert.equal(ficheComplete(valide, utilisateur), true);
  // Three moments said, then the model adds nine of its own without proof: they are not the user's.
  const dits = fiche120(momentsDe(3));
  const ajoutes = appliquerNotes(dits, { modifications: { moments: momentsDe(12) }, sources: [] }, utilisateur);
  assert.equal(ajoutes.statuts.moments, "deduit");
  const reformules = appliquerNotes(dits, { modifications: { moments: momentsDe(3).map((m) => `${m} !`) }, sources: [] }, utilisateur);
  assert.equal(reformules.statuts.moments, "fourni", "reformuler la même suite ne lui ôte pas son statut");
  // A delegation answering the question on the moments.
  const deleg = [conversation[0]!, { role: "assistant", content: "Qu'est-ce qu'on voit, moment après moment ?" }, { role: "user", content: "Je te laisse faire." }];
  const d = appliquerNotes(fiche120([], "deduit"), { modifications: { moments: momentsDe(12) }, sources: [{ section: "moments", origine: "delegue", citation: "Je te laisse faire" }] }, deleg.filter((m) => m.role === "user").map((m) => m.content), deleg);
  assert.equal(d.statuts.moments, "delegue");
  assert.equal(ficheComplete(d, 5), true);
  // The brief carries them.
  assert.deepEqual(ficheVersBrief(valide, "T").contenu.moments, momentsDe(12));
  assert.ok(compilerSchema(SCHEMA_BRIEF)({ ...ficheVersBrief(valide, "T").contenu }), "un brief avec moments reste valide");
});

test("immobilité : jamais « statique », « immobile » ou « figé » comme qualité d'un personnage ou comme moment", () => {
  assert.equal(ditImmobilite("apparence funèbre et statique"), true);
  assert.equal(ditImmobilite("Elle reste FIGÉE au centre"), true);
  assert.equal(ditImmobilite("gestes lents, saccadés, comme une marionnette"), false);
  const erreurs = immobiliteDansNotes({
    modifications: {
      personnages: [{ ...heros, nom: "La danseuse", apparence: "apparence funèbre et statique", gestuelle: "gestes lents, saccadés" }],
      moments: ["La danseuse tourne sur la scène.", "La danseuse est désormais immobile."],
    },
  });
  assert.equal(erreurs.length, 2);
  assert.match(erreurs[0]!, /La danseuse.*apparence/);
  assert.match(erreurs[1]!, /moments, n° 2/);
  assert.deepEqual(immobiliteDansNotes({ modifications: {} }), []);
  assert.equal(controleurPourSkill("notes-entretien", {})!({ modifications: { moments: ["Elle reste figée."] } }).length, 1, "renvoi au modèle");
});

test("suppositions : ce que l'agent a posé sans que l'utilisateur le dise", () => {
  const f = ficheDite();
  f.contenu.titre = "L'Éveil";
  f.statuts.titre = "deduit";
  f.contenu.inventions = ["Le héros s'appelle Théo"];
  f.statuts.inventions = "deduit";
  assert.deepEqual(suppositions(f), ["titre"]);
});

// --- Visible inventions (project 259, trace 1758) ---------------------------------------------------------------------------------

type Rejeu = { ficheAvant: Fiche; conversation: { role: string; content: string }[]; sortie: { modifications: Record<string, unknown> } & Record<string, unknown> };
const rejeu = JSON.parse(readFileSync(new URL("./fixtures/notes-1758.json", import.meta.url), "utf-8")) as Rejeu;
const utilisateur259 = rejeu.conversation.filter((m) => m.role === "user").map((m) => m.content);

test("projet 259, trace 1758 : une citation sur le changement de tenue ne prouve ni la tenue ni le décor", () => {
  // What this output proves on its own: the sheet as it was before the call, plus the call's patch, applied to an empty sheet.
  const sortie = { ...rejeu.sortie, modifications: { ...rejeu.ficheAvant.contenu, ...rejeu.sortie.modifications } };
  const f = appliquerNotes(FICHE_VIDE, sortie, utilisateur259, rejeu.conversation);
  assert.equal(f.statuts.lieux, "deduit", "aucune citation ne parle du décor");
  assert.equal(f.details?.["lieu:la scene de danse"], "deduit");
  assert.equal(f.details?.["tenue:la danseuse"], "deduit", "« Elle se mouille de noir, en quelques secondes » ne nomme pas la tenue");
  assert.equal(f.details?.raccords, "deduit", "ni ses changements (la citation est trop courte pour les nommer)");
  assert.equal(f.details?.["element:transformation de la tenue"], "fourni", "« … des effets spéciaux » nomme bien l'effet");
  assert.equal(f.statuts.fin, "fourni");
  const s = suppositions(f);
  assert.ok(s.includes("lieux"));
  assert.ok(s.includes("tenue:la danseuse") && s.includes("raccords"), "les détails supposés d'une section dite sont listés");
  assert.ok(!s.includes("lieu:la scene de danse"), "le décor est déjà couvert par « lieux »");
  const message = messageBriefPret(f);
  assert.match(message, /Ce que j'ai supposé.*lieux.*la tenue de La Danseuse/s);
  assert.doesNotMatch(message, /\(coupe, couleurs, matières\)/, "libellé court");
});

test("une citation ne prouve que ce qu'elle nomme : le nom entier ou un mot du thème", () => {
  const avant: Fiche = { contenu: { personnages: rejeu.ficheAvant.contenu.personnages }, statuts: { personnages: "fourni" } };
  const lieux = rejeu.ficheAvant.contenu.lieux;
  const f = appliquerNotes(
    avant,
    {
      modifications: { lieux },
      sources: [{ section: "lieux", origine: "dit", citation: "une danse très érotique" }],
      details: [
        { detail: "lieu:La Scène de Danse", origine: "dit", citation: "une danse très érotique" },
        { detail: "tenue:La Danseuse", origine: "dit", citation: "la tenue de la danseuse soit plutôt rouge" },
        { detail: "raccords", origine: "dit", citation: "Transformation matérielle" },
      ],
    },
    utilisateur259,
  );
  assert.equal(f.statuts.lieux, "deduit", "« danse » ne nomme pas « La Scène de Danse »");
  assert.equal(f.details?.["lieu:la scene de danse"], "deduit");
  assert.equal(f.details?.["tenue:la danseuse"], "fourni", "la citation nomme la tenue");
  assert.equal(f.details?.raccords, "fourni", "« transformation » parle des changements de tenue");
  const nomme = appliquerNotes(avant, { modifications: { lieux }, sources: [{ section: "lieux", origine: "dit", citation: "sur la scène de danse" }] }, ["Ça se passe sur la scène de danse."]);
  assert.equal(nomme.statuts.lieux, "fourni", "le nom entier, article ôté, suffit");
  assert.equal(appliquerNotes(FICHE_VIDE, { modifications: { genreTon: "Fantasy" }, sources: [{ section: "genreTon", origine: "dit", citation: "une danse très érotique" }] }, utilisateur259).statuts.genreTon, "fourni", "l'essentiel garde la seule vérification mot pour mot");
});

test("fiche → brief : la forme complète, avec ce que le code peut poser sans inventer d'important", () => {
  const { contenu, statuts } = ficheVersBrief(ficheDite(), "Self made man");
  assert.equal(contenu.titre, "Self made man");
  assert.equal(contenu.langueDialogues, "Français");
  assert.equal(statuts.langueDialogues, "deduit");
  assert.equal(contenu.episodes.length, 1);
  assert.equal(contenu.source, "pitch");
  assert.deepEqual(contenu.inventions, []);
  assert.equal(statuts.arc, "fourni");
  assert.equal((statuts as Record<string, string>).fin, undefined, "la fin n'est pas une section du brief");
  const valide = compilerSchema(SCHEMA_BRIEF);
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
  const brief = SCHEMA_BRIEF as unknown as { properties: Record<string, unknown> };
  assert.deepEqual(Object.keys(notes.properties.modifications.properties).sort(), [...SECTIONS_PATCHABLES].sort());
  for (const cle of SECTIONS_PATCHABLES) assert.deepEqual(notes.properties.modifications.properties[cle], brief.properties[cle], cle);
  assert.deepEqual([...notes.properties.sources.items.properties.section.enum].sort(), [...SECTIONS_PATCHABLES].sort(), "`fin` ne se dit que dans le champ de premier niveau");
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

test("titreAAdopter : le titre de l'entretien devient le nom du projet tant que celui-ci est provisoire", () => {
  const avec = (titre: string): Fiche => ({ contenu: { titre }, statuts: {} });
  assert.equal(titreAAdopter(avec("Le Chat Témoin"), FICHE_VIDE, "Sans titre"), "Le Chat Témoin");
  // The title proposed the first time, then refined: we follow as long as the name has not been touched by hand.
  assert.equal(titreAAdopter(avec("Le Chat et la Rupture"), avec("Le Chat Témoin"), "Le Chat Témoin"), "Le Chat et la Rupture");
  // A name corrected at the clap is never overwritten.
  assert.equal(titreAAdopter(avec("Le Chat et la Rupture"), avec("Le Chat Témoin"), "Mon titre à moi"), null);
  // Never an empty or provisional title, nor an identical rewrite.
  assert.equal(titreAAdopter(avec("Sans titre"), FICHE_VIDE, "Sans titre"), null);
  assert.equal(titreAAdopter(avec("  "), FICHE_VIDE, "Sans titre"), null);
  assert.equal(titreAAdopter(avec("Le Chat"), FICHE_VIDE, "Le Chat"), null);
});

test("entrée des notes : le titre est à proposer dès que l'histoire a un cœur et qu'aucun titre n'existe", async () => {
  const { entreeNotes, titreManquant } = await import("./sheet");
  const avecArc = { contenu: { arc: "Un chat témoin d'un cambriolage." }, statuts: {} };
  assert.equal(entreeNotes([], FICHE_VIDE).titreAProposer, false, "pas d'arc : trop tôt");
  assert.equal(entreeNotes([], avecArc).titreAProposer, true);
  assert.equal(entreeNotes([], { ...avecArc, contenu: { ...avecArc.contenu, titre: "Le Chat Témoin" } }).titreAProposer, false);
  assert.equal(titreManquant({ contenu: { titre: "Sans titre" }, statuts: {} }), true);
});
