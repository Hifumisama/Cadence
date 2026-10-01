import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { pngFactice } from "../worker/comfyui/stubPng";
import { estLargeurMiniature, estMiniaturisable, lireLargeur, urlMiniature } from "./miniatures";
import { DOSSIER_MINIATURES, cheminCache, nomCache, obtenirMiniature, prefixeCache } from "./miniatures-serveur";

test("liste blanche : seules les largeurs prévues passent", () => {
  assert.equal(lireLargeur("192"), 192);
  assert.equal(lireLargeur("96"), 96);
  assert.equal(lireLargeur("768"), 768);
  for (const mauvais of [null, "", "0", "100", "5000", "192abc", "1e2", "192.0", " 192", "-192", "00192", "99999"]) {
    assert.equal(lireLargeur(mauvais), null, `« ${mauvais} » doit être refusé`);
  }
  assert.ok(estLargeurMiniature(384));
  assert.ok(!estLargeurMiniature(385));
});

test("miniaturisable : images raster seulement, GIF exclu", () => {
  assert.ok(estMiniaturisable("assets/CHAR_maya.png"));
  assert.ok(estMiniaturisable("assets/x.JPG"));
  assert.ok(estMiniaturisable("assets/x.webp"));
  assert.ok(!estMiniaturisable("assets/anim.gif"));
  assert.ok(!estMiniaturisable("plans/1/rendu.mp4"));
  assert.ok(!estMiniaturisable("assets/voix.wav"));
  assert.ok(!estMiniaturisable("assets/sans-extension"));
});

test("urlMiniature : ajoute w, garde v, ne touche pas au reste", () => {
  assert.equal(urlMiniature("/api/media/assets/a.png?v=123", 192), "/api/media/assets/a.png?v=123&w=192");
  assert.equal(urlMiniature("/api/media/assets/a.png", 96), "/api/media/assets/a.png?w=96");
  // une largeur déjà présente est remplacée, pas dupliquée
  assert.equal(urlMiniature("/api/media/assets/a.png?w=96&v=1", 384), "/api/media/assets/a.png?w=384&v=1");
  // vidéo, audio, GIF, URL hors route média : rendues telles quelles
  assert.equal(urlMiniature("/api/media/plans/1/r.mp4?v=1", 192), "/api/media/plans/1/r.mp4?v=1");
  assert.equal(urlMiniature("/api/media/assets/v.wav", 192), "/api/media/assets/v.wav");
  assert.equal(urlMiniature("/api/media/assets/a.gif", 192), "/api/media/assets/a.gif");
  assert.equal(urlMiniature("https://exemple.test/a.png", 192), "https://exemple.test/a.png");
});

test("clé de cache : stable, sensible au chemin, au mtime et à la taille", () => {
  assert.equal(prefixeCache("assets/a.png"), prefixeCache("assets\\a.png"));
  assert.notEqual(prefixeCache("assets/a.png"), prefixeCache("assets/b.png"));
  const base = nomCache("assets/a.png", 1000.7, 500);
  assert.equal(base, nomCache("assets/a.png", 1000.2, 500)); // mtime tronqué à la ms
  assert.notEqual(base, nomCache("assets/a.png", 2000, 500));
  assert.notEqual(base, nomCache("assets/a.png", 1000, 501));
  assert.match(base, /^[0-9a-f]{20}-1000-500\.webp$/);
  const c = cheminCache("/racine", 192, "assets/a.png", 1000, 500);
  assert.ok(c.includes(DOSSIER_MINIATURES) && c.includes("192") && c.endsWith(base));
});

function racineTemporaire(): string {
  const racine = mkdtempSync(join(tmpdir(), "cadence-mini-"));
  mkdirSync(join(racine, "assets"), { recursive: true });
  return racine;
}

test("sharp : miniature WebP réduite, plus légère, mise en cache", async () => {
  const racine = racineTemporaire();
  try {
    const original = pngFactice(1024, 576);
    writeFileSync(join(racine, "assets", "a.png"), original);

    const m = await obtenirMiniature(racine, "assets/a.png", 192);
    assert.ok(m, "miniature produite");
    assert.ok(m.taille < original.length, `${m.taille} o doit être < ${original.length} o`);
    const octets = readFileSync(m.chemin);
    assert.equal(octets.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(octets.subarray(8, 12).toString("ascii"), "WEBP");
    const meta = await sharp(octets).metadata();
    assert.equal(meta.width, 192);
    assert.equal(meta.height, 108);

    // deuxième appel : même fichier, pas de nouvelle écriture (cache)
    const avant = statSync(m.chemin).mtimeMs;
    const m2 = await obtenirMiniature(racine, "assets/a.png", 192);
    assert.equal(m2?.chemin, m.chemin);
    assert.equal(statSync(m.chemin).mtimeMs, avant);

    // appels simultanés : un seul fichier au final
    const [x, y] = await Promise.all([obtenirMiniature(racine, "assets/a.png", 96), obtenirMiniature(racine, "assets/a.png", 96)]);
    assert.equal(x?.chemin, y?.chemin);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});

test("sharp : jamais d'agrandissement", async () => {
  const racine = racineTemporaire();
  try {
    writeFileSync(join(racine, "assets", "petite.png"), pngFactice(100, 60));
    const m = await obtenirMiniature(racine, "assets/petite.png", 384);
    assert.ok(m);
    assert.equal((await sharp(readFileSync(m.chemin)).metadata()).width, 100);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});

test("image remplacée sous le même nom : miniature neuve, ancienne purgée", async () => {
  const racine = racineTemporaire();
  try {
    const source = join(racine, "assets", "a.png");
    writeFileSync(source, pngFactice(1024, 576));
    utimesSync(source, new Date(2026, 0, 1), new Date(2026, 0, 1));
    const avant = await obtenirMiniature(racine, "assets/a.png", 192);
    assert.ok(avant);

    // l'adoption d'un candidat réécrit le fichier : autre contenu, autre date
    writeFileSync(source, pngFactice(800, 800));
    utimesSync(source, new Date(2026, 5, 1), new Date(2026, 5, 1));
    const apres = await obtenirMiniature(racine, "assets/a.png", 192);
    assert.ok(apres);
    assert.notEqual(apres.chemin, avant.chemin);
    assert.equal((await sharp(readFileSync(apres.chemin)).metadata()).height, 192, "reflète la nouvelle image (carrée)");
    assert.ok(!existsSync(avant.chemin), "l'ancienne miniature est supprimée");
    assert.equal(readdirSync(join(racine, DOSSIER_MINIATURES, "192")).filter((n) => n.endsWith(".webp")).length, 1);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});

test("repli : source absente, non image ou corrompue → null (l'original sera servi)", async () => {
  const racine = racineTemporaire();
  try {
    assert.equal(await obtenirMiniature(racine, "assets/absente.png", 192), null);
    writeFileSync(join(racine, "assets", "voix.wav"), Buffer.from("RIFFxxxx"));
    assert.equal(await obtenirMiniature(racine, "assets/voix.wav", 192), null);
    writeFileSync(join(racine, "assets", "casse.png"), Buffer.from("ceci n'est pas un png"));
    assert.equal(await obtenirMiniature(racine, "assets/casse.png", 192), null);
    assert.equal(await obtenirMiniature(racine, "assets", 192), null);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});
