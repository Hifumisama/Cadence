import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { agentConversations, agentRuns, assetGenerationSources, assetGenerations, assets, briefs, projects } from "../../db/schema";
import { TYPE_AFFICHE, avecTitreDansImage, codeAffiche, formatAfficheParDefaut, promptAffiche } from "../posters/posters";
import { nouvelleSeed } from "../assets/asset-generation";
import { VARIANTE_AFFICHE } from "../llm/variants";
import { styleDesEditions, styleDesImages } from "../projects/design";
import { lirePersonnagePrincipal } from "./poster";
import { lireConception } from "../projects/design-db";
import type { Db } from "./appliers/common";
import { ficheCourante } from "./sheet-db";
import { creerRun } from "./runs";
import type { BriefContenu, PersonnageBrief } from "./types";

/** The project's poster, at the time of the clap. It is REAL: it is the project's usual poster (hidden asset `AFFICHE_P<id>`, same
 * ComfyUI generations, the project's `posterFichier`), not a set image. It is prepared when the clap is reached, not before, and is only
 * redone if what feeds it has changed (`signatureAffiche`): the story, the hero, the places, the genre, the tone, the style, and the title (it
 * is WRITTEN into the image, as lettering built into the composition: a title corrected at the clap therefore redoes the poster).
 *
 * Two steps, carried by the worker: (1) a task of the `prompt-asset` skill, `affiche` variant (purpose "affiche") writes the prompt from the interview
 * sheet; (2) on its return (`ecrireAfficheEtGenerer`, called by worker/agents/postProcessing.ts), the generation goes into the image queue
 * with automatic adoption, and its result becomes the project's poster (lib/assets/generation-adoption.ts). */

/** What feeds the poster, read from the interview sheet, the design and the project's style. */
export type DonneesAffiche = {
  titre: string;
  /** The story (the arc contains the ending). */
  arc: string;
  /** All the characters, as the sheet describes them (the first is the hero). */
  personnages: Pick<PersonnageBrief, "nom" | "age" | "apparence" | "gestuelle" | "reconnaissable">[];
  lieux: string;
  genres: string[];
  /** The style's long prompt (it changes if the style changes) and its short clause. */
  styleImage: string;
  clauseStyle: string;
  /** The hero's registry asset (main look, never a state), once it exists; `aImage` once its image is there. The poster WAITS for it
   * (decision 2026-11-17, cartography of project 259: a poster drawn from text showed a third woman, in the final state). */
  heros?: { id: number; code: string; nom: string; description: string; fichier: string | null; aImage: boolean } | null;
};

/** The poster waits for the hero's image: the story has characters, but the hero's image is not there yet. Without any character, the
 * poster is abstract and goes at once. Pure. */
export function afficheAttendLeHeros(d: Pick<DonneesAffiche, "personnages" | "heros">): boolean {
  return d.personnages.length > 0 && !d.heros?.aImage;
}

const TITRES_PROVISOIRES = new Set(["", "sans titre", "projet", "untitled"]);

const net = (s: unknown): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** Fingerprint of what feeds the poster: when it changes, the poster is redone; otherwise not. The title counts (it is in the image). */
export function signatureAffiche(d: Omit<DonneesAffiche, "clauseStyle">): string {
  const canon = JSON.stringify({
    titre: net(d.titre),
    arc: net(d.arc),
    personnages: d.personnages.map((p) => [net(p.nom), net(p.age), net(p.apparence), net(p.gestuelle), net(p.reconnaissable)]),
    lieux: net(d.lieux),
    genres: [...d.genres].sort(),
    style: createHash("sha1").update(d.styleImage).digest("hex"),
    // The hero's image counts: when it arrives (or is replaced), the poster is made from it.
    heros: d.heros?.aImage ? `${d.heros.code}:${d.heros.fichier ?? ""}` : null,
  });
  return createHash("sha1").update(canon).digest("hex").slice(0, 16);
}

