import assert from "node:assert/strict";
import { test } from "node:test";
import { nomModeleCourt } from "./traces";

test("nomModeleCourt : un chemin de fichier GGUF devient son nom, borné à la colonne", () => {
  const chemin = "D:\\localAI\\models\\qwen3.8_27B_Dense_Swift1.5\\Swift-1.5-Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf";
  assert.ok(chemin.length > 80);
  assert.equal(nomModeleCourt(chemin), "Swift-1.5-Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf");
  assert.equal(nomModeleCourt("/models/a/b.gguf"), "b.gguf");
  assert.equal(nomModeleCourt("gemma4-26b-A4B"), "gemma4-26b-A4B");
  assert.equal(nomModeleCourt("x".repeat(120)).length, 80);
});
