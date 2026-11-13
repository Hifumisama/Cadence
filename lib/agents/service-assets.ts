import type { Resultat } from "./types";
import { db } from "../../db";
import { propositions, assets } from "../../db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { SKILL_REFERENCES_PLAN } from "./references-clip";
import { SKILL_ASSETS_MANQUANTS } from "../h3ir/preparation";
import { type EntreeSkill, entreePromptAsset } from "./context";
import { creerRun } from "./runs";
import { cleSousTacheAsset } from "./registry";
import { nouvelleProposition, propositionParUuid } from "./service-proposals";
import { CONSIGNE_PROMPTS_CREES, ERR, refusSiTacheActive } from "./service-shared";
import { assetsCreesSansPrompt } from "./service-clips";
import { ConversationRow, conversationParUuid, ouvrirConversation } from "./service-conversation";

/** After applying a sheet, an inventory or a choice of references: "Continuer: écrire les prompts des assets créés". A BATCH
 * `prompt-asset` (one subtask per asset created without a prompt, `asset:<code>`), posted in the PROJECT's conversation (the only scope where an existing asset
 * is modified). Launched on the user's click, or by a project's creation. Refused if the project's conversation already has a running task or a
 * proposal awaiting review (it is not lost). A clip's preparation goes through `genererPromptsAssets` (detached batch). */
export async function genererPromptsAssetsCrees(
  propositionUuid: string,
  options: { consigne?: string } = {},
): Promise<Resultat<{ conversationUuid: string; propositionUuid: string; nbSousTaches: number }>> {
  const source = await propositionParUuid(propositionUuid);
  if (!source) return ERR("Proposition introuvable.");
  if (!SKILLS_CREANT_DES_ASSETS.includes(source.skill)) return ERR("Cette proposition n'a pas créé d'assets à décrire (fiches de plan, inventaire, références d'un plan).");
  if (source.statut !== "appliquee" && source.statut !== "partielle") return ERR("Applique d'abord la proposition : les assets n'existent pas encore.");
  const aEcrire = await assetsCreesSansPrompt(source.id);
  if (aEcrire.length === 0) return ERR("Aucun asset créé par cette proposition n'attend son prompt.");

  const o = await ouvrirConversation(source.projectId, "projet", null);
  if (!o.ok) return o;
  const conv = await conversationParUuid(o.conversationUuid);
  if (!conv) return ERR("Conversation du projet introuvable.");
  { const refus = await refusSiTacheActive(conv.id, "L'agent du projet a déjà une tâche en cours : attends qu'elle finisse."); if (refus) return refus; }
  if (conv.propositionId != null) {
    const [courante] = await db.select({ statut: propositions.statut }).from(propositions).where(eq(propositions.id, conv.propositionId));
    if (courante && (courante.statut === "prete" || courante.statut === "en_generation")) {
      return ERR("La conversation du projet a une proposition en attente de revue : applique-la ou rejette-la d'abord.");
    }
  }
  const consigne = (options.consigne ?? "").trim() || CONSIGNE_PROMPTS_CREES;
  const lot = await poserLotPrompts(source.projectId, aEcrire, { consigne, conv });
  if (!lot.ok) return lot;
  return { ok: true, conversationUuid: conv.uuid, propositionUuid: lot.propositionUuid, nbSousTaches: lot.nbSousTaches };
}

/** The proposals whose asset creations then wait for their prompts. */
const SKILLS_CREANT_DES_ASSETS = ["fiches", "inventaire-assets", SKILL_REFERENCES_PLAN, SKILL_ASSETS_MANQUANTS];

/** The image prompts of these assets (a clip's preparation, wave 4a): a DETACHED `prompt-asset` batch (without conversation: it neither replaces nor
 * rejects the proposal under review in the project's conversation, and does not wait for it to be free). Its tasks carry the request (`demandeId`): the
 * request's line follows them in the panel, they go before background work. The request applies the batch itself. Only assets without a
 * prompt are taken. */
export async function genererPromptsAssets(
  projectId: number,
  assetIds: number[],
  options: { demandeId?: number; consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  if (assetIds.length === 0) return ERR("Aucun asset à décrire.");
  const lus = await db
    .select({ id: assets.id, code: assets.code, type: assets.type, prompt: assets.promptGeneration })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), inArray(assets.id, assetIds)))
    .orderBy(asc(assets.code));
  const aEcrire = lus.filter((a) => !(a.prompt ?? "").trim());
  if (aEcrire.length === 0) return ERR("Aucun de ces assets n'attend son prompt.");
  return poserLotPrompts(projectId, aEcrire, { consigne: (options.consigne ?? "").trim() || CONSIGNE_PROMPTS_CREES, demandeId: options.demandeId });
}

/** The `prompt-asset` batch itself: attached to the project's conversation (`conv`, current proposal) or detached (`conv` absent). */
async function poserLotPrompts(
  projectId: number,
  aEcrire: { id: number; code: string }[],
  o: { consigne: string; conv?: ConversationRow; demandeId?: number },
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  const sousTaches: { code: string; e: EntreeSkill }[] = [];
  for (const a of aEcrire) {
    const e = await entreePromptAsset(db, projectId, a.id, o.consigne);
    if (e) sousTaches.push({ code: a.code, e });
  }
  if (sousTaches.length === 0) return ERR("Aucun asset lisible.");
  const contexte = [{ type: "registre" as const, libelle: `${sousTaches.length} asset${sousTaches.length > 1 ? "s" : ""} sans prompt, un par un` }];
  let propId: number;
  if (o.conv) propId = await nouvelleProposition(o.conv, { skill: "prompts-assets", consigne: o.consigne, contexte, lot: true });
  else {
    const [p] = await db.insert(propositions).values({ conversationId: null, projectId, skill: "prompts-assets", portee: "projet", cibleId: null, consigne: o.consigne, contexte, lot: true }).returning({ id: propositions.id });
    propId = p!.id;
  }
  for (const { code, e } of sousTaches) {
    await creerRun(db, {
      skill: "prompt-asset",
      entree: e.entree,
      but: "proposition",
      projectId,
      conversationId: o.conv?.id ?? null,
      propositionId: propId,
      cleSousTache: cleSousTacheAsset(code),
      libelleSousTache: code,
      options: e.variante ? { variante: e.variante } : null,
      demandeId: o.demandeId,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
}
