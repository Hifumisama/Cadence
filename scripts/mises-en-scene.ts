import "dotenv/config";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { assets, briefs, episodes, jobs, planRefs, plans, projects, scenes } from "../db/schema";
import { briefVide } from "../lib/agents/brief";
import { lancerDemandeFichePlan } from "../lib/demandes-db";
import { creerJobRelance } from "../lib/job-relance";
import {
  ASSETS_DEMOS,
  CLES_DEMOS,
  DUREE_DEMOS_SECONDES,
  NOM_PROJET_DEMOS,
  SCENE_CREATIVITE,
  SCENE_STYLES,
  SEED_DEMOS,
  cheminDemo,
  cleDemoDuPlan,
  planifierDemos,
} from "../lib/h3ir/demos";
import { MEDIA_ROOT, cheminAssetMedia } from "../lib/media";
import { binaires, executerProcessus } from "../lib/planche-vignettes";

/** Fabrique les VIDÉOS DE DÉMO de l'écran « Mise en scène » de `/nouveau` (lib/h3ir/demos.ts), dans un projet spécial avec le pipeline normal de Cadence.
 *
 *   npm run mises-en-scene -- preparer [--forcer]      crée le projet « Démos · mise en scène », 2 scènes, 3 références (descriptions et prompts d'image neutres) et 12 plans
 *   npm run mises-en-scene -- fiches [--seulement a,b]  lance « Générer la fiche avec Open H3 IR » sur les plans (le worker les enchaîne)
 *   npm run mises-en-scene -- rendus [--seulement a,b] [--variante [--fois N]]   met en file un aperçu (0,4 MP, même seed) pour chaque plan dont la fiche est faite
 *   npm run mises-en-scene -- etat                     où en est chaque démo : références, fiche, rendu, fichier publié
 *   npm run mises-en-scene -- publier [--seulement a,b]  copie le rendu RETENU de chaque plan (sinon le dernier terminé) en data/mises-en-scene/<démo>.mp4 + affiche .webp
 *
 * Étapes à la main entre les commandes : générer et valider les 3 images de référence (page des assets du projet), puis rendre les plans (page du plan ou aperçus du film), et
 * retenir le meilleur essai de chaque plan. `preparer` ne réécrit pas ce qui existe, sauf avec --forcer (description, durée, seed, réglages). Ne pas lancer `fiches` ni les rendus
 * pendant une vraie production : le GPU est partagé. */

