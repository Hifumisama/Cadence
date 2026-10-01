import assert from "node:assert/strict";
import { test } from "node:test";
import { cheminSortieDistant, premierFichierSortie } from "./sortie";

test("images : la clé de SaveImage", () => {
  const f = premierFichierSortie({ images: [{ filename: "a.png", subfolder: "", type: "output" }] });
  assert.equal(f?.filename, "a.png");
  assert.equal(cheminSortieDistant(f!), "a.png");
});

test("audio : la clé d'un SaveAudio, avec sous-dossier", () => {
  const f = premierFichierSortie({ audio: [{ filename: "cadence_SFX_porte_00001_.mp3", subfolder: "audio", type: "output" }] });
  assert.equal(cheminSortieDistant(f!), "audio/cadence_SFX_porte_00001_.mp3");
});

test("vidéo : gifs puis videos", () => {
  assert.equal(premierFichierSortie({ gifs: [{ filename: "v.mp4" }] })?.filename, "v.mp4");
  assert.equal(premierFichierSortie({ videos: [{ filename: "w.mp4" }] })?.filename, "w.mp4");
});

test("clé inconnue : la première liste de fichiers, pas un autre tableau", () => {
  const f = premierFichierSortie({ text: ["pas un fichier"], son: [{ filename: "x.flac", subfolder: "s" }] });
  assert.equal(cheminSortieDistant(f!), "s/x.flac");
});

test("un fichier temporaire passe après un fichier sorti", () => {
  const f = premierFichierSortie({ audio: [{ filename: "t.mp3", type: "temp" }, { filename: "o.mp3", type: "output" }] });
  assert.equal(f?.filename, "o.mp3");
});

test("pas (encore) de fichier : null", () => {
  assert.equal(premierFichierSortie(undefined), null);
  assert.equal(premierFichierSortie(null), null);
  assert.equal(premierFichierSortie({}), null);
  assert.equal(premierFichierSortie({ images: [] }), null);
  assert.equal(premierFichierSortie({ text: ["abc"] }), null);
});