const decrire = (p: DonneesAffiche["personnages"][number]): string => [net(p.age), net(p.apparence), net(p.gestuelle) || net(p.reconnaissable)].filter(Boolean).join(", ");

/** The poster template, the same for every project (cartography of project 259: no fixed composition, the title missing). */
export const GABARIT_AFFICHE =
  "Composition: one single main subject in a medium shot, filling the middle of the vertical frame; the story's main place behind; a calm, dark, uncluttered band across the bottom quarter.";

/** The `prompt-asset` skill input (`affiche` variant) for the project's poster. Two cases only: the hero's image exists (an edit from it, the
 * hero in their main look), or the story has no character (an abstract poster from text). With characters but no hero image yet, the poster
 * waits (`afficheAttendLeHeros`): it is not launched. */
export function entreeAfficheClap(d: DonneesAffiche): Record<string, unknown> {
  const autres = d.personnages.slice(1).map((p) => `${net(p.nom)} : ${decrire(p)}`).filter((x) => x.length > 3);
  const [premier] = d.personnages;
  const heros = d.heros?.aImage ? d.heros : null;
  const consigne = heros
    ? `The main character's image is image 2: paint the poster from it, with the character in exactly this look (this face, this outfit, these colours), never a later state of the story. Choose the moment of the story where they look like this. ${GABARIT_AFFICHE}`
    : `This story has no character: make an abstract poster, without any person or silhouette: the main place, an element or a material of the story, in the tone. ${GABARIT_AFFICHE}`;
  return {
    cible: "projet",
    titre: d.titre,
    resume: [d.arc, d.lieux ? `Lieux : ${d.lieux}` : "", autres.length ? `Autres personnages : ${autres.join(" ; ")}` : ""].map(net).filter(Boolean).join("\n"),
    genreTon: d.genres.join(" + "),
    clauseStyleDuProjet: d.clauseStyle,
    // The title is written into the image ("Title lettering" line added by the skill, and re-applied by the code on return) as long as it exists.
    titreDansImage: net(d.titre) !== "",
    promptActuel: "",
    personnagePrincipal: heros
      ? { code: heros.code, nom: net(premier?.nom) || heros.nom, description: heros.description || (premier ? decrire(premier) : ""), imageDisponible: true }
      : null,
    consigne,
  };
}

/** The title written on the poster. The project's name is authoritative once the user has set it; otherwise ("Sans titre" until the interview concludes), the title the AI
 * proposed: the brief's (even unvalidated, the poster is provisional), failing that the interview sheet's. A provisional title ("Sans titre"…) does not count. Pure. */
export function titreDeLAffiche(sources: { nom: unknown; titreBrief: unknown; titreFiche: unknown }): string {
  for (const brut of [sources.nom, sources.titreBrief, sources.titreFiche]) {
    const t = net(brut);
    if (t && !TITRES_PROVISOIRES.has(t.toLowerCase())) return t;
  }
  return "";
}

