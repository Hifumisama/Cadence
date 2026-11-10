// Rend des plans de blockout en mp4 : `node rendre.mjs [exemples/x.json …]` (sans argument : tous les exemples).
// Capture image par image dans Chrome sans écran (rendu logiciel SwiftShader, donc sans carte graphique), puis encodage par ffmpeg.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";
import { RACINE, chargerPlan, fichiersDemandes, nombreImages, resolutionDe } from "./schema.mjs";

const SORTIE = join(RACINE, "sortie");

function trouverNavigateur() {
  const candidats = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const trouve = candidats.find((c) => existsSync(c));
  if (!trouve) throw new Error("Ni Chrome ni Edge trouvé : donner le chemin de l'exécutable dans la variable CHROME_PATH.");
  return trouve;
}

function exigerFfmpeg() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error("ffmpeg est introuvable dans le PATH : l'installer (winget install Gyan.FFmpeg) puis rouvrir le terminal.");
  return r.stdout.split("\n")[0].trim();
}

/** Sert le dossier du labo en local : une page file:// ne peut pas importer de module. */
function servir() {
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  const serveur = createServer((req, res) => {
    if (req.url === "/favicon.ico") return void res.writeHead(204).end(); // demandé d'office par le navigateur
    const chemin = normalize(join(RACINE, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!chemin.startsWith(RACINE) || !existsSync(chemin) || !TYPES[extname(chemin)]) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(chemin)] }).end(readFileSync(chemin));
  });
  return new Promise((ok) => serveur.listen(0, "127.0.0.1", () => ok(serveur)));
}

async function rendrePlan(navigateur, port, plan) {
  const n = nombreImages(plan.duree);
  const { largeur, hauteur } = resolutionDe(plan);
  const cible = join(SORTIE, `${plan.id}.mp4`);

  const page = await navigateur.newPage();
  const erreursPage = [];
  page.on("pageerror", (e) => erreursPage.push(e.message));
  page.on("console", (m) => m.type() === "error" && erreursPage.push(m.text()));
  await page.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/page/index.html`);
  await page.waitForFunction("window.pret === true", { timeout: 15000 }).catch(() => {
    throw new Error(`La page de rendu ne s'est pas chargée : ${erreursPage.join(" | ") || "aucune erreur remontée"}`);
  });
  await page.evaluate((p, total) => window.preparer(p, total), plan, n);

  // Les PNG partent tels quels dans ffmpeg ; -bitexact retire les métadonnées datées du mp4.
  const ffmpeg = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(plan.cadence), "-c:v", "png", "-i", "-",
      "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", "-fflags", "+bitexact", "-flags:v", "+bitexact",
      "-movflags", "+faststart", cible],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const fin = new Promise((ok, ko) => {
    ffmpeg.on("error", ko);
    ffmpeg.on("close", (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg a échoué (code ${code}) sur ${plan.id}`))));
  });

  const empreinte = createHash("sha256");
  for (let i = 0; i < n; i++) {
    const url = await page.evaluate((k) => window.image(k), i);
    const png = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    empreinte.update(png);
    if (!ffmpeg.stdin.write(png)) await new Promise((ok) => ffmpeg.stdin.once("drain", ok));
  }
  ffmpeg.stdin.end();
  await fin;
  await page.close();
  if (erreursPage.length) throw new Error(`Erreurs dans la page pendant ${plan.id} : ${erreursPage.join(" | ")}`);

  const images = empreinte.digest("hex");
  writeFileSync(join(SORTIE, `${plan.id}.sha256.txt`), `${images}  ${n} images PNG ${largeur}x${hauteur}\n`);
  console.log(`${plan.id}.mp4  ${n} images  ${largeur}x${hauteur}  images sha256 ${images.slice(0, 16)}…`);
}

const plans = fichiersDemandes(process.argv.slice(2)).map(chargerPlan);
console.log(exigerFfmpeg());
mkdirSync(SORTIE, { recursive: true });
const serveur = await servir();
const navigateur = await puppeteer.launch({
  executablePath: trouverNavigateur(),
  headless: true,
  // SwiftShader : WebGL calculé par le processeur, le même avec ou sans carte graphique.
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--force-device-scale-factor=1",
    "--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text", "--font-render-hinting=none"],
});
try {
  for (const plan of plans) await rendrePlan(navigateur, serveur.address().port, plan);
} finally {
  await navigateur.close();
  serveur.close();
}
