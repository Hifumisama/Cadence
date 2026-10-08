import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerSkill } from "./llm/skills";
import { compilerSchema } from "./llm/validation";
import { briefVersFiche, entreeNotes, lireFiche, manquesFiche, ficheComplete } from "./agents/fiche";
import { briefVide, fusionnerPartielDansBrouillon, promptImageDuBrief, residuPartiel } from "./agents/brief";
import type { BriefContenu } from "./agents/types";
import { entreeAccroche, MARQUE_PROJET_CONCU } from "./agents/accroche";
import {
  DUREE_MAX_SECONDES,
  DUREE_MIN_SECONDES,
  GENRES,
  LANGUES_DIALOGUES,
  SANS_DIALOGUE,
  dureeDepuisPosition,
  pasDuree,
  positionDepuisDuree,
  ficheDepuisConception,
  genreTonTexte,
  informationsFormat,
  motDuTon,
  plansEstimes,
  resoudreStyle,
  styleDesImages,
  tonDepuisGenres,
  validerConception,
  valeursParDefaut,
  type Conception,
} from "./conception";
import { entreeTour } from "./agents/brief-entree";
import type { StyleBibliotheque } from "./styles/bibliotheque";

const filtres = { medium: "peinture", rendu: ["aplats"], palette: ["pastel"], epoque: "intemporel", ambiance: ["doux"] };
const BIBLIO: StyleBibliotheque[] = [
  { id: "gouache", nom: "Gouache", descriptor: "A painterly gouache style…", categories: ["Painting"], filtres, clause: "A matte gouache look." },
  { id: "sans-clause", nom: "Sans clause", descriptor: "Long prompt", categories: ["Painting"], filtres },
];
const base = { format: "film", genres: ["Drame", "Thriller"], style: { source: "bibliotheque", styleId: "gouache" } };

function valide(extra: Record<string, unknown> = {}): Conception {
  const r = validerConception({ ...base, ...extra }, BIBLIO);
  assert.ok(r.ok, r.ok ? "" : r.erreurs.join(" | "));
  return r.valeur;
}

test("validerConception : valeurs par défaut posées pour les champs facultatifs absents", () => {
  const c = valide();
  assert.equal(c.dureeSecondes, 120);
  assert.equal(c.rythme, "mesure");
  assert.equal(c.langue, "Français");
  assert.equal(c.ton, tonDepuisGenres(["Drame", "Thriller"]));
  assert.deepEqual(valeursParDefaut(c), { ton: true, duree: true, langue: true });
  assert.deepEqual(valeursParDefaut(valide({ tonAjuste: true, dureeChoisie: true, langueChoisie: true })), { ton: false, duree: false, langue: false });
});

test("validerConception : les valeurs hors liste sont refusées, jamais corrigées", () => {
  const refuse = (extra: Record<string, unknown>, motif: RegExp) => {
    const r = validerConception({ ...base, ...extra }, BIBLIO);
    assert.ok(!r.ok, JSON.stringify(extra));
    if (!r.ok) assert.match(r.erreurs.join(" "), motif);
  };
  refuse({ format: "court-metrage" }, /Format/);
  refuse({ genres: [] }, /Genres/);
  refuse({ genres: ["Drame", "Thriller", "Action"] }, /Genres/);
  refuse({ genres: ["Drame", "Drame"] }, /Genres/);
  refuse({ genres: ["Inconnu"] }, /Genres/);
  refuse({ ton: 101 }, /Ton/);
  refuse({ ton: 40.5 }, /Ton/);
  refuse({ dureeSecondes: 29 }, /Durée/);
  refuse({ dureeSecondes: 5401 }, /Durée/);
  refuse({ rythme: "frénétique" }, /Rythme/);
  refuse({ langue: "Klingon" }, /Langue/);
  refuse({ format: "serie", episodesPrevus: 1 }, /Épisodes/);
  refuse({ style: { source: "bibliotheque", styleId: "inconnu" } }, /bibliothèque/);
  refuse({ style: undefined }, /Style/);
  refuse({ style: { source: "libre", nom: "Mon style", promptImage: "", clause: "x" } }, /prompt image/);
  refuse({ style: { source: "libre", nom: "Mon style", promptImage: "x", clause: "" } }, /clause courte/);
});

test("validerConception : les dix langues et « Sans dialogue » passent, un style libre est normalisé", () => {
  for (const l of [...LANGUES_DIALOGUES, SANS_DIALOGUE]) assert.equal(valide({ langue: l }).langue, l);
  const c = valide({ style: { source: "libre", nom: "  ", promptImage: " Long ", clause: " Courte ", image: "mon-style.webp" } });
  assert.deepEqual(c.style, { source: "libre", nom: "Style libre", promptImage: "Long", clause: "Courte", image: "mon-style.webp" });
  assert.equal(valide({ format: "serie", episodesPrevus: 6 }).episodesPrevus, 6);
  assert.equal(valide({ format: "film", episodesPrevus: 6 }).episodesPrevus, undefined, "un film n'a pas d'épisodes prévus");
});