/** Reads what feeds the poster: the design, the brief's style and the interview sheet. Null as long as the story is not told. */
export async function donneesAffiche(db: Db, projectId: number): Promise<DonneesAffiche | null> {
  const conception = await lireConception(db, projectId);
  const [projet] = await db.select({ nom: projects.nom, clauseStyle: projects.clauseStyle, stylePromptImage: projects.stylePromptImage }).from(projects).where(eq(projects.id, projectId));
  const [conv] = await db.select().from(agentConversations).where(and(eq(agentConversations.projectId, projectId), eq(agentConversations.portee, "projet")));
  if (!conception || !projet || !conv) return null;
  const fiche = await ficheCourante(db, conv);
  const c = fiche.contenu as { arc?: unknown; lieux?: unknown; personnages?: unknown };
  const arc = net(c.arc);
  if (!arc) return null;
  const personnages = (Array.isArray(c.personnages) ? c.personnages : []).filter((p): p is PersonnageBrief => !!p && typeof (p as PersonnageBrief).nom === "string");
  const lieux = (Array.isArray(c.lieux) ? c.lieux : []).map((l) => net((l as { nom?: unknown }).nom)).filter(Boolean).join(", ");
  const [b] = await db.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  const style = (b?.contenu as BriefContenu | undefined)?.style;
  const titre = titreDeLAffiche({ nom: projet.nom, titreBrief: (b?.contenu as { titre?: unknown } | undefined)?.titre, titreFiche: (fiche.contenu as { titre?: unknown }).titre });
  const principal = personnages.length > 0 ? await lirePersonnagePrincipal(db, projectId) : null;
  return {
    titre,
    arc,
    personnages,
    lieux,
    genres: conception.genres,
    styleImage: styleDesImages({ clauseStyle: projet.clauseStyle, stylePromptImage: projet.stylePromptImage }) || style?.clause || "",
    clauseStyle: projet.clauseStyle,
    heros: principal ? { id: principal.id, code: principal.code, nom: principal.nom, description: principal.description, fichier: principal.fichier, aImage: principal.aImage } : null,
  };
}

/** `attend_heros`: the story has characters and the hero's image is not there yet (the poster will be made from it, see `relancerAfficheApresHeros`). */
export type EtatAfficheClap = "a_lancer" | "en_cours" | "prete" | "echec" | "attend_heros";

/** Where the poster stands for THIS fingerprint: to launch (no task for it), in progress (prompt or image), ready, or failed. A
 * fingerprint already tried and failed is not relaunched on its own (no loop): "Réessayer" goes through `relancerAfficheClap`. */
export async function etatAfficheClap(db: Db, projectId: number, signature: string): Promise<EtatAfficheClap> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.projectId, projectId), eq(agentRuns.but, "affiche")))
    .orderBy(desc(agentRuns.id))
    .limit(1);
  if (!run || (run.options as { signature?: string } | null)?.signature !== signature) return "a_lancer";
  if (run.statut === "en_attente" || run.statut === "en_cours") return "en_cours";
  if (run.statut !== "termine") return "echec";
  const [asset] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, codeAffiche("projects", projectId))));
  if (!asset) return "echec";
  const [gen] = await db.select({ statut: assetGenerations.statut, createdAt: assetGenerations.createdAt }).from(assetGenerations).where(eq(assetGenerations.assetId, asset.id)).orderBy(desc(assetGenerations.id)).limit(1);
  if (!gen || gen.createdAt < run.createdAt) return "en_cours";
  if (gen.statut === "termine") return "prete";
  return gen.statut === "echoue" ? "echec" : "en_cours";
}

/** Creates the project's poster asset if it does not exist (the same as "Affiche" on the project page), and returns its identifier. */
async function assurerAssetAffiche(db: Db, projectId: number, d: Pick<DonneesAffiche, "titre" | "arc" | "genres">): Promise<number> {
  const code = codeAffiche("projects", projectId);
  const [existant] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, code)));
  if (existant) return existant.id;
  await db
    .insert(assets)
    .values({
      projectId,
      code,
      type: TYPE_AFFICHE,
      description: `Affiche : ${d.titre || "projet"}`,
      promptGeneration: promptAffiche({ cible: "projects", titre: d.titre, resume: d.arc, genreTon: d.genres.join(" + "), titreDansImage: net(d.titre) !== "" }),
    })
    .onConflictDoNothing();
  const [cree] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, code)));
  return cree!.id;
}

