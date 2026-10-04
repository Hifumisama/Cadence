"use server";

import { db } from "@/db";
import { assets, episodes, planDialogues, planPromptSections, planRefs, plans, repliques, seasons, voixFiches } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminRepliqueMedia, estAudio } from "@/lib/media";
import { MAX_REFS, prochainSlotAudioLibre } from "@/lib/plan-checks";
import {
  ajouterBalise,
  corrigerBalise,
  decoderLocuteur,
  estStatutReplique,
  langueBalise,
  mesurerDureeAudio,
  priseObsolete,
} from "@/lib/repliques";
import { getDialoguesPlan } from "@/lib/queries-repliques";

// Répliques autonomes (docs/FRICTIONS.md F02, révision 2026-09-30). Une
// réplique naît du scénario ou du casting, sans plan ; la fiche de plan n'en
// est que la table d'assemblage. Les prises se déposent ici à la main ; leur génération
// depuis l'application (clonage de la voix du casting) est dans generation-actions.ts.

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

const nettoyer = (t: string) => t.replace(/\r\n/g, "\n").trim();

async function exigerReplique(id: number) {
  const [r] = await db.select().from(repliques).where(eq(repliques.id, id));
  if (!r) throw new Error("Cette réplique n'existe pas.");
  return r;
}

/** Résout le sélecteur de locuteur (`p:<id>` / `v:<id>` / `t:<texte>`) en
 * colonnes de `repliques`, en vérifiant que l'asset appartient au projet. */
async function resoudreLocuteur(
  projectId: number,
  valeur: string,
): Promise<Resultat<{ locuteurId: number | null; voixId: number | null; locuteurTexte: string }>> {
  const choix = decoderLocuteur(valeur);
  if (!choix) return { ok: false, erreur: "Choisis un locuteur." };
  if (choix.kind === "texte") return { ok: true, locuteurId: null, voixId: null, locuteurTexte: choix.texte.slice(0, 100) };
  const [a] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, choix.id), eq(assets.projectId, projectId), eq(assets.type, choix.kind === "personnage" ? "personnage" : "voix")));
  if (!a) return { ok: false, erreur: "Ce locuteur n'existe pas dans le projet." };
  return choix.kind === "personnage"
    ? { ok: true, locuteurId: a.id, voixId: null, locuteurTexte: "" }
    : { ok: true, locuteurId: null, voixId: a.id, locuteurTexte: "" };
}

// ---------------------------------------------------------------------
// Création / édition / suppression
// ---------------------------------------------------------------------

/** Nouvelle réplique dans un épisode. Avec `planId`, elle est aussitôt liée au
 * plan (création « à la volée » depuis la fiche de plan). */
export async function creerReplique(
  projectId: number,
  episodeId: number,
  valeurs: { texte: string; locuteur: string; planId?: number },
): Promise<Resultat<{ id: number; note?: string }>> {
  const texte = nettoyer(valeurs.texte);
  if (!texte) return { ok: false, erreur: "Le texte de la réplique est vide." };

  const [ep] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(and(eq(episodes.id, episodeId), eq(seasons.projectId, projectId)));
  if (!ep) return { ok: false, erreur: "Épisode introuvable dans ce projet." };

  const loc = await resoudreLocuteur(projectId, valeurs.locuteur);
  if (!loc.ok) return loc;

  let sceneId: number | null = null;
  if (valeurs.planId != null) {
    const [plan] = await db.select().from(plans).where(and(eq(plans.id, valeurs.planId), eq(plans.episodeId, episodeId)));
    if (!plan) return { ok: false, erreur: "Plan introuvable dans cet épisode." };
    sceneId = plan.sceneId;
  }

  const [dernier] = await db
    .select({ ordre: repliques.ordre })
    .from(repliques)
    .where(eq(repliques.episodeId, episodeId))
    .orderBy(desc(repliques.ordre))
    .limit(1);
  const [cree] = await db
    .insert(repliques)
    .values({
      projectId,
      episodeId,
      sceneId,
      ordre: (dernier?.ordre ?? -1) + 1,
      locuteurId: loc.locuteurId,
      voixId: loc.voixId,
      locuteurTexte: loc.locuteurTexte,
      texte,
    })
    .returning();
  if (!cree) return { ok: false, erreur: "Échec de la création." };

  let note: string | undefined;
  if (valeurs.planId != null) {
    const lien = await lierInterne(valeurs.planId, cree.id);
    if (!lien.ok) {
      revalidatePath("/", "layout");
      return { ok: true, id: cree.id, note: `Réplique créée, mais pas liée au plan : ${lien.erreur}` };
    }
    note = lien.note;
  }
  revalidatePath("/", "layout");
  return { ok: true, id: cree.id, note };
}

