import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirProchaineTache, type TacheEnAttente } from "./ordonnanceur";
import { ERREUR_INTERROMPUE, fichiersOrphelins } from "./reprise";
import type { GenreTache } from "../lib/gpu";

const t = (genre: GenreTache, id: number, minute: number): TacheEnAttente => ({
  genre,
  id,
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, minute)),
});

test("rien en attente : aucune tâche", () => {
  assert.equal(choisirProchaineTache([]), null);
});

test("images avant vidéo, même si la vidéo est plus ancienne", () => {
  const video = t("video", 1, 0);
  const image = t("image", 7, 30);
  assert.deepEqual(choisirProchaineTache([video, image]), image);
  assert.deepEqual(choisirProchaineTache([image, video]), image);
});

test("image avant llm avant vidéo (tâches courtes d'abord), quel que soit l'âge ou le domaine précédent", () => {
  const video = t("video", 1, 0);
  const llm = t("llm", 2, 10);
  const image = t("image", 3, 20);
  for (const precedent of [null, "comfyui", "llm"] as const) {
    assert.deepEqual(choisirProchaineTache([video, llm, image], precedent), image);
    assert.deepEqual(choisirProchaineTache([video, llm], precedent), llm);
    assert.deepEqual(choisirProchaineTache([llm, video], precedent), llm);
  }
});

test("à genre égal : FIFO, puis id", () => {
  assert.equal(choisirProchaineTache([t("image", 3, 10), t("image", 2, 5), t("image", 4, 8)])?.id, 2);
  assert.equal(choisirProchaineTache([t("video", 9, 1), t("video", 8, 1)])?.id, 8);
  assert.equal(choisirProchaineTache([t("llm", 5, 3), t("llm", 4, 4)])?.id, 5);
});

test("une file qui ne contient que de la vidéo, ou que du llm : elle passe", () => {
  assert.equal(choisirProchaineTache([t("video", 5, 3)])?.genre, "video");
  assert.equal(choisirProchaineTache([t("llm", 5, 3)])?.genre, "llm");
});

test("le choix ne modifie pas la liste reçue (pas de préemption : on choisit entre deux tâches, on n'en coupe aucune)", () => {
  const liste = [t("video", 1, 0), t("image", 2, 1), t("llm", 3, 2)];
  choisirProchaineTache(liste);
  assert.deepEqual(liste.map((x) => x.id), [1, 2, 3]);
});

// --- Propriétés : on rejoue des files au hasard (graine fixe) comme le worker :
// à chaque tour une tâche est prise ET retirée ; des tâches nouvelles arrivent entre
// deux tours. Rien ne se coupe en cours de route : une tâche prise va au bout.

function aleatoire(graine: number) {
  let s = graine;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test("propriété : jamais de famine — avec un flux fini d'arrivées, toute tâche finit par passer, vidéo comprise", () => {
  for (let graine = 1; graine <= 200; graine++) {
    const alea = aleatoire(graine);
    const genres: GenreTache[] = ["image", "llm", "video"];
    let id = 0;
    let horloge = 0;
    const file: TacheEnAttente[] = [];
    const nouvelle = () => file.push({ genre: genres[Math.floor(alea() * 3)]!, id: ++id, createdAt: new Date(Date.UTC(2026, 9, 1, 0, horloge++)) });
    for (let i = 0; i < 3; i++) nouvelle();
    const traitees = new Set<number>();
    let precedent: "comfyui" | "llm" | null = null;
    let tour = 0;
    while (file.length > 0) {
      assert.ok(tour++ < 500, `boucle infinie (graine ${graine})`);
      // Des arrivées pendant les 60 premiers tours, puis le flux se tarit.
      if (tour < 60 && alea() < 0.6) nouvelle();
      const choix: TacheEnAttente = choisirProchaineTache(file, precedent)!;
      assert.ok(choix, "une file non vide donne toujours une tâche");
      const i = file.findIndex((x) => x.id === choix.id);
      file.splice(i, 1); // prise ET retirée : jamais deux fois la même
      assert.ok(!traitees.has(choix.id), "une tâche n'est prise qu'une fois");
      traitees.add(choix.id);
      precedent = choix.genre === "llm" ? "llm" : "comfyui";
    }
    assert.equal(traitees.size, id, `toutes les tâches sont passées (graine ${graine})`);
  }
});

test("propriété : seule une tâche plus prioritaire ou plus ancienne du même genre en dépasse une ; jamais une plus récente du même genre", () => {
  for (let graine = 1; graine <= 100; graine++) {
    const alea = aleatoire(graine * 7);
    const genres: GenreTache[] = ["image", "llm", "video"];
    const file: TacheEnAttente[] = Array.from({ length: 8 }, (_, i) => ({
      genre: genres[Math.floor(alea() * 3)]!,
      id: i + 1,
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)),
    }));
    const ordre: TacheEnAttente[] = [];
    const reste = [...file];
    while (reste.length > 0) {
      const c = choisirProchaineTache(reste, null)!;
      ordre.push(c);
      reste.splice(reste.findIndex((x) => x.id === c.id), 1);
    }
    // Pour chaque genre, l'ordre de passage est l'ordre d'arrivée (FIFO).
    for (const g of genres) {
      const ids = ordre.filter((x) => x.genre === g).map((x) => x.id);
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b), `FIFO du genre ${g} (graine ${graine})`);
    }
    // Et les genres passent par paliers : toutes les images, puis tous les llm, puis toutes les vidéos.
    const rang = { image: 0, llm: 1, video: 2 } as const;
    const rangs = ordre.map((x) => rang[x.genre]);
    assert.deepEqual(rangs, [...rangs].sort((a, b) => a - b), `paliers respectés (graine ${graine})`);
  }
});

test("à égalité de palier, le domaine de la tâche précédente passe d'abord (aujourd'hui sans effet : un genre par palier)", () => {
  // Deux genres du même domaine (image, vidéo) n'ont pas le même palier : l'image reste prioritaire.
  assert.equal(choisirProchaineTache([t("video", 1, 0), t("image", 2, 5)], "llm")?.genre, "image");
  assert.equal(choisirProchaineTache([t("llm", 1, 0), t("video", 2, 5)], "comfyui")?.genre, "llm");
});

test("reprise : seul le fichier d'aperçu d'une génération interrompue est à supprimer", () => {
  assert.deepEqual(fichiersOrphelins({ assetId: 12, apercuFichier: "abc.apercu.jpg" }), ["generations/12/abc.apercu.jpg"]);
  assert.deepEqual(fichiersOrphelins({ assetId: 12, apercuFichier: null }), []);
  assert.match(ERREUR_INTERROMPUE, /Interrompue/);
});
