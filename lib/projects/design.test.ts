import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerSkill } from "../llm/skills";
import { compilerSchema } from "../llm/validation";
import { entreeNotes, manquesFiche, ficheComplete } from "../agents/sheet";
import { SCHEMA_BRIEF, briefVide } from "../agents/brief";

import { entreeAccroche, MARQUE_PROJET_CONCU } from "../agents/hook";
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
  genresTexte,
  luminositeAmbiance,
  informationsFormat,
  plansEstimes,
  resoudreStyle,
  styleDesEditions,
  styleDesImages,
  tonDepuisGenres,
  validerConception,
  valeursParDefaut,
  type Conception,
} from "./design";
import { entreeTour } from "../agents/brief-input";
import type { StyleBibliotheque } from "../styles/library";

const filtres = { medium: "peinture", rendu: ["aplats"], palette: ["pastel"], epoque: "intemporel", ambiance: ["doux"] };
const BIBLIO: StyleBibliotheque[] = [
  { id: "gouache", nom: "Gouache", descriptor: "A painterly gouache style…", categories: ["Painting"], filtres, clause: "A matte gouache look." },
  { id: "sans-clause", nom: "Sans clause", descriptor: "Long prompt", categories: ["Painting"], filtres },
];
const base = { genres: ["Drame", "Thriller"], style: { source: "bibliotheque", styleId: "gouache" } };

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
  assert.deepEqual(valeursParDefaut(c), { duree: true, langue: true });
  assert.deepEqual(valeursParDefaut(valide({ dureeChoisie: true, langueChoisie: true })), { duree: false, langue: false });
  // An old design (or an old session) that still carries a tone is read all the same: the field is ignored.
  assert.equal("ton" in valide({ ton: 80, tonAjuste: true }), false);
});

test("validerConception : les valeurs hors liste sont refusées, jamais corrigées", () => {
  const refuse = (extra: Record<string, unknown>, motif: RegExp) => {
    const r = validerConception({ ...base, ...extra }, BIBLIO);
    assert.ok(!r.ok, JSON.stringify(extra));
    if (!r.ok) assert.match(r.erreurs.join(" "), motif);
  };
  refuse({ genres: [] }, /Genres/);
  refuse({ genres: ["Drame", "Thriller", "Action"] }, /Genres/);
  refuse({ genres: ["Drame", "Drame"] }, /Genres/);
  refuse({ genres: ["Inconnu"] }, /Genres/);
  refuse({ dureeSecondes: 29 }, /Durée/);
  refuse({ dureeSecondes: 5401 }, /Durée/);
  refuse({ rythme: "frénétique" }, /Rythme/);
  refuse({ langue: "Klingon" }, /Langue/);
  refuse({ style: { source: "bibliotheque", styleId: "inconnu" } }, /bibliothèque/);
  refuse({ style: undefined }, /Style/);
  refuse({ style: { source: "libre", nom: "Mon style", promptImage: "", clause: "x" } }, /prompt image/);
  refuse({ style: { source: "libre", nom: "Mon style", promptImage: "x", clause: "" } }, /clause courte/);
});

test("validerConception : les dix langues et « Sans dialogue » passent, un style libre est normalisé", () => {
  for (const l of [...LANGUES_DIALOGUES, SANS_DIALOGUE]) assert.equal(valide({ langue: l }).langue, l);
  const c = valide({ style: { source: "libre", nom: "  ", promptImage: " Long ", clause: " Courte ", image: "mon-style.webp" } });
  assert.deepEqual(c.style, { source: "libre", nom: "Style libre", promptImage: "Long", clause: "Courte", image: "mon-style.webp" });
});

test("lumière d'ambiance (moyenne des genres) et texte du brief : les genres seuls, sans mot de ton", () => {
  assert.equal(tonDepuisGenres(["Comédie"]), 15);
  assert.equal(tonDepuisGenres(["Drame", "Comédie"]), 48);
  assert.equal(tonDepuisGenres([]), 50);
  assert.equal(luminositeAmbiance(["Comédie"]), "0.85");
  assert.equal(genresTexte({ genres: ["Drame", "Thriller"] }), "Drame + Thriller");
  assert.equal(new Set(GENRES.map((g) => g.nom)).size, GENRES.length);
});

