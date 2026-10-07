import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { agentConversations, agentRuns, assetGenerations, assets, briefs, projects } from "../../db/schema";
import { TYPE_AFFICHE, codeAffiche, formatAfficheParDefaut, promptAffiche } from "../affiches";
import { nouvelleSeed } from "../asset-generation";
import { motDuTon, styleDesImages } from "../conception";
import { lireConception } from "../conception-db";
import type { Db } from "./applicateurs/commun";
import { ficheCourante } from "./fiche-db";
import { creerRun } from "./runs";
import type { BriefContenu, PersonnageBrief } from "./types";

/** L'affiche du projet, au moment du clap. Elle est VRAIE : c'est l'affiche habituelle du projet (asset caché `AFFICHE_P<id>`, mêmes
 * générations ComfyUI, `posterFichier` du projet), pas une image de décor. Elle se prépare à l'arrivée sur le clap, pas avant, et ne se
 * refait que si ce qui la nourrit a changé (`signatureAffiche`) : l'histoire, le héros, les lieux, le genre, le ton, le style. Un titre
 * modifié ne la refait pas (le titre n'est pas dans l'image).
 *
 * Deux temps, portés par le worker : (1) une tâche du skill `prompt-affiche` (but « affiche ») écrit le prompt à partir de la fiche de
 * l'entretien ; (2) à son retour (`ecrireAfficheEtGenerer`, appelée par worker/agents/postTraitement.ts), la génération part dans la file
 * des images avec adoption automatique, et son résultat devient l'affiche du projet (lib/generation-adoption.ts). */

/** Ce qui nourrit l'affiche, lu dans la fiche de l'entretien, la conception et le style du projet. */
export type DonneesAffiche = {
  titre: string;
  /** L'histoire (l'arc contient la fin). */
  arc: string;
  /** Tous les personnages, tels que la fiche les décrit (le premier est le héros). */
  personnages: Pick<PersonnageBrief, "nom" | "age" | "apparence" | "gestuelle" | "reconnaissable">[];
  lieux: string;
  genres: string[];
  ton: number;
  /** Le prompt long du style (il change si le style change) et sa clause courte. */
  styleImage: string;
  clauseStyle: string;
};

const net = (s: unknown): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** Empreinte de ce qui nourrit l'affiche : quand elle change, l'affiche se refait ; sinon non. Le ton compte par son MOT (un curseur
 * qui bouge de trois points ne refait rien), le titre ne compte pas. */
export function signatureAffiche(d: Omit<DonneesAffiche, "titre" | "clauseStyle">): string {
  const canon = JSON.stringify({
    arc: net(d.arc),
    personnages: d.personnages.map((p) => [net(p.nom), net(p.age), net(p.apparence), net(p.gestuelle), net(p.reconnaissable)]),
    lieux: net(d.lieux),
    genres: [...d.genres].sort(),
    ton: motDuTon(d.ton),
    style: createHash("sha1").update(d.styleImage).digest("hex"),
  });
  return createHash("sha1").update(canon).digest("hex").slice(0, 16);
}

const decrire = (p: DonneesAffiche["personnages"][number]): string => [net(p.age), net(p.apparence), net(p.gestuelle) || net(p.reconnaissable)].filter(Boolean).join(", ");

/** L'entrée du skill `prompt-affiche` pour l'affiche du clap. Les images de personnages n'existent pas encore : c'est une génération par
 * le texte, le héros est décrit par sa fiche. */
export function entreeAfficheClap(d: DonneesAffiche): Record<string, unknown> {
  const [heros] = d.personnages;
  const autres = d.personnages.slice(1).map((p) => `${net(p.nom)} : ${decrire(p)}`).filter((x) => x.length > 3);
  return {
    cible: "projet",
    titre: d.titre,
    resume: [d.arc, d.lieux ? `Lieux : ${d.lieux}` : "", autres.length ? `Autres personnages : ${autres.join(" ; ")}` : ""].map(net).filter(Boolean).join("\n"),
    genreTon: `${d.genres.join(" + ")}, ton ${motDuTon(d.ton)}`,
    clauseStyleDuProjet: d.clauseStyle,
    titreDansImage: false,
    promptActuel: "",
    personnagePrincipal: heros ? { code: "HERO", nom: net(heros.nom), description: decrire(heros), imageDisponible: false } : null,
    consigne: "Poster written at the end of the design interview: no character image exists yet, so write a text-only generation (method `generation`, no sources). The summary is the whole story: choose one striking moment.",
  };
}

