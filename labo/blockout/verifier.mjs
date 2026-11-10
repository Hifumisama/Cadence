// Contrôle les mp4 de sortie/ contre leur plan (ffprobe : taille, cadence, nombre d'images, durée) et en extrait trois images
// (début, milieu, fin) dans sortie/images/ pour juger le cadrage à l'œil. `node verifier.mjs [exemples/x.json …]`
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { RACINE, chargerPlan, fichiersDemandes, nombreImages, resolutionDe } from "./schema.mjs";

const SORTIE = join(RACINE, "sortie");
const IMAGES = join(SORTIE, "images");
mkdirSync(IMAGES, { recursive: true });

function lancer(commande, args) {
  const r = spawnSync(commande, args, { encoding: "utf8" });
  if (r.error) throw new Error(`${commande} est introuvable dans le PATH.`);
  if (r.status !== 0) throw new Error(`${commande} a échoué : ${r.stderr}`);
  return r.stdout;
}

let echec = false;
for (const fichier of fichiersDemandes(process.argv.slice(2))) {
  const plan = chargerPlan(fichier);
  const video = join(SORTIE, `${plan.id}.mp4`);
  if (!existsSync(video)) {
    console.error(`ABSENT  ${plan.id}.mp4 (lancer npm run rendre)`);
    echec = true;
    continue;
  }
  const n = nombreImages(plan.duree);
  const { largeur, hauteur } = resolutionDe(plan);
  const flux = JSON.parse(
    lancer("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
      "stream=width,height,r_frame_rate,nb_read_frames,duration,codec_name,pix_fmt", "-of", "json", video]),
  ).streams[0];
  const attendu = { width: largeur, height: hauteur, r_frame_rate: `${plan.cadence}/1`, nb_read_frames: String(n) };
  const ecarts = Object.entries(attendu).filter(([cle, v]) => flux[cle] !== v).map(([cle, v]) => `${cle} = ${flux[cle]} (attendu ${v})`);
  echec ||= ecarts.length > 0;
  console.log(
    `${ecarts.length ? "ÉCART " : "ok    "} ${plan.id}.mp4  ${flux.width}x${flux.height}  ${flux.r_frame_rate} i/s  ${flux.nb_read_frames} images  ` +
      `${Number(flux.duration).toFixed(3)} s  ${flux.codec_name}/${flux.pix_fmt}${ecarts.length ? `  → ${ecarts.join(" ; ")}` : ""}`,
  );
  for (const [nom, rang] of [["debut", 0], ["milieu", Math.floor(n / 2)], ["fin", n - 1]]) {
    lancer("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vf", `select=eq(n\\,${rang})`, "-frames:v", "1", join(IMAGES, `${plan.id}_${nom}.png`)]);
  }
}
console.log(`Images extraites dans ${IMAGES}`);
process.exit(echec ? 1 : 0);