test("plansEstimes : mêmes plages que le skill scenario-episode", () => {
  assert.deepEqual(plansEstimes(120, "mesure"), { min: 13, max: 20, moyen: 16 });
  assert.deepEqual(plansEstimes(120, "rapide"), { min: 17, max: 24, moyen: 20 });
  assert.deepEqual(plansEstimes(30, "lent"), { min: 3, max: 4, moyen: 3 });
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

test("informationsFormat : un projet est un film", () => {
  assert.match(informationsFormat(), /un film/);
});

test("styleDesImages : le prompt long quand le projet en a un, sinon la clause", () => {
  assert.equal(styleDesImages({ clauseStyle: "Courte", stylePromptImage: " Longue " }), "Longue");
  assert.equal(styleDesImages({ clauseStyle: "Courte", stylePromptImage: "" }), "Courte");
  assert.equal(styleDesImages(null), "");
});

test("styleDesEditions : toujours la clause courte, jamais le prompt long", () => {
  assert.equal(styleDesEditions({ clauseStyle: " Courte ", stylePromptImage: "Longue" } as { clauseStyle: string }), "Courte");
  assert.equal(styleDesEditions({ clauseStyle: "" }), "");
  assert.equal(styleDesEditions(null), "");
});

test("les schémas du brief et de l'entretien acceptent le prompt long et l'image du style (posés par le code)", () => {
  const valideBrief = compilerSchema(SCHEMA_BRIEF);
  const contenu = { ...briefVide("Projet"), source: "pitch", arc: "a", style: { nom: "Gouache", clause: "Court", promptImage: "Long", image: "g.webp" }, langueDialogues: "Français", dureeEpisodeSecondes: 120, rythme: "mesure", episodes: [{ titre: "t", resume: "r" }] };
  assert.ok(valideBrief(contenu), JSON.stringify(valideBrief.errors));
  const notes = chargerSkill("notes-entretien").schema as unknown as { properties: { modifications: { properties: { style: Record<string, unknown> } } } };
  const valideStyle = compilerSchema({ ...notes.properties.modifications.properties.style, $schema: "https://json-schema.org/draft/2020-12/schema" } as never);
  assert.ok(valideStyle(contenu.style), JSON.stringify(valideStyle.errors));
});

test("entrée de l'accroche d'un projet conçu : les choix sont dits au modèle, une seule fois", () => {
  const c = valide({ genres: ["Thriller", "Drame"], dureeSecondes: 150 });
  const e = entreeAccroche(c, { nom: "Film Noir 2", clause: "A moody noir look." });
  assert.equal(e.length, 1);
  const m = e[0]!.content;
  assert.ok(m.startsWith(MARQUE_PROJET_CONCU));
  assert.match(m, /Format : film/);
  assert.match(m, /Genre : Thriller, Drame/);
  assert.doesNotMatch(m, /Ton :/);
  assert.match(m, /Durée : 2 min 30/);
  assert.match(m, /Style visuel : « Film Noir 2 » : A moody noir look\./);
  const libre = entreeAccroche(c, { nom: "", clause: "" });
  assert.match(libre[0]!.content, /style libre/);
});

test("entreeTour : le format du projet conçu est dit à l'agent, sans changer l'entrée des autres projets", () => {
  const conv = [{ role: "assistant" as const, content: "Bonjour" }, { role: "user" as const, content: "Un phare" }];
  const fiche = { contenu: {}, statuts: {} };
  const sans = entreeTour(conv, fiche, { manques: ["le héros"], complete: false });
  const avec = entreeTour(conv, fiche, { manques: ["le héros"], complete: false }, informationsFormat());
  assert.ok(!sans.at(-1)!.content.includes("Format :"));
  assert.match(avec.at(-1)!.content, /Format : un film/);
  const complet = entreeTour(conv, fiche, { manques: [], complete: true }, informationsFormat());
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
  // Round trip: a duration on the scale falls back on itself.
  for (const s of [30, 60, 120, 180, 300, 600, 1800, 3600, 5400]) assert.equal(dureeDepuisPosition(positionDepuisDuree(s)), s);
  // The keyboard arrows (25 positions) always move the duration.
  for (let p = 0; p < 975; p += 25) assert.notEqual(dureeDepuisPosition(p + 25), dureeDepuisPosition(p), `bloqué à ${p}`);
});
