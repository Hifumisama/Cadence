import "dotenv/config";
import { readFile } from "node:fs/promises";
import { db } from "../db";
import { assets, scenes, planDialogues, planPromptSections, planRefs, plans } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getDefaultEpisodeId, getDefaultProjectId } from "../lib/queries";
import { decouperSections, ORDRE_SECTIONS } from "../lib/prompt";

/**
 * Import one-shot depuis les markdown existants vers Postgres — voir le plan
 * d'implémentation, section "Script d'import". OUTIL JETABLE : sert une
 * seule fois à peupler la base au démarrage de Cadence, n'est pas maintenu
 * en fonctionnalité. Best-effort sur un format markdown rédigé pour des
 * humains, pas pour un parseur — VÉRIFIER LE RÉSULTAT plan par plan après
 * exécution (docs/REGISTRE_ASSETS.md et docs/FICHE_DE_PLAN_S01_maya.md
 * restent la référence en cas de doute, jusqu'à suppression).
 *
 * Idempotent : peut être relancé, les codes/numéros existants sont ignorés.
 */

const ROOT = new URL("../docs/", import.meta.url);

// "Figurants" n'est pas un type à part : ce sont des personnages (retour
// utilisateur 2026-09-27). Le type reste un tag informatif de toute façon,
// le regroupement du registre se fait sur deriveDeId, pas sur ce champ.
const TYPE_PAR_SECTION: Record<string, string> = {
  "Personnages": "personnage",
  "Voix": "voix",
  "Effets visuels": "vfx",
  "Décors": "decor",
  "Figurants": "personnage",
  "Références contextuelles": "keyframe",
};

const STATUT_ASSET: Record<string, "a_produire" | "en_cours" | "valide"> = {
  "⬜": "a_produire",
  "🟡": "en_cours",
  "✅": "valide",
};