/** Launches the writing of the poster's prompt for this fingerprint (and cancels a poster task still pending, now useless). */
export async function lancerAfficheClap(db: Db, projectId: number, d: DonneesAffiche, signature: string): Promise<void> {
  await assurerAssetAffiche(db, projectId, d);
  await db.update(agentRuns).set({ statut: "annulee", finishedAt: new Date() }).where(and(eq(agentRuns.projectId, projectId), eq(agentRuns.but, "affiche"), eq(agentRuns.statut, "en_attente")));
  await creerRun(db, { skill: "prompt-asset", entree: entreeAfficheClap(d), but: "affiche", projectId, conversationId: null, options: { signature, variante: VARIANTE_AFFICHE } });
}

/** When the hero's image is adopted (lib/assets/generation-adoption.ts): if the poster was waiting for it, or was made without it, it is
 * made now, from that image. Nothing happens before the clap (no story yet), for another character, or when the poster already comes
 * from this very image (same fingerprint). Returns whether a poster task was launched. */
export async function relancerAfficheApresHeros(db: Db, projectId: number, assetId: number): Promise<boolean> {
  const d = await donneesAffiche(db, projectId);
  if (!d?.heros?.aImage || d.heros.id !== assetId) return false;
  const signature = signatureAffiche(d);
  if ((await etatAfficheClap(db, projectId, signature)) !== "a_lancer") return false;
  await lancerAfficheClap(db, projectId, d, signature);
  return true;
}

/** Skill return (called by the worker, in its transaction): the prompt becomes the poster's, and the generation goes into the image queue,
 * adopted automatically (it is the project's poster). Same request as `lancerGeneration` for a poster: 2:3. In `edition` with the hero's
 * image, the hero is the only source (the worker puts the empty 2:3 canvas as image 1, worker/images.ts `sourcesEdition`); otherwise text mode. */
export async function ecrireAfficheEtGenerer(db: Db, projectId: number, sortie: { promptGeneration?: unknown; methode?: unknown }): Promise<void> {
  const promptModele = typeof sortie.promptGeneration === "string" ? sortie.promptGeneration.trim() : "";
  if (!promptModele) throw new Error("Le prompt de l'affiche est vide.");
  const [asset] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, codeAffiche("projects", projectId))));
  if (!asset) throw new Error("L'asset d'affiche du projet n'existe pas.");
  const [projet] = await db.select({ nom: projects.nom, clauseStyle: projects.clauseStyle, stylePromptImage: projects.stylePromptImage }).from(projects).where(eq(projects.id, projectId));
  const format = formatAfficheParDefaut();
  // The title is set by the code, word for word: the model neither rewrites nor translates it (see `avecTitreDansImage`). We read the same one
  // that fed the poster (the sheet's title when the project's name is still provisional).
  const nom = net(projet?.nom);
  const d = await donneesAffiche(db, projectId);
  const titre = d?.titre ?? (TITRES_PROVISOIRES.has(nom.toLowerCase()) ? "" : nom);
  const prompt = titre ? avecTitreDansImage(promptModele, titre, true) : avecTitreDansImage(promptModele, "", false);
  const heros = d?.heros?.aImage && d.heros.fichier ? d.heros : null;
  const edition = sortie.methode === "edition" && heros != null;
  await db.update(assets).set({ promptGeneration: prompt, methodeGeneration: edition ? "edition" : "generation" }).where(eq(assets.id, asset.id));
  const [gen] = await db
    .insert(assetGenerations)
    .values({
      assetId: asset.id,
      methode: edition ? "edition" : "generation",
      prompt,
      // Same snapshot as lib/assets/generation-launch.ts: the long style prompt in text mode, the short clause in an edit (the edit follows image 1).
      clauseStyle: edition ? styleDesEditions(projet) : styleDesImages(projet),
      ...(edition ? {} : { aspect: format.aspect, megapixels: format.megapixels }),
      lightning: edition ? true : null,
      seed: nouvelleSeed(),
      adoptionAuto: true,
    })
    .returning({ id: assetGenerations.id });
  if (edition) await db.insert(assetGenerationSources).values({ generationId: gen!.id, position: 1, origine: "asset", assetId: heros.id, fichier: heros.fichier! });
}
