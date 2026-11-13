import "dotenv/config";
import { createHash } from "node:crypto";
import { cp, copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { assetGenerationSources, assetGenerations, assets } from "../db/schema";

// SCRIPT À USAGE UNIQUE (à supprimer après passage) : range les images d'assets par projet.
// Avant : data/assets/<code>.<ext>, un dossier commun où deux projets utilisant le même code s'écrasaient.
// Après : data/assets/<projectId>/<code>.<ext>, et assets.fichier vaut « <projectId>/<code>.<ext> ».
//
// Usage : npx tsx scripts/migrer-assets-par-projet.ts            (à blanc : liste ce qui serait fait, ne touche à rien)
//         npx tsx scripts/migrer-assets-par-projet.ts --appliquer (sauvegarde data/assets puis applique)
//
// Quand plusieurs assets de projets différents pointent vers le même fichier, il n'en reste qu'un sur le disque (le dernier écrit).
// L'image des autres est retrouvée dans leurs générations adoptées (data/generations/<assetId>/…) ; à défaut, l'asset repasse sans image.

const appliquer = process.argv.includes("--appliquer");
const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? "./data");
const existe = (p: string) => stat(p).then(() => true, () => false);
const sha = async (p: string) => createHash("sha256").update(await readFile(p)).digest("hex");

type Asset = typeof assets.$inferSelect;
type Plan = { asset: Asset; nouveau: string; source: string | null; origine: "partage" | "generation" | "perdu" };

const lignes = await db.select().from(assets).where(isNotNull(assets.fichier)).orderBy(asc(assets.id));
const aMigrer = lignes.filter((a) => a.fichier && !a.fichier.includes("/"));
console.log(`${lignes.length} assets avec image, ${aMigrer.length} à ranger (${lignes.length - aMigrer.length} déjà rangés).`);

const parFichier = new Map<string, Asset[]>();
for (const a of aMigrer) parFichier.set(a.fichier!, [...(parFichier.get(a.fichier!) ?? []), a]);

const plans: Plan[] = [];
for (const [fichier, groupe] of parFichier) {
  const commun = join(MEDIA_ROOT, "assets", fichier);
  const present = await existe(commun);
  const hashCommun = present ? await sha(commun) : null;

  // Les images adoptées de chaque asset, pour reconnaître le vrai propriétaire du fichier commun.
  const adoptees = new Map<number, string[]>();
  for (const a of groupe) {
    const gens = await db
      .select({ fichier: assetGenerations.fichier })
      .from(assetGenerations)
      .where(and(eq(assetGenerations.assetId, a.id), isNotNull(assetGenerations.adopteAt), isNotNull(assetGenerations.fichier)))
      .orderBy(desc(assetGenerations.adopteAt));
    const chemins: string[] = [];
    for (const g of gens) {
      const p = join(MEDIA_ROOT, "generations", String(a.id), g.fichier!);
      if (await existe(p)) chemins.push(p);
    }
    adoptees.set(a.id, chemins);
  }

  let proprietaires: Asset[] = [];
  if (groupe.length === 1) proprietaires = present ? groupe : [];
  else if (hashCommun) {
    for (const a of groupe) for (const p of adoptees.get(a.id)!) if ((await sha(p)) === hashCommun) { proprietaires.push(a); break; }
    if (proprietaires.length === 0) {
      // aucune génération ne correspond (import par fichier) : le dernier écrit est celui qui est resté sur le disque
      const dernier = [...groupe].sort((x, y) => (y.fichierAt?.getTime() ?? 0) - (x.fichierAt?.getTime() ?? 0))[0]!;
      proprietaires = [dernier];
    }
  }

  for (const a of groupe) {
    const nouveau = `${a.projectId}/${fichier}`;
    if (proprietaires.includes(a)) plans.push({ asset: a, nouveau, source: commun, origine: "partage" });
    else {
      const retrouvee = adoptees.get(a.id)![0] ?? null;
      plans.push(retrouvee ? { asset: a, nouveau, source: retrouvee, origine: "generation" } : { asset: a, nouveau, source: null, origine: "perdu" });
    }
  }
}

const compte = (o: Plan["origine"]) => plans.filter((p) => p.origine === o).length;
console.log(`- déplacés depuis le dossier commun : ${compte("partage")}`);
console.log(`- restaurés depuis une génération adoptée : ${compte("generation")}`);
console.log(`- sans image retrouvable (repassent « sans image ») : ${compte("perdu")}`);
for (const p of plans.filter((x) => x.origine !== "partage")) {
  console.log(`  ${p.origine === "perdu" ? "PERDU     " : "RESTAURÉ  "} projet ${p.asset.projectId} ${p.asset.code} (asset ${p.asset.id})${p.source ? ` ← ${p.source.replace(MEDIA_ROOT, "")}` : ""}`);
}

if (!appliquer) {
  console.log("\nÀ blanc : rien n'a été modifié. Relance avec --appliquer pour exécuter.");
  process.exit(0);
}

const sauvegarde = join(MEDIA_ROOT, `_sauvegarde_assets_${new Date().toISOString().slice(0, 10)}`);
await cp(join(MEDIA_ROOT, "assets"), sauvegarde, { recursive: true });
console.log(`\nSauvegarde : ${sauvegarde}`);

for (const p of plans) {
  const cible = join(MEDIA_ROOT, "assets", p.nouveau);
  if (p.source) {
    await mkdir(dirname(cible), { recursive: true });
    await copyFile(p.source, cible);
  }
}
await db.transaction(async (tx) => {
  for (const p of plans) {
    if (p.source) {
      await tx.update(assets).set({ fichier: p.nouveau }).where(eq(assets.id, p.asset.id));
      // les sources d'images d'un essai citent le nom du fichier de l'asset
      await tx.update(assetGenerationSources).set({ fichier: p.nouveau }).where(and(eq(assetGenerationSources.origine, "asset"), eq(assetGenerationSources.assetId, p.asset.id)));
    } else {
      await tx.update(assets).set({ fichier: null, valide: false, fichierAt: new Date() }).where(eq(assets.id, p.asset.id));
    }
  }
});
// l'ancien fichier commun : retiré seulement quand plus aucun asset ne le cite
for (const fichier of parFichier.keys()) await rename(join(MEDIA_ROOT, "assets", fichier), join(sauvegarde, `_apres_${fichier}`)).catch(() => undefined);
await rm(join(MEDIA_ROOT, "_miniatures"), { recursive: true, force: true });
console.log("Terminé. La sauvegarde de data/assets reste à côté ; à supprimer quand tout est vérifié.");
process.exit(0);