/** Change le texte et/ou le locuteur. Un texte modifié laisse les plans qui
 * citent la réplique en alerte (le contrôle verbatim les voit « différente »)
 * et marque la prise « à refaire » (priseObsolete) ; une prise validée repasse
 * « posée » — elle ne dit plus le texte. Renvoie le nombre de plans à
 * resynchroniser. */
export async function modifierReplique(
  id: number,
  valeurs: { texte?: string; locuteur?: string },
): Promise<Resultat<{ plansAResynchroniser: number }>> {
  const r = await exigerReplique(id);
  const set: Partial<typeof repliques.$inferInsert> = { updatedAt: new Date() };
  let texteChange = false;

  if (valeurs.texte !== undefined) {
    const texte = nettoyer(valeurs.texte);
    if (!texte) return { ok: false, erreur: "Le texte de la réplique est vide." };
    if (texte !== r.texte) {
      set.texte = texte;
      texteChange = true;
      if (r.statut === "validee") set.statut = "prise_posee";
    }
  }
  if (valeurs.locuteur !== undefined) {
    const loc = await resoudreLocuteur(r.projectId, valeurs.locuteur);
    if (!loc.ok) return loc;
    set.locuteurId = loc.locuteurId;
    set.voixId = loc.voixId;
    set.locuteurTexte = loc.locuteurTexte;
  }
  await db.update(repliques).set(set).where(eq(repliques.id, id));

  const liaisons = texteChange ? await db.select({ planId: planDialogues.planId }).from(planDialogues).where(eq(planDialogues.repliqueId, id)) : [];
  revalidatePath("/", "layout");
  return { ok: true, plansAResynchroniser: liaisons.length };
}

/** Une réplique citée par un plan ne se supprime pas sans geste explicite
 * (même philosophie que supprimerAsset) ; `force` la retire aussi des plans. */
export async function supprimerReplique(id: number, force = false): Promise<Resultat> {
  const r = await exigerReplique(id);
  const liaisons = await db.select({ id: planDialogues.id }).from(planDialogues).where(eq(planDialogues.repliqueId, id));
  if (liaisons.length > 0 && !force) {
    return { ok: false, erreur: `Encore liée à ${liaisons.length} plan${liaisons.length > 1 ? "s" : ""} — retire-la d'abord, ou force la suppression.` };
  }
  await db.delete(repliques).where(eq(repliques.id, id)); // liaisons : cascade
  await rm(join(MEDIA_ROOT, dirname(cheminRepliqueMedia(r.id, "x"))), { recursive: true, force: true }).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------
// Prise audio — produite hors Cadence, déposée ici. Une nouvelle prise
// remplace l'ancienne (pas de versionnage, F01).
// ---------------------------------------------------------------------

export async function uploaderPriseReplique(id: number, formData: FormData) {
  const r = await exigerReplique(id);
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;
  if (fichier.size > TAILLE_MAX_UPLOAD_ASSET) {
    throw new Error(
      `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).`,
    );
  }
  if (!estAudio(fichier.name)) throw new Error("Fichier audio attendu (WAV ou FLAC de préférence).");

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const nom = `${r.uuid}${extname(fichier.name).toLowerCase()}`;
  const chemin = join(MEDIA_ROOT, cheminRepliqueMedia(r.id, nom));
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, octets);
  if (r.fichier && r.fichier !== nom) {
    await unlink(join(MEDIA_ROOT, cheminRepliqueMedia(r.id, r.fichier))).catch(() => undefined);
  }

  await db
    .update(repliques)
    .set({
      fichier: nom,
      fichierTexte: r.texte,
      // Mesurée sur la prise ; null si le format ne se mesure pas ici (MP3…) —
      // à saisir à la main, jamais estimée (F03).
      dureeSecondes: mesurerDureeAudio(octets, nom),
      statut: "prise_posee",
      updatedAt: new Date(),
    })
    .where(eq(repliques.id, id));
  revalidatePath("/", "layout");
}