/** Lit ce qui nourrit l'affiche : la conception, le style du brief et la fiche de l'entretien. Null tant que l'histoire n'est pas dite. */
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
  return {
    titre: projet.nom === "Sans titre" ? "" : projet.nom,
    arc,
    personnages,
    lieux,
    genres: conception.genres,
    ton: conception.ton,
    styleImage: styleDesImages({ clauseStyle: projet.clauseStyle, stylePromptImage: projet.stylePromptImage }) || style?.clause || "",
    clauseStyle: projet.clauseStyle,
  };
}

export type EtatAfficheClap = "a_lancer" | "en_cours" | "prete" | "echec";

/** Où en est l'affiche pour CETTE empreinte : à lancer (aucune tâche pour elle), en cours (prompt ou image), prête, ou échouée. Une
 * empreinte déjà tentée et échouée ne se relance pas toute seule (pas de boucle) : « Réessayer » passe par `relancerAfficheClap`. */
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

/** Crée l'asset d'affiche du projet s'il n'existe pas (le même que « Affiche » de la page du projet), et rend son identifiant. */
export async function assurerAssetAffiche(db: Db, projectId: number, d: Pick<DonneesAffiche, "titre" | "arc" | "genres" | "ton">): Promise<number> {
  const code = codeAffiche("projects", projectId);
  const [existant] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, code)));
  if (existant) return existant.id;
  await db
    .insert(assets)
    .values({
      projectId,
      code,
      type: TYPE_AFFICHE,
      statut: "a_produire",
      description: `Affiche : ${d.titre || "projet"}`,
      promptGeneration: promptAffiche({ cible: "projects", titre: d.titre, resume: d.arc, genreTon: `${d.genres.join(" + ")}, ${motDuTon(d.ton)}` }),
    })
    .onConflictDoNothing();
  const [cree] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, code)));
  return cree!.id;
}

/** Lance l'écriture du prompt de l'affiche pour cette empreinte (et annule une tâche d'affiche encore en attente, devenue inutile). */
export async function lancerAfficheClap(db: Db, projectId: number, d: DonneesAffiche, signature: string): Promise<void> {
  await assurerAssetAffiche(db, projectId, d);
  await db.update(agentRuns).set({ statut: "annulee", finishedAt: new Date() }).where(and(eq(agentRuns.projectId, projectId), eq(agentRuns.but, "affiche"), eq(agentRuns.statut, "en_attente")));
  await creerRun(db, { skill: "prompt-affiche", entree: entreeAfficheClap(d), but: "affiche", projectId, conversationId: null, options: { signature } });
}

/** Retour du skill (appelée par le worker, dans sa transaction) : le prompt devient celui de l'affiche, et la génération part dans la file des
 * images, adoptée toute seule (c'est elle l'affiche du projet). Même demande que `lancerGeneration` pour une affiche : 2:3, mode texte. */
export async function ecrireAfficheEtGenerer(db: Db, projectId: number, sortie: { promptGeneration?: unknown }): Promise<void> {
  const prompt = typeof sortie.promptGeneration === "string" ? sortie.promptGeneration.trim() : "";
  if (!prompt) throw new Error("Le prompt de l'affiche est vide.");
  const [asset] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, codeAffiche("projects", projectId))));
  if (!asset) throw new Error("L'asset d'affiche du projet n'existe pas.");
  const [projet] = await db.select({ clauseStyle: projects.clauseStyle, stylePromptImage: projects.stylePromptImage }).from(projects).where(eq(projects.id, projectId));
  const format = formatAfficheParDefaut();
  await db.update(assets).set({ promptGeneration: prompt }).where(eq(assets.id, asset.id));
  await db.insert(assetGenerations).values({
    assetId: asset.id,
    methode: "generation",
    prompt,
    clauseStyle: styleDesImages(projet),
    aspect: format.aspect,
    megapixels: format.megapixels,
    loraPersonnage: false,
    lightning: null,
    seed: nouvelleSeed(),
    adoptionAuto: true,
  });
}