const COMMANDE = process.argv[2] ?? "";
const drapeau = (nom: string) => process.argv.includes(nom);
function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const seulement = (arg("--seulement") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const retenu = (cle: string) => seulement.length === 0 || seulement.includes(cle);

const CLAUSE_STYLE = "Photorealistic live-action cinematography, natural neutral rendering.";

async function projetDemos() {
  const [p] = await db.select().from(projects).where(eq(projects.nom, NOM_PROJET_DEMOS));
  return p ?? null;
}

async function preparer(): Promise<void> {
  const forcer = drapeau("--forcer");
  let projet = await projetDemos();
  if (!projet) {
    const [cree] = await db.insert(projects).values({ nom: NOM_PROJET_DEMOS, clauseStyle: CLAUSE_STYLE, stylePromptImage: CLAUSE_STYLE }).returning();
    projet = cree!;
    console.log(`Projet créé : ${NOM_PROJET_DEMOS} (id ${projet.id}).`);
  } else console.log(`Projet existant : ${NOM_PROJET_DEMOS} (id ${projet.id}).`);
  const pid = projet.id;

  let [episode] = await db.select().from(episodes).where(eq(episodes.projectId, pid)).orderBy(asc(episodes.numero));
  if (!episode) [episode] = await db.insert(episodes).values({ projectId: pid, numero: 1, titre: "" }).returning();

  // Le français comme langue des dialogues (sans cela, « Auto » : le brief d'Open H3 IR le signale et envoie « French »).
  // Le contenu part de `briefVide` (forme complète : les consommateurs lisent `.length` sur personnages/lieux sans garde).
  const contenuBrief = { ...briefVide(NOM_PROJET_DEMOS), langueDialogues: "Français", style: { nom: "Prises de vue réelles", clause: CLAUSE_STYLE } };
  const [brief] = await db.select({ id: briefs.id, contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, pid));
  if (!brief) {
    await db.insert(briefs).values({ projectId: pid, statut: "partiel", source: "conversation", contenu: contenuBrief });
  } else if (!Array.isArray((brief.contenu as { personnages?: unknown } | null)?.personnages)) {
    // Brief incomplet écrit par une version précédente de ce script : on le complète sans rien perdre.
    await db.update(briefs).set({ contenu: { ...contenuBrief, ...(brief.contenu as object) } }).where(eq(briefs.id, brief.id));
    console.log("  Brief complété (personnages, lieux…)");
  }

  const idScene = new Map<string, number>();
  for (const [ordre, titre] of [SCENE_STYLES, SCENE_CREATIVITE].entries()) {
    let [s] = await db.select().from(scenes).where(and(eq(scenes.episodeId, episode!.id), eq(scenes.titre, titre)));
    if (!s) [s] = await db.insert(scenes).values({ episodeId: episode!.id, ordre, titre }).returning();
    idScene.set(titre, s!.id);
  }

  const idAsset = new Map<string, number>();
  for (const a of ASSETS_DEMOS) {
    let [ligne] = await db.select().from(assets).where(and(eq(assets.projectId, pid), eq(assets.code, a.code)));
    if (!ligne) {
      [ligne] = await db
        .insert(assets)
        .values({ projectId: pid, code: a.code, label: a.label, type: a.type, description: a.description, promptGeneration: a.promptGeneration, methodeGeneration: "generation" })
        .returning();
      console.log(`  Asset créé : ${a.code}`);
    } else if (forcer) {
      await db.update(assets).set({ label: a.label, description: a.description, promptGeneration: a.promptGeneration }).where(eq(assets.id, ligne.id));
    }
    idAsset.set(a.code, ligne!.id);
  }

  for (const [ordre, d] of planifierDemos().entries()) {
    let [plan] = await db.select().from(plans).where(and(eq(plans.projectId, pid), eq(plans.titre, d.titre)));
    const valeurs = {
      description: d.description,
      sceneId: idScene.get(d.scene)!,
      liaison: "coupe",
      dureeMontageSecondes: DUREE_DEMOS_SECONDES,
      dureeGenerationSecondes: DUREE_DEMOS_SECONDES,
      megapixels: 0.4,
      seed: SEED_DEMOS,
      creativite: d.creativite,
      styleCamera: d.styleCamera,
    };
    if (!plan) {
      [plan] = await db.insert(plans).values({ projectId: pid, episodeId: episode!.id, ordre, titre: d.titre, ...valeurs }).returning();
      console.log(`  Plan créé : ${d.titre}`);
    } else if (forcer && retenu(d.cle)) {
      await db.update(plans).set({ ordre, ...valeurs, updatedAt: new Date() }).where(eq(plans.id, plan.id));
      console.log(`  Plan réécrit : ${d.titre}`);
    }
    // Les trois références, dans cet ordre (images 1 à 3). Une fiche d'Open H3 IR les réécrit ensuite d'après son manifeste.
    const refs = await db.select().from(planRefs).where(eq(planRefs.planId, plan!.id));
    if (refs.length === 0) {
      await db.insert(planRefs).values(ASSETS_DEMOS.map((a, i) => ({ planId: plan!.id, type: "picture" as const, slot: i + 1, assetId: idAsset.get(a.code)!, role: a.role })));
    }
  }

  console.log(`\nPrêt. Étapes suivantes :\n  1. Ouvre /p/${pid}/assets : génère et valide les 3 images (La femme, L'homme, Les deux toits). Voir le prompt de chaque asset.\n  2. npm run mises-en-scene -- fiches   (quand les images existent et que le GPU est libre)\n  3. Rends les plans, retiens le meilleur essai de chacun, puis : npm run mises-en-scene -- publier`);
}

type LignePlan = { id: number; uuid: string; titre: string; statut: string; scene: string | null; creativite: string | null; styleCamera: string | null; renduRetenuId: number | null; cle: string | null };

async function plansDemos(projectId: number): Promise<LignePlan[]> {
  const lignes = await db
    .select({ id: plans.id, uuid: plans.uuid, titre: plans.titre, statut: plans.statut, scene: scenes.titre, creativite: plans.creativite, styleCamera: plans.styleCamera, renduRetenuId: plans.renduRetenuId })
    .from(plans)
    .leftJoin(scenes, eq(scenes.id, plans.sceneId))
    .where(eq(plans.projectId, projectId))
    .orderBy(asc(plans.ordre));
  return lignes.map((l) => ({ ...l, cle: cleDemoDuPlan(l) }));
}

/** Les références du plan qui n'ont pas encore leur fichier : il faut générer les images avant de compiler. */
async function refsSansFichier(planId: number): Promise<string[]> {
  const refs = await db.select({ code: assets.code, fichier: assets.fichier }).from(planRefs).innerJoin(assets, eq(assets.id, planRefs.assetId)).where(eq(planRefs.planId, planId));
  return refs.filter((r) => !r.fichier || !existsSync(join(MEDIA_ROOT, cheminAssetMedia(r.fichier)))).map((r) => r.code);
}

async function fiches(): Promise<void> {
  const projet = await projetDemos();
  if (!projet) throw new Error("Projet de démos introuvable : lance d'abord `preparer`.");
  const lignes = (await plansDemos(projet.id)).filter((l) => l.cle && retenu(l.cle));
  const manquantes = new Set<string>();
  for (const l of lignes) for (const c of await refsSansFichier(l.id)) manquantes.add(c);
  if (manquantes.size > 0) throw new Error(`Ces références n'ont pas encore leur image : ${[...manquantes].join(", ")}. Génère-les et valide-les (page des assets du projet ${projet.id}).`);
  let lancees = 0;
  for (const l of lignes) {
    const r = await lancerDemandeFichePlan(projet.id, l.uuid, { moteur: "h3ir" });
    if (r.ok) {
      lancees++;
      console.log(`  Fiche lancée : ${l.titre}`);
    } else console.log(`  ${l.titre} : ${r.erreur}`);
  }
  console.log(`\n${lancees}/${lignes.length} fiches en file. Le worker doit tourner (npm run worker) ; chaque compilation prend 1 à 2 min.`);
}

/** Met en file un APERÇU (0,4 MP, sans upscale, seed du plan = la même pour les 12) pour chaque plan de démo dont la fiche est faite. Le worker les prend dans l'ordre de création,
 * l'un après l'autre (GPU exclusif). Les plans déjà en file ou en cours sont sautés. */
async function rendus(): Promise<void> {
  const projet = await projetDemos();
  if (!projet) throw new Error("Projet de démos introuvable : lance d'abord `preparer`.");
  const lignes = (await plansDemos(projet.id)).filter((l) => l.cle && retenu(l.cle));
  const variante = drapeau("--variante");
  const fois = Math.max(1, Number(arg("--fois") ?? 1) || 1);
  let n = 0;
  for (const l of lignes) {
    if (l.statut === "brouillon") {
      console.log(`  ${l.titre} : pas de fiche (lance \`fiches\` d'abord)`);
      continue;
    }
    // Le statut « en_attente » d'un plan veut aussi dire « fiche prête, pas encore rendu » : c'est un job en file ou en cours qui compte.
    const [enFile] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.planId, l.id), inArray(jobs.statut, ["en_attente", "en_cours"]))).limit(1);
    if (enFile) {
      console.log(`  ${l.titre} : déjà en file ou en cours`);
      continue;
    }
    // `--variante` : une NOUVELLE seed (qui devient la seed du plan) ; `--fois N` en met N en file d'un coup. Sans cela, le même rendu serait refait.
    for (let i = 0; i < (variante ? fois : 1); i++) {
      await creerJobRelance(l.id, false, variante);
      n++;
      console.log(`  Aperçu en file : ${l.titre}${variante ? " (nouvelle seed)" : ""}`);
    }
  }
  console.log(`\n${n}/${lignes.length} aperçus en file (environ 3 min chacun). Le worker doit tourner. Suivi : \`etat\`.`);
}