export async function supprimerPriseReplique(id: number): Promise<Resultat> {
  const r = await exigerReplique(id);
  if (r.fichier) await unlink(join(MEDIA_ROOT, cheminRepliqueMedia(r.id, r.fichier))).catch(() => undefined);
  await db
    .update(repliques)
    .set({ fichier: null, fichierTexte: null, dureeSecondes: null, statut: "a_produire", updatedAt: new Date() })
    .where(eq(repliques.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Durée saisie à la main, seulement quand la prise n'est pas mesurable
 * automatiquement (MP3, M4A) — la valeur vient de l'éditeur audio, pas d'une
 * estimation à la lecture du texte. */
export async function definirDureeReplique(id: number, secondes: number | null): Promise<Resultat> {
  const r = await exigerReplique(id);
  if (secondes != null && (!Number.isFinite(secondes) || secondes <= 0 || secondes > 600)) {
    return { ok: false, erreur: "Durée invalide." };
  }
  if (secondes != null && !r.fichier) return { ok: false, erreur: "Pas de prise : la durée se mesure sur la prise." };
  await db.update(repliques).set({ dureeSecondes: secondes, updatedAt: new Date() }).where(eq(repliques.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changerStatutReplique(id: number, statut: string): Promise<Resultat> {
  if (!estStatutReplique(statut)) return { ok: false, erreur: "Statut inconnu." };
  const r = await exigerReplique(id);
  if (statut === "validee") {
    if (!r.fichier) return { ok: false, erreur: "Pas de prise à valider." };
    if (priseObsolete(r)) return { ok: false, erreur: "La prise ne dit plus le texte courant — refais-la avant de valider." };
    if (r.dureeSecondes == null) return { ok: false, erreur: "Durée non mesurée — saisis-la avant de valider." };
  }
  if (statut === "prise_posee" && !r.fichier) return { ok: false, erreur: "Pas de prise déposée." };
  await db.update(repliques).set({ statut, updatedAt: new Date() }).where(eq(repliques.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------
// Assemblage : lier / délier une réplique d'un plan
// ---------------------------------------------------------------------

/** Lie une réplique à un plan (même épisode). Chaque réplique liée occupe un
 * emplacement <Audio N> (3 max, MiniMax H3) : la voix prime sur les bruitages
 * (arbitrage F02, 2026-09-17), donc s'il ne reste plus de slot, un bruitage est
 * retiré de plan_refs pour lui faire place — et signalé dans `note`. */
async function lierInterne(planId: number, repliqueId: number): Promise<Resultat<{ note?: string }>> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  const r = await db.select().from(repliques).where(eq(repliques.id, repliqueId)).then((x) => x[0]);
  if (!plan || !r) return { ok: false, erreur: "Plan ou réplique introuvable." };
  if (plan.episodeId !== r.episodeId) return { ok: false, erreur: "Cette réplique appartient à un autre épisode." };

  const [liaisons, refsAudio] = await Promise.all([
    db.select().from(planDialogues).where(eq(planDialogues.planId, planId)),
    db.select().from(planRefs).where(and(eq(planRefs.planId, planId), eq(planRefs.type, "audio"))),
  ]);
  if (liaisons.some((l) => l.repliqueId === repliqueId)) return { ok: true };

  let note: string | undefined;
  let slot = prochainSlotAudioLibre([...liaisons.map((l) => l.slot), ...refsAudio.map((x) => x.slot)]);
  if (slot == null) {
    if (liaisons.length >= MAX_REFS.audio) {
      return { ok: false, erreur: `Ce plan a déjà ${MAX_REFS.audio} répliques — c'est le maximum de références audio (MiniMax H3).` };
    }
    const sacrifie = [...refsAudio].sort((a, b) => b.slot - a.slot)[0]!;
    const [asset] = sacrifie.assetId != null ? await db.select().from(assets).where(eq(assets.id, sacrifie.assetId)) : [];
    await db.delete(planRefs).where(eq(planRefs.id, sacrifie.id));
    slot = sacrifie.slot;
    note = `Plus de slot audio : le bruitage ${asset?.code ?? `<Audio ${sacrifie.slot}>`} a été retiré, la voix prime.`;
  }
  await db.insert(planDialogues).values({ planId, repliqueId, slot });
  return { ok: true, note };
}

export async function lierReplique(planId: number, repliqueId: number): Promise<Resultat<{ note?: string }>> {
  const r = await lierInterne(planId, repliqueId);
  revalidatePath("/", "layout");
  return r;
}

/** Retire une réplique du plan (elle continue d'exister). Les slots restants ne
 * sont jamais renumérotés : un `<Audio N>` déjà cité dans le prompt garde son
 * numéro (même philosophie que les slots de plan_refs). */
export async function delierReplique(planId: number, repliqueId: number): Promise<Resultat> {
  await db.delete(planDialogues).where(and(eq(planDialogues.planId, planId), eq(planDialogues.repliqueId, repliqueId)));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Moment indicatif où la réplique est dite dans le plan — à recopier dans le
 * prompt H3, jamais une contrainte. */
export async function definirDebutReplique(liaisonId: number, secondes: number | null): Promise<Resultat> {
  if (secondes != null && (!Number.isFinite(secondes) || secondes < 0 || secondes > 60)) {
    return { ok: false, erreur: "Valeur invalide." };
  }
  await db.update(planDialogues).set({ debutSecondes: secondes }).where(eq(planDialogues.id, liaisonId));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------
// Synchronisation du prompt (invariant verbatim)
// ---------------------------------------------------------------------

async function sectionDetaillee(planId: number) {
  const [s] = await db
    .select()
    .from(planPromptSections)
    .where(and(eq(planPromptSections.planId, planId), eq(planPromptSections.section, "detailed_description")));
  return s ?? null;
}

async function ecrireSection(planId: number, section: string, contenu: string, existante: { id: number } | null) {
  if (existante) {
    await db.update(planPromptSections).set({ contenu }).where(eq(planPromptSections.id, existante.id));
    return;
  }
  const deja = await db.select({ id: planPromptSections.id }).from(planPromptSections).where(eq(planPromptSections.planId, planId));
  await db.insert(planPromptSections).values({ planId, section, ordre: deja.length, contenu });
}

/** Ajoute la balise `<d>[Langue] …</d>` d'une réplique absente en fin de
 * `detailed_description`. C'est une amorce : à replacer dans la phrase. */
export async function insererRepliqueDansPrompt(planId: number, repliqueId: number): Promise<Resultat> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  const r = await db.select().from(repliques).where(eq(repliques.id, repliqueId)).then((x) => x[0]);
  if (!plan || !r) return { ok: false, erreur: "Plan ou réplique introuvable." };

  const { liaisons } = await getDialoguesPlan(plan.projectId, planId, plan.episodeId);
  const vue = liaisons.find((l) => l.id === repliqueId);
  if (!vue) return { ok: false, erreur: "Cette réplique n'est pas liée au plan." };

  const [fiche] = vue.voix ? await db.select().from(voixFiches).where(eq(voixFiches.assetId, vue.voix.id)) : [];
  const existante = await sectionDetaillee(planId);
  const contenu = ajouterBalise(existante?.contenu ?? "", vue.locuteur.label, langueBalise(fiche?.langue), r.texte);
  await ecrireSection(planId, "detailed_description", contenu, existante);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Remplace, dans le prompt, la balise « différente » d'une réplique par son
 * texte exact — sans toucher au reste de la phrase. */
export async function corrigerRepliqueDansPrompt(planId: number, repliqueId: number): Promise<Resultat> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) return { ok: false, erreur: "Plan introuvable." };
  const { controle, liaisons } = await getDialoguesPlan(plan.projectId, planId, plan.episodeId);
  const probleme = controle.problemes.find((p) => p.type === "differente" && p.repliqueId === repliqueId);
  const vue = liaisons.find((l) => l.id === repliqueId);
  if (!probleme || probleme.type !== "differente" || !vue) return { ok: false, erreur: "Rien à corriger pour cette réplique." };

  const [section] = await db
    .select()
    .from(planPromptSections)
    .where(and(eq(planPromptSections.planId, planId), eq(planPromptSections.section, probleme.balise.section)));
  if (!section) return { ok: false, erreur: "Section du prompt introuvable." };
  await db
    .update(planPromptSections)
    .set({ contenu: corrigerBalise(section.contenu, probleme.balise, vue.texte) })
    .where(eq(planPromptSections.id, section.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