async function importerAssets(projectId: number) {
  // CRLF dans le fichier original — sans normalisation, "^## (.+)$" ne
  // matche jamais (le \r final bloque l'ancre $), et sectionCourante reste
  // vide : bug latent depuis le tout premier import, invisible tant que
  // l'UI n'affichait pas le type.
  const texte = (await readFile(new URL("REGISTRE_ASSETS.md", ROOT), "utf-8")).replace(/\r\n/g, "\n");
  const lignes = texte.split("\n");

  let sectionCourante = "";
  let n = 0;
  const parentsAResoudre: { code: string; parentCode: string }[] = [];

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i] ?? "";

    const h2 = ligne.match(/^## (.+)$/);
    if (h2) {
      const titre = (h2[1] ?? "").split("—")[0]?.trim() ?? "";
      sectionCourante = Object.keys(TYPE_PAR_SECTION).find((k) => titre.startsWith(k)) ?? sectionCourante;
      continue;
    }

    const h3 = ligne.match(/^### `([A-Za-z0-9_]+)`/);
    const code = h3?.[1];
    if (!code) continue;

    const bloc = lignes.slice(i + 1, i + 12).join("\n");

    const statutMatch = bloc.match(/\*\*Statut\*\*\s*:\s*([⬜🟡✅])/);
    const critiqueMatch = bloc.match(/\*\*Critique\*\*\s*:\s*(oui|non)/);
    const fichierMatch = bloc.match(/\*\*Fichier\*\*\s*:\s*`([^`]+)`/);
    const descriptionMatch = bloc.match(/\*\*Description canonique\*\*\s*:\s*(.+)/);
    const deriveDeMatch = bloc.match(/\*\*Dérivé de\*\*\s*:\s*`([A-Za-z0-9_]+)`/);

    const type = TYPE_PAR_SECTION[sectionCourante] ?? "oth";
    const clefStatut = statutMatch?.[1];
    const statut = clefStatut ? STATUT_ASSET[clefStatut] ?? "a_produire" : "a_produire";

    const [existant] = await db.select().from(assets).where(eq(assets.code, code)).limit(1);
    if (existant) {
      // Ligne déjà importée (import précédent) : on ne réécrit pas
      // statut/description/critique (potentiellement édités depuis l'app),
      // mais le type et le rattachement au master viennent toujours du
      // registre — c'est de la structure, pas du contenu éditable.
      if (existant.type !== type) {
        await db.update(assets).set({ type }).where(eq(assets.id, existant.id));
      }
      if (deriveDeMatch?.[1] && existant.deriveDeId == null) {
        parentsAResoudre.push({ code, parentCode: deriveDeMatch[1] });
      }
      continue;
    }

    await db.insert(assets).values({
      projectId,
      code,
      type,
      statut,
      description: descriptionMatch?.[1]?.trim() ?? null,
      fichier: fichierMatch?.[1] ?? null,
      critique: critiqueMatch?.[1] === "oui",
    });
    if (deriveDeMatch?.[1]) parentsAResoudre.push({ code, parentCode: deriveDeMatch[1] });
    n++;
  }

  // Résolution des parents en deuxième passe : un master peut être listé
  // après son dérivé dans le markdown, on ne peut pas compter sur l'ordre.
  for (const { code, parentCode } of parentsAResoudre) {
    const [enfant] = await db.select().from(assets).where(eq(assets.code, code)).limit(1);
    const [parent] = await db.select().from(assets).where(eq(assets.code, parentCode)).limit(1);
    if (!enfant || !parent) continue;
    await db.update(assets).set({ deriveDeId: parent.id }).where(eq(assets.id, enfant.id));
  }

  console.log(`[import] ${n} assets importés depuis REGISTRE_ASSETS.md`);
}

function parserNumerosSource(brut: string): number[] {
  return brut.split("+").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
}

function parserTableSimple(bloc: string): Record<string, string>[] {
  const lignes = bloc.trim().split("\n").filter((l) => l.startsWith("|"));
  if (lignes.length < 2) return [];
  const entetes = (lignes[0] ?? "").split("|").map((c) => c.trim()).filter(Boolean);
  return lignes.slice(2).map((ligne) => {
    const valeurs = ligne.split("|").map((c) => c.trim()).filter((_, idx) => idx > 0);
    const row: Record<string, string> = {};
    entetes.forEach((h, idx) => {
      row[h] = valeurs[idx] ?? "";
    });
    return row;
  });
}

async function importerPlans(projectId: number, episodeId: number) {
  // Même bug latent CRLF que REGISTRE_ASSETS.md : sans normalisation, les
  // regex qui ancrent "\n" juste avant un motif (ex. "section:\n...")
  // échouent silencieusement — les sections de prompt restaient vides.
  const texte = (await readFile(new URL("FICHE_DE_PLAN_S01_maya.md", ROOT), "utf-8")).replace(
    /\r\n/g,
    "\n",
  );

  // Découpe par shot — un shot = un appel H3 = un plan de la table `plans`.
  const blocsShot = texte.split(/\n## SHOT \d+ — /).slice(1);

  let n = 0;
  let rafraichis = 0;
  for (const bloc of blocsShot) {
    const entete = bloc.match(/^PLAN ([\w+]+)(?: \(fusion [\w+]+\))? — \*(.+?)\*/);
    const numerosSourceBrut = entete?.[1];
    const titre = entete?.[2];
    if (!numerosSourceBrut || !titre) continue;

    const numerosSource = parserNumerosSource(numerosSourceBrut);
    const numero = numerosSource[0];
    if (numero === undefined) continue;

    const ligneTable = bloc.match(/\| \d+ s \|.+\|/);
    const cellules = ligneTable ? ligneTable[0].split("|").map((c) => c.trim()).filter(Boolean) : [];
    const [dureeMontage, dureeGeneration, fps, mode, timecode] = cellules;

    const blocRefs = bloc.match(/\*\*Références[^*]*\*\*\n((?:\|.*\n)+)/);
    const refsTable = blocRefs?.[1] ? parserTableSimple(blocRefs[1]) : [];

    const blocDialogue = bloc.match(/\*\*Dialogue\*\*[^\n]*\n((?:\|.*\n)+)/);
    const dialogueTable = blocDialogue?.[1] ? parserTableSimple(blocDialogue[1]) : [];

    const blocPrompt = bloc.match(/\*\*Prompt\*\*\n```text\n([\s\S]+?)\n```/);
    const promptBrut = blocPrompt?.[1] ?? "";

    const [existant] = await db.select().from(plans).where(and(eq(plans.episodeId, episodeId), sql`${plans.numerosSource}[1] = ${numero}`)).limit(1);

    let planInsere = existant;
    if (existant) {
      // Plan déjà importé (import précédent, possiblement buggé sur le
      // parsing CRLF) : on rafraîchit le contenu dérivé de la fiche
      // (sections/refs/dialogue), jamais le statut ni les champs déjà
      // édités depuis l'app (fps, durée de génération, seed...).
      await db.delete(planPromptSections).where(eq(planPromptSections.planId, existant.id));
      await db.delete(planRefs).where(eq(planRefs.planId, existant.id));
      await db.delete(planDialogues).where(eq(planDialogues.planId, existant.id));
    } else {
      [planInsere] = await db
        .insert(plans)
        .values({
          projectId,
          episodeId,
          ordre: numero,
          numerosSource,
          titre,
          dureeMontageSecondes: parseInt(dureeMontage ?? "0", 10) || 0,
          dureeGenerationSecondes: parseInt(dureeGeneration ?? "0", 10) || 0,
          fps: parseInt(fps ?? "24", 10) || 24,
          mode: mode ?? "full-reference",
          timecodeMusique: timecode || null,
          // Ces plans viennent de la fiche de plan déjà rédigée (prompt,
          // refs, dialogue) — pas du statut par défaut "brouillon" des plans
          // nés du scénario sans fiche de plan encore écrite.
          statut: "en_attente",
        })
        .returning();
    }

    if (!planInsere) continue;

    // Prompt découpé par section — logique partagée avec le collage depuis
    // l'interface (lib/prompt.ts), pour ne pas diverger sur le format H3.
    const sections = decouperSections(promptBrut);
    for (const [idx, section] of ORDRE_SECTIONS.entries()) {
      await db.insert(planPromptSections).values({
        planId: planInsere.id,
        section,
        ordre: idx,
        contenu: sections[section],
      });
    }

    // Références image/vidéo — label du type `<Picture N>` / `<Video N>`.
    for (const ligne of refsTable) {
      const label = ligne["Label"] ?? "";
      const labelMatch = label.match(/<(Picture|Video)\s+(\d+)>/);
      const typeLabel = labelMatch?.[1];
      const slotLabel = labelMatch?.[2];
      if (!typeLabel || !slotLabel) continue;

      const assetCode = (ligne["Asset"] ?? "").replace(/`/g, "");
      const [assetRow] = await db.select().from(assets).where(eq(assets.code, assetCode)).limit(1);
      await db.insert(planRefs).values({
        planId: planInsere.id,
        type: typeLabel.toLowerCase() === "picture" ? "picture" : "video",
        slot: Number(slotLabel),
        assetId: assetRow?.id,
        role: ligne["Rôle dans le plan"] || null,
      });
    }

    // Dialogue — colonnes attendues : # | Locuteur | Asset voix | Réplique | Durée.
    for (const ligne of dialogueTable) {
      const slotMatch = (ligne["#"] ?? "").match(/\d+/);
      const dureeMatch = (ligne["Durée"] ?? "").match(/[\d.]+/);
      const assetCode = (ligne["Asset voix"] ?? "").replace(/`/g, "");
      const [assetRow] = assetCode
        ? await db.select().from(assets).where(eq(assets.code, assetCode)).limit(1)
        : [];
      await db.insert(planDialogues).values({
        planId: planInsere.id,
        slot: slotMatch ? Number(slotMatch[0]) : 1,
        locuteur: ligne["Locuteur"] ?? "",
        assetVoixId: assetRow?.id,
        replique: ligne["Réplique (verbatim)"] ?? ligne["Réplique"] ?? "",
        dureeSecondes: dureeMatch ? Math.round(parseFloat(dureeMatch[0])) : null,
      });
    }

    if (existant) rafraichis++;
    else n++;
  }

  console.log(
    `[import] ${n} plans importés, ${rafraichis} rafraîchis (sections/refs/dialogue) depuis FICHE_DE_PLAN_S01_maya.md`,
  );
}

const CHAMPS_SCENARIO = [
  "Valeur",
  "Sujet",
  "Décor",
  "Lumière",
  "Mouvement",
  "Son",
  "Intention",
  "Assets req.",
] as const;

function parserBlocScenario(bloc: string): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const champ of CHAMPS_SCENARIO) {
    const regex = new RegExp(`^${champ.replace(".", "\\.")}\\s*:\\s*(.+)$`, "m");
    const match = bloc.match(regex);
    if (match?.[1]) resultat[champ] = match[1].trim();
  }
  return resultat;
}

/** Découpage narratif (skill `scenario`) : structure en scènes (ex-mouvements) +
 * description (Sujet + Intention) par plan.
 * Vient compléter les plans déjà créés par importerPlans() — best-effort,
 * un plan fusionné (ex. 20 absorbé dans 10) n'a pas de ligne propre et son
 * bloc scénario est donc ignoré silencieusement. */
async function importerScenario(episodeId: number) {
  // Fichier original de l'utilisateur, en CRLF — normalisé pour que les
  // regex multi-lignes (fences ``` ) matchent correctement.
  const texte = (await readFile(new URL("S01_maya.md", ROOT), "utf-8")).replace(/\r\n/g, "\n");

  const scenesExistantes = await db.select().from(scenes);
  const rangesScenes: { id: number; debut: number; fin: number }[] = [];

  if (scenesExistantes.length === 0) {
    const ligneScene = /\|\s*\*\*([IVX]+)\.\s*([^*]+)\*\*\s*\|\s*(\d+)\s*→\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|/g;
    let ordre = 0;
    for (const m of texte.matchAll(ligneScene)) {
      const titre = m[2]?.trim();
      const debut = Number(m[3]);
      const fin = Number(m[4]);
      const fonction = m[6]?.trim();
      if (!titre || Number.isNaN(debut) || Number.isNaN(fin)) continue;
      const [inserted] = await db
        .insert(scenes)
        .values({
          episodeId,
          ordre: ordre++,
          titre,
          fonction: fonction || null,
        })
        .returning();
      if (inserted) rangesScenes.push({ id: inserted.id, debut, fin });
    }
    console.log(`[import] ${rangesScenes.length} scènes importées depuis S01_maya.md`);
  } else {
    // Scènes déjà en base : leurs plans y sont déjà rattachés, rien à rejouer
    // (la plage de numéros n'est plus stockée, elle se déduit des plans).
  }

  const blocsPlan = texte.matchAll(/^## PLAN (\d+)\s*—.*\n```\n([\s\S]+?)\n```/gm);
  let n = 0;
  for (const m of blocsPlan) {
    const numero = Number(m[1]);
    const bloc = m[2] ?? "";
    if (Number.isNaN(numero)) continue;

    const [planExistant] = await db.select().from(plans).where(and(eq(plans.episodeId, episodeId), sql`${plans.numerosSource}[1] = ${numero}`)).limit(1);
    if (!planExistant) continue;

    const champs = parserBlocScenario(bloc);
    const sceneTrouvee = rangesScenes.find((r) => numero >= r.debut && numero <= r.fin);

    await db
      .update(plans)
      .set({
        description: [champs["Sujet"], champs["Intention"]].filter(Boolean).join("\n\n") || null,
        sceneId: sceneTrouvee?.id ?? planExistant.sceneId,
      })
      .where(eq(plans.id, planExistant.id));
    n++;
  }

  console.log(`[import] ${n} plans complétés avec leurs champs scénario depuis S01_maya.md`);
}

/** Les plans brouillon (nés du scénario, pas encore développés en fiche de
 * plan) n'existent pas encore dans ce jeu de données d'exemple — tous les
 * plans de S01_maya.md ont déjà leur fiche de plan complète. Rien à faire
 * ici : le statut par défaut "brouillon" du schéma ne sert que pour les
 * plans créés à la main depuis /scenario après cet import. */

// Rattache l'import au projet/épisode par défaut (2026-09-28) — voir
// db/migrations/0007_projets_saisons_episodes.sql pour le bootstrap "Les
// Yeux de Rubis" créé au moment où projets/saisons/épisodes ont été
// introduits. Un relancer sur une base sans aucun projet échouera
// explicitement plutôt que d'insérer des lignes orphelines.
const projectId = await getDefaultProjectId();
const episodeId = await getDefaultEpisodeId();

await importerAssets(projectId);
await importerPlans(projectId, episodeId);
await importerScenario(episodeId);
console.log("[import] Terminé — vérifier le résultat plan par plan dans /plans.");
process.exit(0);
