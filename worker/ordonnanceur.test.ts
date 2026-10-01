import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirProchaineTache, type TacheEnAttente } from "./ordonnanceur";
import { ERREUR_INTERROMPUE, fichiersOrphelins } from "./reprise";

const t = (genre: "image" | "video", id: number, minute: number): TacheEnAttente => ({
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

test("à genre égal : FIFO, puis id", () => {
  assert.equal(choisirProchaineTache([t("image", 3, 10), t("image", 2, 5), t("image", 4, 8)])?.id, 2);
  assert.equal(choisirProchaineTache([t("video", 9, 1), t("video", 8, 1)])?.id, 8);
});

test("une file qui ne contient que de la vidéo : la vidéo passe", () => {
  assert.equal(choisirProchaineTache([t("video", 5, 3)])?.genre, "video");
});

test("le choix ne modifie pas la liste reçue (pas de préemption : on choisit entre deux tâches, on n'en coupe aucune)", () => {
  const liste = [t("video", 1, 0), t("image", 2, 1)];
  choisirProchaineTache(liste);
  assert.deepEqual(liste.map((x) => x.id), [1, 2]);
});

test("reprise : seul le fichier d'aperçu d'une génération interrompue est à supprimer", () => {
  assert.deepEqual(fichiersOrphelins({ assetId: 12, apercuFichier: "abc.apercu.jpg" }), ["generations/12/abc.apercu.jpg"]);
  assert.deepEqual(fichiersOrphelins({ assetId: 12, apercuFichier: null }), []);
  assert.match(ERREUR_INTERROMPUE, /Interrompue/);
});
