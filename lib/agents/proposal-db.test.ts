import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { creerBaseDeTest } from "../testing/test-db";
import type { ChangementBrut } from "./changes";

// Behaviour of a proposal's life against a real (throwaway) database: recording the changes, applying them, partial application, overwrite
// confirmation, refusals. These tests pin the current behaviour before the review state machine is simplified.

const base = await creerBaseDeTest();
if (base) process.env.DATABASE_URL = base.url;
const skip = base ? false : "aucune base PostgreSQL joignable";

const { db } = base ? await import("../../db") : { db: null as never };
const schema = base ? await import("../../db/schema") : ({} as never);
const { enregistrerChangements, appliquerProposition } = base ? await import("./proposal-db") : ({} as never);
const { eq } = await import("drizzle-orm");

after(async () => {
  await base?.fermer();
  // the postgres-js connection stays open otherwise: end the process by hand
  setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});

let projectId = 0;
let conversationId = 0;

before(async () => {
  if (!base) return;
  const [p] = await db.insert(schema.projects).values({ nom: "Projet de test" }).returning({ id: schema.projects.id });
  projectId = p!.id;
  const [c] = await db.insert(schema.agentConversations).values({ projectId, portee: "projet" }).returning({ id: schema.agentConversations.id });
  conversationId = c!.id;
});

const creationAsset = (suffixe: string, extra: Partial<ChangementBrut> = {}): ChangementBrut => ({
  groupe: "assets",
  cibleType: "asset",
  cibleRef: null,
  libelle: `Créer ${suffixe}`,
  operation: "creer",
  apres: { type: "personnage", suffixe, description: `Description de ${suffixe}.` },
  ...extra,
});

async function nouvelleProposition(changements: ChangementBrut[]): Promise<number> {
  const [prop] = await db
    .insert(schema.propositions)
    .values({ conversationId, projectId, skill: "inventaire-assets", portee: "projet", cibleId: null })
    .returning({ id: schema.propositions.id });
  await db.transaction(async (tx) => {
    await enregistrerChangements(tx, prop!.id, projectId, { type: "projet", cibleId: null }, changements);
  });
  return prop!.id;
}

const statutDe = async (id: number) => (await db.select().from(schema.propositions).where(eq(schema.propositions.id, id)))[0]!;
const codesAssets = async () => (await db.select({ code: schema.assets.code }).from(schema.assets).where(eq(schema.assets.projectId, projectId))).map((a) => a.code).sort();

test("enregistrerChangements : la proposition devient « prete », ses créations sont cochées", { skip }, async () => {
  const id = await nouvelleProposition([creationAsset("alice"), creationAsset("bob")]);
  const prop = await statutDe(id);
  assert.equal(prop.statut, "prete");
  const lignes = await db.select().from(schema.propositionChangements).where(eq(schema.propositionChangements.propositionId, id));
  assert.equal(lignes.length, 2);
  assert.ok(lignes.every((l) => l.coche && !l.refuseRaison));
  assert.deepEqual(await codesAssets(), [], "rien n'est écrit tant qu'on n'applique pas");
});

test("appliquerProposition : tout ce qui est coché est écrit, la proposition devient « appliquee »", { skip }, async () => {
  const id = await nouvelleProposition([creationAsset("carla"), creationAsset("dario")]);
  const r = await appliquerProposition(id);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.statut, r.appliques, r.ecartes, r.refuses], ["appliquee", 2, 0, 0]);
  assert.ok((await codesAssets()).includes("CHAR_carla") && (await codesAssets()).includes("CHAR_dario"));
  const prop = await statutDe(id);
  assert.equal(prop.statut, "appliquee");
  assert.ok(prop.appliedAt);
  const lignes = await db.select().from(schema.propositionChangements).where(eq(schema.propositionChangements.propositionId, id));
  assert.ok(lignes.every((l) => l.appliqueAt));
});

