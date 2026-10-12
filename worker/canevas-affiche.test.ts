import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HAUTEUR_CANEVAS, LARGEUR_CANEVAS, cheminCanevasAffiche } from "./canevas-affiche";

test("canevas d'affiche : gris neutre 2:3 écrit dans le dossier donné", async () => {
  const dossier = await mkdtemp(join(tmpdir(), "canevas-"));
  const ancien = process.env.COMFYUI_CANEVAS_AFFICHE_PATH;
  process.env.COMFYUI_CANEVAS_AFFICHE_PATH = join(dossier, "absent.png");
  try {
    const chemin = await cheminCanevasAffiche(dossier);
    const { default: sharp } = await import("sharp");
    const meta = await sharp(chemin).metadata();
    assert.equal(meta.width, LARGEUR_CANEVAS);
    assert.equal(meta.height, HAUTEUR_CANEVAS);
    assert.equal(LARGEUR_CANEVAS * 3, HAUTEUR_CANEVAS * 2);
  } finally {
    if (ancien === undefined) delete process.env.COMFYUI_CANEVAS_AFFICHE_PATH;
    else process.env.COMFYUI_CANEVAS_AFFICHE_PATH = ancien;
    await rm(dossier, { recursive: true, force: true });
  }
});
