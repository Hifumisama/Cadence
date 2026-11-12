import assert from "node:assert/strict";
import { test } from "node:test";
import { dureeAttendue, tacheDExport, type EntreeTacheExport } from "./montage-tache";
import { analyserCle, cleMontage, estAffichable, estAnnulable, estHorsFileGpu, ordonnerTaches, resumerTaches, type Tache } from "../taches";

const MAINTENANT = new Date("2026-11-07T12:00:00Z");
const il_y_a = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000);

const seg = (debut: number, fin: number | null) => ({ chemin: "plans/1/x.mp4", debut, fin, titre: "Plan" });
const entree = (p: Partial<EntreeTacheExport> = {}): EntreeTacheExport => ({
  id: 4,
  projectId: 2,
  episodeId: 9,
  projetNom: "Maya",
  statut: "en_attente",
  segments: [seg(0, 10), seg(1.5, 6)],
  nbIgnores: 0,
  dureeSecondes: null,
  erreur: null,
  createdAt: il_y_a(1),
  startedAt: null,
  finishedAt: null,
  vuAt: null,
  ...p,
});

test("la clé d'un export se lit comme les autres, et n'accepte qu'un id numérique", () => {
  assert.equal(cleMontage(4), "montage:4");
  assert.deepEqual(analyserCle("montage:4"), { genre: "montage", ref: "4" });
  assert.equal(analyserCle("montage:abc"), null);
  assert.equal(analyserCle("montage:4; drop"), null);
  assert.equal(analyserCle("montage:-1"), null);
  assert.equal(analyserCle("montage:"), null);
});

test("un export devient une tâche « Export du montage » qui mène à la page Montage", () => {
  const t = tacheDExport(entree());
  assert.equal(t.cle, "montage:4");
  assert.equal(t.genre, "video");
  assert.equal(t.statut, "en_attente");
  assert.equal(t.libelle, "Export du montage · Maya");
  assert.equal(t.href, "/p/2/e/9/montage");
  assert.equal(t.detail, "2 segments · 0:14.5");
  assert.equal(t.progression, null);
  assert.equal(t.erreur, null);
  assert.equal(tacheDExport(entree({ projetNom: null })).libelle, "Export du montage");
});

test("détail : durée réellement encodée une fois terminé, plans ignorés comptés ; erreur d'un échec", () => {
  const fini = tacheDExport(entree({ statut: "termine", dureeSecondes: 83.4, nbIgnores: 1, finishedAt: il_y_a(0) }));
  assert.equal(fini.detail, "2 segments · 1:23.4 · 1 ignoré");
  assert.equal(fini.finishedAt, il_y_a(0).toISOString());
  const echec = tacheDExport(entree({ statut: "echoue", erreur: "ffmpeg a échoué" }));
  assert.equal(echec.erreur, "ffmpeg a échoué");
  assert.equal(tacheDExport(entree({ statut: "echoue" })).erreur, "Échec de l'export");
  const enCours = tacheDExport(entree({ statut: "en_cours", startedAt: il_y_a(0) }));
  assert.deepEqual(enCours.progression, { valeur: 0, max: 0, etape: "Encodage (ffmpeg)" });
  assert.equal(tacheDExport(entree({ segments: [seg(0, 4)] })).detail, "1 segment · 0:04.0");
  assert.equal(tacheDExport(entree({ segments: "pas un tableau" })).detail, "0 segment");
});

test("durée attendue : somme des segments, une fin absente ne compte pas", () => {
  assert.equal(dureeAttendue([seg(0, 10), seg(2, 5), seg(3, null)]), 13);
  assert.equal(dureeAttendue([]), 0);
});

test("rétention : mêmes règles que les autres tâches (échec 24 h, terminé non vu gardé, vu 7 jours)", () => {
  const echecVieux = tacheDExport(entree({ statut: "echoue", finishedAt: il_y_a(60 * 25) }));
  assert.equal(estAffichable(echecVieux, MAINTENANT), false);
  const nonVu = tacheDExport(entree({ statut: "termine", finishedAt: il_y_a(60 * 24 * 10), createdAt: il_y_a(60 * 24 * 10) }));
  assert.equal(estAffichable(nonVu, MAINTENANT), true);
  const vuVieux = tacheDExport(entree({ statut: "termine", finishedAt: il_y_a(60 * 24 * 8), vuAt: il_y_a(60 * 24 * 8) }));
  assert.equal(estAffichable(vuVieux, MAINTENANT), false);
  const r = resumerTaches([tacheDExport(entree({ statut: "termine", finishedAt: il_y_a(1) })), tacheDExport(entree({ id: 5, statut: "echoue", finishedAt: il_y_a(1) }))]);
  assert.equal(r.terminesNonVus, 1);
  assert.equal(r.echecsNonVus, 1);
});

test("un export n'entre pas dans la file GPU : ni rang parmi elle, ni « derrière une vidéo », et ne s'annule pas", () => {
  const base = (p: Partial<Tache> & Pick<Tache, "cle" | "statut" | "genre">): Tache => ({
    libelle: p.cle,
    detail: null,
    href: "/",
    projectId: 1,
    assetId: null,
    progression: null,
    apercuSrc: null,
    vignetteSrc: null,
    createdAt: il_y_a(30).toISOString(),
    startedAt: null,
    finishedAt: null,
    vuAt: null,
    erreur: null,
    positionFile: null,
    derriereVideo: false,
    derriere: null,
    jetons: null,
    annulationDemandee: false,
    ...p,
  });
  const exportEnCours = tacheDExport(entree({ id: 1, statut: "en_cours", startedAt: il_y_a(5) }));
  const exportAttente = tacheDExport(entree({ id: 2, createdAt: il_y_a(40) }));
  const image = base({ cle: "image:a", genre: "image", statut: "en_attente", createdAt: il_y_a(10).toISOString() });
  const llmEnCours = base({ cle: "llm:b", genre: "llm", statut: "en_cours", startedAt: il_y_a(2).toISOString() });
  const r = ordonnerTaches([image, exportAttente, exportEnCours, llmEnCours], MAINTENANT);
  const par = (cle: string) => r.find((x) => x.cle === cle)!;
  // L'image est la première de la file GPU, derrière l'agent (pas derrière la « vidéo » de l'export en cours).
  assert.equal(par("image:a").positionFile, 1);
  assert.equal(par("image:a").derriere, "llm");
  assert.equal(par("image:a").derriereVideo, false);
  // L'export en attente a son propre rang, sans « derrière ».
  assert.equal(par("montage:2").positionFile, 1);
  assert.equal(par("montage:2").derriere, null);
  assert.deepEqual(r.map((x) => x.cle), ["montage:1", "llm:b", "image:a", "montage:2"]);
  // Seul un export en cours : une image en attente n'est derrière personne.
  const seul = ordonnerTaches([exportEnCours, image], MAINTENANT);
  assert.equal(seul.find((x) => x.cle === "image:a")!.derriere, null);
  assert.equal(seul.find((x) => x.cle === "image:a")!.derriereVideo, false);
  assert.equal(estHorsFileGpu(exportEnCours), true);
  assert.equal(estHorsFileGpu(image), false);
  assert.equal(estAnnulable(exportEnCours), false);
  assert.equal(estAnnulable(image), true);
});
