// Banc de l'agent plan-h3 : trois scènes de combat DIFFÉRENTES (personnages, décors, armes, effets finaux), sans image ni rendu :
// l'agent ne lit que les descriptions du registre. Sert à comparer l'ancien et le nouveau skill sur autre chose que le combat de Maya.
//   npx tsx --env-file=.env scripts/ab-banc-agent.mts
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assets, briefs, episodes, plans, projects, scenes, seasons } from "../db/schema";
import { briefVide } from "../lib/agents/brief";
import { synchroniserClauseStyle } from "../lib/agents/brief-db";

const NOM = "Banc agent — combats (sans rendu)";
const CLAUSE = "Cinematic anime illustration, refined linework, sophisticated cinematic lighting, atmospheric depth, polished digital rendering.";
if ((await db.select({ id: projects.id }).from(projects).where(eq(projects.nom, NOM))).length) throw new Error("Le banc existe déjà — rien n'a été écrit.");

type Asset = { code: string; type: string; description: string };
const SCENES: { titre: string; ambiance: string; assets: Asset[]; plan: { titre: string; description: string } }[] = [
  {
    titre: "Le pont de cordes",
    ambiance: "Orage au crépuscule, ciel gris-vert, vent fort, brume dans le gouffre, lumière froide et plate.",
    assets: [
      { code: "CHAR_kael", type: "personnage", description: "Kael, épéiste d'une trentaine d'années, large d'épaules, manteau de voyage gris délavé, cheveux courts noirs, cicatrice au sourcil gauche, regard fermé." },
      { code: "CHAR_ysolde", type: "personnage", description: "Ysolde, lancière d'une quarantaine d'années, grande et sèche, armure de cuir sombre cloutée, longue tresse grise, visage anguleux." },
      { code: "DEC_pont_cordes", type: "decor", description: "Un vieux pont suspendu de cordes et de planches de bois entre deux falaises, au-dessus d'un gouffre brumeux. Personne sur le pont." },
      { code: "PROP_epee_kael", type: "prop", description: "L'épée longue de Kael : lame droite d'acier gris, garde simple, poignée enveloppée de cuir noir." },
      { code: "PROP_lance_ysolde", type: "prop", description: "La lance d'Ysolde : longue hampe de bois sombre, pointe de bronze en feuille de laurier, bande de tissu rouge sous la pointe." },
    ],
    plan: {
      titre: "Duel sur le pont",
      description: "Ysolde avance sur le pont, lance en avant ; Kael l'attend. Ils échangent des coups : estoc de la lance, parade de l'épée, riposte, la lance brise une planche. Kael saute, Ysolde le repousse du plat de la hampe. Kael tranche une corde porteuse et le pont s'effondre en cascade vers le gouffre.",
    },
  },
  {
    titre: "La ruelle sous la pluie",
    ambiance: "Nuit, pluie battante, néons rouges et bleus qui se reflètent dans les flaques, lumière dure et colorée.",
    assets: [
      { code: "CHAR_noa", type: "personnage", description: "Noa, coursière d'une vingtaine d'années, svelte et nerveuse, veste de pluie jaune, mains bandées de tissu blanc, cheveux noirs courts collés par la pluie." },
      { code: "CHAR_brenn", type: "personnage", description: "Brenn, colosse d'une quarantaine d'années, crâne rasé, manteau de cuir noir, gants épais, démarche lourde." },
      { code: "DEC_ruelle_pluie", type: "decor", description: "Une ruelle étroite de ville nocturne sous la pluie, murs de briques sombres, escaliers de secours en fer, flaques, néons. Personne dans la ruelle." },
      { code: "PROP_couteau_brenn", type: "prop", description: "Le couteau de boucher de Brenn : large lame d'acier, manche en bois sombre." },
      { code: "PROP_enseigne_neon", type: "prop", description: "Une grande enseigne de néon rouge suspendue au mur de la ruelle par deux chaînes, lettres illisibles, tubes lumineux." },
    ],
    plan: {
      titre: "Noa contre Brenn",
      description: "Noa esquive les coups de couteau de Brenn, riposte au corps. Il la plaque contre un mur ; elle le retourne d'un coup de genou et d'un crochet. L'enseigne au néon, arrachée par le choc, tombe dans une gerbe d'étincelles entre eux.",
    },
  },
  {
    titre: "Le toit du temple",
    ambiance: "Pleine lune, nuit claire, lanternes de papier chaudes le long des gouttières, lumière bleutée et dorée.",
    assets: [
      { code: "CHAR_ren", type: "personnage", description: "Ren, acrobate d'une vingtaine d'années, petite et agile, tenue noire près du corps, cheveux attachés en une longue queue, bandeau rouge." },
      { code: "CHAR_daigo", type: "personnage", description: "Daigo, moine guerrier d'une cinquantaine d'années, carrure imposante, robe safran, crâne rasé, chapelet de bois au cou." },
      { code: "DEC_toit_temple", type: "decor", description: "Le toit d'un temple de pierre et de tuiles grises sous la pleine lune, faîtage courbe, lanternes de papier suspendues aux gouttières, grande lanterne centrale. Personne sur le toit." },
      { code: "PROP_fouet_ren", type: "prop", description: "Le fouet de Ren : longue lanière de cuir tressé noir, poignée enveloppée de cordon rouge." },
      { code: "PROP_baton_daigo", type: "prop", description: "Le bâton de Daigo : long bâton de bois sombre, extrémités cerclées de fer." },
    ],
    plan: {
      titre: "Le fouet et le bâton",
      description: "Le fouet de Ren s'enroule autour du bâton de Daigo ; il tire, elle bascule et se rétablit sur le faîtage. Il fait tournoyer son bâton ; elle saute et lui assène un coup de talon. La grande lanterne tombe et enflamme le toit.",
    },
  },
];

const r = await db.transaction(async (tx) => {
  const [projet] = await tx.insert(projects).values({ nom: NOM, type: "oneshot" }).returning();
  const [saison] = await tx.insert(seasons).values({ projectId: projet!.id, numero: 1, titre: "Saison 1" }).returning();
  const [episode] = await tx.insert(episodes).values({ seasonId: saison!.id, numero: 1, titre: "Trois combats", resume: "Trois scènes de combat de 15 s, pour tester l'agent plan-h3." }).returning();
  await tx.insert(briefs).values({ projectId: projet!.id, statut: "partiel", source: "reconstitue", contenu: { ...briefVide(NOM), style: { nom: "", clause: CLAUSE } }, statuts: { style: "fourni" } });
  const sortie: { scene: string; uuid: string }[] = [];
  for (const [i, s] of SCENES.entries()) {
    const [scene] = await tx.insert(scenes).values({ episodeId: episode!.id, ordre: i, titre: s.titre, genre: "action", ambiance: s.ambiance, fonction: "Combat de 15 s." }).returning();
    await tx.insert(assets).values(s.assets.map((a) => ({ projectId: projet!.id, code: a.code, type: a.type, statut: "valide" as const, description: a.description, methodeGeneration: "generation" })));
    const [p] = await tx.insert(plans).values({ projectId: projet!.id, episodeId: episode!.id, sceneId: scene!.id, ordre: i, titre: s.plan.titre, description: s.plan.description, dureeMontageSecondes: 15, dureeGenerationSecondes: 15, fps: 24, statut: "en_attente" }).returning();
    sortie.push({ scene: s.titre, uuid: p!.uuid });
  }
  return { projectId: projet!.id, plans: sortie };
});
await synchroniserClauseStyle(db, r.projectId);
console.log(JSON.stringify(r));
process.exit(0);