test("appliquerProposition : une proposition déjà appliquée n'est plus applicable", { skip }, async () => {
  const id = await nouvelleProposition([creationAsset("eva")]);
  assert.equal((await appliquerProposition(id)).ok, true);
  const encore = await appliquerProposition(id);
  assert.equal(encore.ok, false);
  if (!encore.ok) assert.match(encore.erreur, /n'est plus applicable/);
});

test("appliquerProposition : un changement décoché est écarté, la proposition devient « partielle »", { skip }, async () => {
  const id = await nouvelleProposition([creationAsset("fabio"), creationAsset("gina")]);
  const [aEcarter] = await db.select().from(schema.propositionChangements).where(eq(schema.propositionChangements.propositionId, id)).orderBy(schema.propositionChangements.ordre);
  await db.update(schema.propositionChangements).set({ coche: false }).where(eq(schema.propositionChangements.id, aEcarter!.id));
  const r = await appliquerProposition(id);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.statut, r.appliques, r.ecartes], ["partielle", 1, 1]);
  const codes = await codesAssets();
  assert.ok(!codes.includes("CHAR_fabio") && codes.includes("CHAR_gina"));
});

test("appliquerProposition : rien de coché → refus, rien d'écrit", { skip }, async () => {
  const id = await nouvelleProposition([creationAsset("hugo")]);
  await db.update(schema.propositionChangements).set({ coche: false }).where(eq(schema.propositionChangements.propositionId, id));
  const r = await appliquerProposition(id);
  assert.equal(r.ok, false);
  assert.ok(!(await codesAssets()).includes("CHAR_hugo"));
  assert.equal((await statutDe(id)).statut, "prete");
});

test("appliquerProposition : un changement refusé d'office n'est jamais appliqué, même coché", { skip }, async () => {
  const id = await nouvelleProposition([creationAsset("iris"), creationAsset("jade", { refuseRaison: "hors portée" })]);
  await db.update(schema.propositionChangements).set({ coche: true }).where(eq(schema.propositionChangements.propositionId, id));
  const r = await appliquerProposition(id);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.refuses, 1);
  const codes = await codesAssets();
  assert.ok(codes.includes("CHAR_iris") && !codes.includes("CHAR_jade"));
});

test("appliquerProposition : l'écrasement d'un élément validé demande une confirmation, puis passe", { skip }, async () => {
  const [asset] = await db.insert(schema.assets).values({ projectId, code: "CHAR_kim", type: "personnage", description: "Ancienne description", valide: true }).returning({ id: schema.assets.id });
  const id = await nouvelleProposition([
    {
      groupe: "assets",
      cibleType: "asset",
      cibleRef: String(asset!.id),
      libelle: "Modifier kim",
      operation: "modifier",
      apres: { description: "Nouvelle description" },
      ecrase: "la description validée",
    },
  ]);
  await db.update(schema.propositionChangements).set({ coche: true }).where(eq(schema.propositionChangements.propositionId, id));
  const sans = await appliquerProposition(id);
  assert.equal(sans.ok, false);
  if (!sans.ok) assert.ok(sans.confirmationRequise && sans.confirmationRequise.length === 1);
  const [avant] = await db.select().from(schema.assets).where(eq(schema.assets.id, asset!.id));
  assert.equal(avant!.description, "Ancienne description");
  const avec = await appliquerProposition(id, { confirmeEcrasement: true });
  assert.equal(avec.ok, true);
  const [apres] = await db.select().from(schema.assets).where(eq(schema.assets.id, asset!.id));
  assert.equal(apres!.description, "Nouvelle description");
});

test("appliquerProposition : une erreur dans un changement annule tout (une seule transaction)", { skip }, async () => {
  const id = await nouvelleProposition([creationAsset("lena"), creationAsset("mona")]);
  // the second creation becomes impossible between the recording and the application: its code already exists
  await db.insert(schema.assets).values({ projectId, code: "CHAR_mona", type: "personnage", description: "déjà là" });
  const r = await appliquerProposition(id);
  assert.equal(r.ok, false);
  assert.ok(!(await codesAssets()).includes("CHAR_lena"), "le premier changement n'est pas resté écrit");
  assert.equal((await statutDe(id)).statut, "prete");
});