test("ton : moyenne des genres, mot et texte du brief", () => {
  assert.equal(tonDepuisGenres(["Comédie"]), 15);
  assert.equal(tonDepuisGenres(["Drame", "Comédie"]), 48);
  assert.equal(tonDepuisGenres([]), 50);
  assert.deepEqual([0, 18, 19, 38, 39, 62, 63, 82, 83, 100].map(motDuTon), ["lumineux", "lumineux", "léger", "léger", "nuancé", "nuancé", "grave", "grave", "sombre", "sombre"]);
  assert.equal(genreTonTexte({ genres: ["Drame", "Thriller"], ton: 81 }), "Drame + Thriller, ton grave (81/100)");
  assert.equal(new Set(GENRES.map((g) => g.nom)).size, GENRES.length);
});

test("plansEstimes : mêmes plages que le skill scenario-episode", () => {
  assert.deepEqual(plansEstimes(120, "mesure"), { min: 10, max: 15, moyen: 12 });
  assert.deepEqual(plansEstimes(120, "rapide"), { min: 15, max: 24, moyen: 18 });
  assert.deepEqual(plansEstimes(30, "lent"), { min: 2, max: 3, moyen: 2 });
  assert.equal(plansEstimes(30, "lent").min >= 1, true);
});

test("resoudreStyle : bibliothèque (prompt long = descripteur), libre, et refus d'un style sans clause courte", () => {
  const r = resoudreStyle(valide(), BIBLIO);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.style, { nom: "Gouache", clause: "A matte gouache look.", promptImage: "A painterly gouache style…" });
  const sans = resoudreStyle(valide({ style: { source: "bibliotheque", styleId: "sans-clause" } }), BIBLIO);
  assert.ok(!sans.ok && /clause courte/.test(sans.erreur));
  const libre = resoudreStyle(valide({ style: { source: "libre", nom: "Mien", promptImage: "Long", clause: "Court" } }), BIBLIO);
  assert.ok(libre.ok && libre.style.promptImage === "Long" && libre.style.clause === "Court");
});

test("ficheDepuisConception : tout est fourni, il ne reste à trancher que l'arc, la fin et le héros", () => {
  const c = valide({ dureeSecondes: 180, rythme: "rapide", langue: SANS_DIALOGUE });
  const r = resoudreStyle(c, BIBLIO);
  assert.ok(r.ok);
  if (!r.ok) return;
  const fiche = ficheDepuisConception(c, r.style);
  assert.deepEqual(fiche.contenu.style, { nom: "Gouache", clause: "A matte gouache look." }, "le prompt long reste hors de la vue du modèle");
  assert.equal(fiche.contenu.langueDialogues, SANS_DIALOGUE);
  assert.equal(fiche.contenu.dureeEpisodeSecondes, 180);
  assert.equal(fiche.contenu.rythme, "rapide");
  assert.ok(Object.values(fiche.statuts).every((s) => s === "fourni"));
  assert.deepEqual(entreeNotes([], fiche).aTrancher, ["arc", "fin", "personnages"]);
  assert.equal(manquesFiche(fiche).length, 3);
  assert.equal(ficheComplete(fiche, 5), false, "la fiche n'est pas complète sans l'arc, la fin et le héros");
});

test("informationsFormat : film ou série, avec ou sans nombre d'épisodes", () => {
  assert.match(informationsFormat({ format: "film" }), /un film/);
  assert.match(informationsFormat({ format: "serie", episodesPrevus: 6 }), /6 épisodes prévus/);
  assert.match(informationsFormat({ format: "serie" }), /à définir/);
});

test("styleDesImages : le prompt long quand le projet en a un, sinon la clause", () => {
  assert.equal(styleDesImages({ clauseStyle: "Courte", stylePromptImage: " Longue " }), "Longue");
  assert.equal(styleDesImages({ clauseStyle: "Courte", stylePromptImage: "" }), "Courte");
  assert.equal(styleDesImages(null), "");
});

test("brief : le prompt long et l'image du style suivent la clause, et restent hors de la vue du modèle", () => {
  const styleCode = { nom: "Gouache", clause: "A matte gouache look.", promptImage: "Long", image: "gouache.webp" };
  const partiel = { contenu: { ...briefVide("Projet"), style: styleCode } as BriefContenu, statuts: { style: "fourni" as const } };
  assert.equal(promptImageDuBrief(partiel.contenu), "Long");
  assert.equal(promptImageDuBrief(briefVide("x")), "");

  // Le brouillon que l'agent rédige ne perd pas ce que l'utilisateur a posé.
  const brouillon = { contenu: { ...briefVide("Projet"), style: { nom: "autre", clause: "autre" } } as BriefContenu, statuts: {} };
  assert.deepEqual(fusionnerPartielDansBrouillon(brouillon, partiel).contenu.style, styleCode);

  // Abandon du brouillon : même clause → même style, prompt long conservé ; clause changée → rien de périmé.
  const projet = { titre: "Projet", clauseStyle: "A matte gouache look.", notes: "" };
  const reste = residuPartiel({ contenu: partiel.contenu, statuts: partiel.statuts }, projet);
  assert.deepEqual(reste?.contenu.style, styleCode);
  const change = residuPartiel({ contenu: partiel.contenu, statuts: partiel.statuts }, { ...projet, clauseStyle: "Une autre clause." });
  assert.deepEqual(change?.contenu.style, { nom: "", clause: "Une autre clause." });

  // Le modèle de l'entretien ne voit pas le prompt long.
  const fiche = briefVersFiche({ contenu: partiel.contenu, statuts: { style: "fourni" } }, lireFiche(null));
  assert.deepEqual(fiche.contenu.style, { nom: "Gouache", clause: "A matte gouache look." });
});

