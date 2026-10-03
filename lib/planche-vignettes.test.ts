import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ErreurPlanche,
  argsVignette,
  binaires,
  contenuPlanche,
  etiquetteInstant,
  executerProcessus,
  extrairePlanche,
  instantsVignettes,
  mesurerDuree,
  nomVignette,
  type Executeur,
} from "./planche-vignettes";

test("instants : une vignette par seconde dans le fichier, marge de fin", () => {
  assert.deepEqual(instantsVignettes(6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(instantsVignettes(6.4), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(instantsVignettes(6.1), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(instantsVignettes(15.04), Array.from({ length: 15 }, (_, i) => i));
  assert.deepEqual(instantsVignettes(0.2), [0]);
  assert.deepEqual(instantsVignettes(0), []);
  assert.deepEqual(instantsVignettes(Number.NaN), []);
});

test("instants : plafond pour un plan long, répartis sur la durée", () => {
  const i = instantsVignettes(30);
  assert.equal(i.length, 15);
  assert.equal(i[0], 0);
  assert.equal(i[1], 2);
  assert.equal(i.at(-1), 28);
  const j = instantsVignettes(20, 8);
  assert.deepEqual(j, [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5]);
});

test("étiquettes et noms de fichiers", () => {
  assert.equal(etiquetteInstant(4), "4 s");
  assert.equal(etiquetteInstant(7.5), "7,5 s");
  assert.equal(nomVignette(3, 3), "vignette_03_3-00s.jpg");
  assert.equal(nomVignette(12, 17.5), "vignette_12_17-50s.jpg");
});

test("binaires : PATH par défaut, FFMPEG_PATH, FFPROBE_PATH prioritaire", () => {
  assert.deepEqual(binaires({}), { ffmpeg: "ffmpeg", ffprobe: "ffprobe" });
  const b = binaires({ FFMPEG_PATH: join("C:", "outils", "ffmpeg.exe") });
  assert.equal(b.ffmpeg, join("C:", "outils", "ffmpeg.exe"));
  assert.match(b.ffprobe, /outils[\\/]ffprobe(\.exe)?$/);
  assert.equal(binaires({ FFMPEG_PATH: "/x/ffmpeg", FFPROBE_PATH: "/y/ffprobe" }).ffprobe, "/y/ffprobe");
});

test("arguments ffmpeg : -ss avant -i, largeur, JPEG sur stdout", () => {
  const a = argsVignette("rendu.mp4", 4, 384, 5);
  assert.ok(a.indexOf("-ss") < a.indexOf("-i"));
  assert.equal(a[a.indexOf("-ss") + 1], "4");
  assert.equal(a[a.indexOf("-vf") + 1], "scale=384:-2");
  assert.equal(a.at(-1), "pipe:1");
});

/** Faux ffprobe/ffmpeg : durée fixée, un « JPEG » factice par instant. */
function faux(duree: string): { executer: Executeur; appels: { binaire: string; args: string[] }[] } {
  const appels: { binaire: string; args: string[] }[] = [];
  return {
    appels,
    executer: async (binaire, args) => {
      appels.push({ binaire, args });
      if (binaire.includes("ffprobe")) return Buffer.from(`${duree}\n`);
      return Buffer.from(`JPEG@${args[args.indexOf("-ss") + 1]}`);
    },
  };
}

test("extrairePlanche : durée mesurée, une vignette par instant, base64", async () => {
  const f = faux("6.041667");
  const p = await extrairePlanche("plans/7/rendu.mp4", { executer: f.executer, env: {} });
  assert.equal(p.dureeSecondes, 6.041667);
  assert.equal(p.largeur, 384);
  assert.deepEqual(p.vignettes.map((v) => v.instantSecondes), [0, 1, 2, 3, 4, 5]);
  assert.equal(Buffer.from(p.vignettes[3]!.imageBase64, "base64").toString(), "JPEG@3");
  assert.equal(f.appels[0]!.binaire, "ffprobe");
  assert.equal(f.appels.length, 7);
});

test("extrairePlanche : plafond respecté sur un plan long", async () => {
  const p = await extrairePlanche("long.mp4", { executer: faux("45").executer, env: {} });
  assert.equal(p.vignettes.length, 15);
  assert.equal(p.vignettes[1]!.instantSecondes, 3);
});

test("mesurerDuree : sortie illisible → erreur franche, jamais une estimation", async () => {
  await assert.rejects(mesurerDuree("x.mp4", { executer: faux("N/A").executer, env: {} }), (e: unknown) => e instanceof ErreurPlanche && e.code === "duree_illisible");
});

test("extrairePlanche : image vide → erreur d'extraction", async () => {
  const executer: Executeur = async (b) => (b.includes("ffprobe") ? Buffer.from("3") : Buffer.alloc(0));
  await assert.rejects(extrairePlanche("x.mp4", { executer, env: {} }), /aucune image à 0 s/);
});

test("binaire introuvable → message actionnable (FFMPEG_PATH)", async () => {
  const env = { FFMPEG_PATH: join(tmpdir(), "cadence-absent", "ffmpeg-inexistant.exe") };
  await assert.rejects(extrairePlanche("x.mp4", { env }), (e: unknown) => {
    assert.ok(e instanceof ErreurPlanche && e.code === "introuvable");
    assert.match((e as Error).message, /ffprobe introuvable .*renseigne FFPROBE_PATH \(ou FFMPEG_PATH\)/);
    return true;
  });
  await assert.rejects(executerProcessus(env.FFMPEG_PATH, ["-version"]), /ffmpeg introuvable .*installe-le ou renseigne FFMPEG_PATH/);
});

test("contenuPlanche : intitulé, puis « Vignette à N s » + image JPEG en data URL", () => {
  const c = contenuPlanche({ dureeSecondes: 2.04, largeur: 384, vignettes: [{ instantSecondes: 0, imageBase64: "QUJD" }, { instantSecondes: 1, imageBase64: "REVG" }] });
  assert.equal(c.length, 5);
  assert.match((c[0] as { text: string }).text, /durée réelle du fichier : 2,04 s, 2 vignettes/);
  assert.deepEqual(c[3], { type: "text", text: "Vignette à 1 s :" });
  assert.deepEqual(c[4], { type: "image_url", image_url: { url: "data:image/jpeg;base64,REVG" } });
});

// Vrai ffmpeg : seulement s'il est installé (sinon le test est sauté, pas raté).
const ffmpegPresent = (() => {
  try {
    execFileSync(binaires().ffmpeg, ["-version"], { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
})();

test("intégration ffmpeg réelle : vidéo de synthèse de 3 s", { skip: !ffmpegPresent && "ffmpeg absent de cette machine" }, async () => {
  const d = mkdtempSync(join(tmpdir(), "cadence-planche-"));
  try {
    const video = join(d, "mire.mp4");
    execFileSync(binaires().ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=640x360:rate=24", "-pix_fmt", "yuv420p", video], { windowsHide: true });
    const p = await extrairePlanche(video);
    assert.ok(Math.abs(p.dureeSecondes - 3) < 0.1);
    assert.deepEqual(p.vignettes.map((v) => v.instantSecondes), [0, 1, 2]);
    for (const v of p.vignettes) assert.equal(Buffer.from(v.imageBase64, "base64").subarray(0, 2).toString("hex"), "ffd8");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
