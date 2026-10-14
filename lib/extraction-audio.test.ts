import assert from "node:assert/strict";
import { test } from "node:test";
import { argsExtractionAudio, extraireAudioDeVideo } from "./extraction-audio";

test("extraction audio : la piste seule, en mp3, sur stdout", () => {
  const a = argsExtractionAudio("v.mp4");
  assert.deepEqual(a.slice(a.indexOf("-i"), a.indexOf("-i") + 2), ["-i", "v.mp4"]);
  assert.ok(a.includes("-vn"));
  assert.equal(a.at(-1), "pipe:1");
});

test("extraction audio : une sortie vide (pas de piste) est une erreur franche", async () => {
  await assert.rejects(extraireAudioDeVideo("v.mp4", async () => Buffer.alloc(0), { }), /aucun audio/);
  const mp3 = await extraireAudioDeVideo("v.mp4", async () => Buffer.from("ID3"), {});
  assert.equal(mp3.toString(), "ID3");
});