test("les schémas du brief et de l'entretien acceptent le prompt long et l'image du style (posés par le code)", () => {
  const valideBrief = compilerSchema(chargerSkill("brief-projet").schema);
  const contenu = { ...briefVide("Projet"), source: "pitch", arc: "a", style: { nom: "Gouache", clause: "Court", promptImage: "Long", image: "g.webp" }, langueDialogues: "Français", dureeEpisodeSecondes: 120, rythme: "mesure", episodes: [{ titre: "t", resume: "r" }] };
  assert.ok(valideBrief(contenu), JSON.stringify(valideBrief.errors));
  const notes = chargerSkill("notes-entretien").schema as unknown as { properties: { modifications: { properties: { style: Record<string, unknown> } } } };
  const valideStyle = compilerSchema({ ...notes.properties.modifications.properties.style, $schema: "https://json-schema.org/draft/2020-12/schema" } as never);
  assert.ok(valideStyle(contenu.style), JSON.stringify(valideStyle.errors));
});

test("entrée de l'accroche d'un projet conçu : les choix sont dits au modèle, une seule fois", () => {
  const c = valide({ genres: ["Thriller", "Drame"], ton: 80, tonAjuste: true, dureeSecondes: 150 });
  const e = entreeAccroche(c, { nom: "Film Noir 2", clause: "A moody noir look." });
  assert.equal(e.length, 1);
  const m = e[0]!.content;
  assert.ok(m.startsWith(MARQUE_PROJET_CONCU));
  assert.match(m, /Format : film/);
  assert.match(m, /Genre : Thriller, Drame/);
  assert.match(m, /Ton : sombre|Ton : grave/);
  assert.match(m, /Durée : 2 min 30/);
  assert.match(m, /Style visuel : « Film Noir 2 » : A moody noir look\./);
  const serie = entreeAccroche({ ...c, format: "serie", episodesPrevus: 6 }, { nom: "", clause: "" });
  assert.match(serie[0]!.content, /Format : série \(6 épisodes prévus\)/);
  assert.match(serie[0]!.content, /par épisode/);
  assert.match(serie[0]!.content, /style libre/);
});

test("entreeTour : le format du projet conçu est dit à l'agent, sans changer l'entrée des autres projets", () => {
  const conv = [{ role: "assistant" as const, content: "Bonjour" }, { role: "user" as const, content: "Un phare" }];
  const fiche = { contenu: {}, statuts: {} };
  const sans = entreeTour(conv, fiche, { manques: ["le héros"], complete: false });
  const avec = entreeTour(conv, fiche, { manques: ["le héros"], complete: false }, informationsFormat({ format: "serie", episodesPrevus: 6 }));
  assert.ok(!sans.at(-1)!.content.includes("Format :"));
  assert.match(avec.at(-1)!.content, /Format : une série, 6 épisodes prévus./);
  const complet = entreeTour(conv, fiche, { manques: [], complete: true }, informationsFormat({ format: "film" }));
  assert.match(complet.at(-1)!.content, /Format : un film/);
});

test("durée : l'échelle du curseur est monotone, réversible et s'arrête à 90 min", () => {
  assert.equal(dureeDepuisPosition(0), DUREE_MIN_SECONDES);
  assert.equal(dureeDepuisPosition(250), 180);
  assert.equal(dureeDepuisPosition(500), 600);
  assert.equal(dureeDepuisPosition(1000), 5400);
  let precedente = 0;
  for (let p = 0; p <= 1000; p += 5) {
    const d = dureeDepuisPosition(p);
    assert.ok(d >= precedente, `monotone à ${p}`);
    assert.ok(d >= DUREE_MIN_SECONDES && d <= DUREE_MAX_SECONDES);
    assert.equal(d % pasDuree(d), 0, `${d} s est un multiple de son pas`);
    precedente = d;
  }
  // Aller-retour : une durée de l'échelle retombe sur elle-même.
  for (const s of [30, 60, 120, 180, 300, 600, 1800, 3600, 5400]) assert.equal(dureeDepuisPosition(positionDepuisDuree(s)), s);
  // Les flèches du clavier (25 positions) font toujours bouger la durée.
  for (let p = 0; p < 975; p += 25) assert.notEqual(dureeDepuisPosition(p + 25), dureeDepuisPosition(p), `bloqué à ${p}`);
});