async function rendu(planId: number, renduRetenuId: number | null) {
  if (renduRetenuId != null) {
    const [j] = await db.select().from(jobs).where(and(eq(jobs.id, renduRetenuId), isNotNull(jobs.cheminSortie)));
    if (j) return j;
  }
  const [j] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.planId, planId), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(1);
  return j ?? null;
}

async function etat(): Promise<void> {
  const projet = await projetDemos();
  if (!projet) return console.log("Projet de démos absent : lance `preparer`.");
  console.log(`Projet ${projet.id} · ${NOM_PROJET_DEMOS}\n`);
  for (const l of await plansDemos(projet.id)) {
    const sans = await refsSansFichier(l.id);
    const j = await rendu(l.id, l.renduRetenuId);
    const publie = l.cle ? existsSync(join(MEDIA_ROOT, cheminDemo(l.cle, "mp4"))) : false;
    console.log(`${(l.cle ?? "?").padEnd(26)} refs ${sans.length === 0 ? "ok " : "NON"} · fiche ${l.statut === "brouillon" ? "non" : "oui"} · rendu ${j ? `essai ${j.numeroRendu}` : "non"}${l.renduRetenuId ? " (retenu)" : ""} · publié ${publie ? "oui" : "non"}`);
  }
}

async function publier(): Promise<void> {
  const projet = await projetDemos();
  if (!projet) throw new Error("Projet de démos introuvable : lance d'abord `preparer`.");
  const dossier = join(MEDIA_ROOT, "mises-en-scene");
  await mkdir(dossier, { recursive: true });
  const manifestePath = join(dossier, "manifeste.json");
  const manifeste: Record<string, unknown> = existsSync(manifestePath) ? (JSON.parse(await readFile(manifestePath, "utf8")) as Record<string, unknown>) : {};
  const { ffmpeg } = binaires();
  const faites: string[] = [];
  const manquantes: string[] = [];
  for (const l of await plansDemos(projet.id)) {
    if (!l.cle || !retenu(l.cle)) continue;
    const j = await rendu(l.id, l.renduRetenuId);
    const source = j?.cheminSortie ? join(MEDIA_ROOT, j.cheminSortie) : null;
    if (!j || !source || !existsSync(source)) {
      manquantes.push(l.cle);
      continue;
    }
    const cible = join(MEDIA_ROOT, cheminDemo(l.cle, "mp4"));
    await mkdir(dirname(cible), { recursive: true });
    await copyFile(source, `${cible}.partiel`);
    await rename(`${cible}.partiel`, cible);
    // L'affiche : une image à 1 s (le tout premier instant est souvent noir), en WebP 768 px de large.
    try {
      const png = await executerProcessus(ffmpeg, ["-v", "error", "-ss", "1", "-i", source, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]);
      await sharp(png).resize({ width: 768 }).webp({ quality: 82 }).toFile(`${join(MEDIA_ROOT, cheminDemo(l.cle, "webp"))}.partiel`);
      await rename(`${join(MEDIA_ROOT, cheminDemo(l.cle, "webp"))}.partiel`, join(MEDIA_ROOT, cheminDemo(l.cle, "webp")));
    } catch (e) {
      console.log(`  ${l.cle} : affiche non extraite (${e instanceof Error ? e.message : String(e)}) — la vidéo est publiée sans affiche.`);
      await rm(`${join(MEDIA_ROOT, cheminDemo(l.cle, "webp"))}.partiel`, { force: true });
    }
    manifeste[l.cle] = { plan: l.uuid, titre: l.titre, essai: j.numeroRendu, job: j.id, seed: j.seedUtilisee ?? null, publieLe: new Date().toISOString() };
    faites.push(l.cle);
  }
  await writeFile(manifestePath, JSON.stringify(manifeste, null, 2));
  console.log(`Publiées (${faites.length}) : ${faites.join(", ") || "aucune"}`);
  const absentes = CLES_DEMOS.filter((c) => retenu(c) && !faites.includes(c) && !existsSync(join(MEDIA_ROOT, cheminDemo(c, "mp4"))));
  if (manquantes.length || absentes.length) console.log(`Sans rendu terminé : ${[...new Set([...manquantes, ...absentes])].join(", ")}`);
  console.log(`\nFichiers sous ${dossier}. En production, les copier sur le partage NFS (comme data/styles).`);
}

async function main() {
  if (COMMANDE === "preparer") await preparer();
  else if (COMMANDE === "fiches") await fiches();
  else if (COMMANDE === "publier") await publier();
  else if (COMMANDE === "etat") await etat();
  else if (COMMANDE === "rendus") await rendus();
  else console.log("Commandes : preparer [--forcer] | fiches [--seulement a,b] | rendus [--seulement a,b] | etat | publier [--seulement a,b]");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
