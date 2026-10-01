import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PLAFOND_TERMINEES,
  analyserCle,
  estAffichable,
  pageEstPerimee,
  ordonnerTaches,
  resumerTaches,
  tachesDeAsset,
  type Tache,
} from "./taches";

const MAINTENANT = new Date("2026-10-01T12:00:00Z");
let n = 0;
const il_y_a = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

function tache(p: Partial<Tache> & Pick<Tache, "statut">): Tache {
  n++;
  return {
    cle: `image:u${n}`,
    genre: "image",
    libelle: `CHAR_${n}`,
    detail: null,
    href: "/",
    projectId: 1,
    assetId: 1,
    progression: null,
    apercuSrc: null,
    vignetteSrc: null,
    createdAt: il_y_a(30),
    startedAt: null,
    finishedAt: null,
    vuAt: null,
    erreur: null,
    positionFile: null,
    derriereVideo: false,
    derriere: null,
    jetons: null,
    annulationDemandee: false,
    ...p,
  };
}

test("ordre : en cours, puis la file (images avant vidéo, FIFO), puis les terminées récentes d'abord", () => {
  const video = tache({ statut: "en_attente", genre: "video", cle: "video:1", createdAt: il_y_a(50) });
  const imgTard = tache({ statut: "en_attente", cle: "image:tard", createdAt: il_y_a(5) });
  const imgTot = tache({ statut: "en_attente", cle: "image:tot", createdAt: il_y_a(20) });
  const courante = tache({ statut: "en_cours", cle: "image:run", startedAt: il_y_a(1) });
  const vieille = tache({ statut: "termine", cle: "image:vieille", finishedAt: il_y_a(120), vuAt: il_y_a(100) });
  const recente = tache({ statut: "echoue", cle: "image:recente", finishedAt: il_y_a(10) });

  const r = ordonnerTaches([vieille, video, imgTard, recente, imgTot, courante], MAINTENANT);
  assert.deepEqual(
    r.map((x) => x.cle),
    ["image:run", "image:tot", "image:tard", "video:1", "image:recente", "image:vieille"],
  );
  assert.deepEqual(
    r.map((x) => x.positionFile),
    [null, 1, 2, 3, null, null],
  );
});

test("une image en attente pendant qu'une vidéo tourne est « derrière une vidéo »", () => {
  const video = tache({ statut: "en_cours", genre: "video", cle: "video:9", startedAt: il_y_a(3) });
  const img = tache({ statut: "en_attente", cle: "image:a" });
  const autreVideo = tache({ statut: "en_attente", genre: "video", cle: "video:10" });
  const r = ordonnerTaches([video, img, autreVideo], MAINTENANT);
  assert.equal(r.find((x) => x.cle === "image:a")!.derriereVideo, true);
  assert.equal(r.find((x) => x.cle === "video:10")!.derriereVideo, false);
  assert.equal(r.find((x) => x.cle === "video:9")!.derriereVideo, false);

  const sansVideo = ordonnerTaches([tache({ statut: "en_cours", startedAt: il_y_a(1) }), tache({ statut: "en_attente" })], MAINTENANT);
  assert.ok(sansVideo.every((x) => !x.derriereVideo));
});

test("une tâche terminée et vue depuis plus de 7 jours disparaît ; une non vue reste (un échec, lui, part après 24 h)", () => {
  const ancienneVue = tache({ statut: "termine", finishedAt: il_y_a(60 * 24 * 8), vuAt: il_y_a(60 * 24 * 8) });
  const ancienneNonVue = tache({ statut: "termine", finishedAt: il_y_a(60 * 24 * 8) });
  const r = ordonnerTaches([ancienneVue, ancienneNonVue], MAINTENANT);
  assert.deepEqual(
    r.map((x) => x.cle),
    [ancienneNonVue.cle],
  );
});

test("les terminées sont plafonnées, les actives jamais", () => {
  const finies = Array.from({ length: PLAFOND_TERMINEES + 5 }, (_, i) =>
    tache({ statut: "termine", finishedAt: il_y_a(i + 1), vuAt: il_y_a(i) }),
  );
  const actives = Array.from({ length: 3 }, () => tache({ statut: "en_attente" }));
  const r = ordonnerTaches([...finies, ...actives], MAINTENANT);
  assert.equal(r.filter((x) => x.statut === "termine").length, PLAFOND_TERMINEES);
  assert.equal(r.filter((x) => x.statut === "en_attente").length, 3);
  // les plus récentes sont gardées
  assert.equal(r.find((x) => x.statut === "termine")!.finishedAt, il_y_a(1));
});

test("compteurs : actives, échecs et terminées non vus (annulée neutre)", () => {
  const r = resumerTaches([
    tache({ statut: "en_cours" }),
    tache({ statut: "en_attente" }),
    tache({ statut: "en_attente" }),
    tache({ statut: "echoue" }),
    tache({ statut: "echoue", vuAt: il_y_a(1) }),
    tache({ statut: "termine" }),
    tache({ statut: "termine", vuAt: il_y_a(1) }),
    tache({ statut: "annulee" }),
  ]);
  assert.deepEqual(r, { actives: 3, enCours: 1, enFile: 2, echecsNonVus: 1, terminesNonVus: 1 });
});

test("page périmée : statut différent ou génération inconnue de la page, progression ignorée", () => {
  const run = tache({ statut: "en_cours", cle: "image:x", progression: { valeur: 5, max: 8, etape: null } });
  assert.equal(pageEstPerimee([run], [{ uuid: "x", statut: "en_cours" }]), false);
  assert.equal(pageEstPerimee([{ ...run, statut: "termine" }], [{ uuid: "x", statut: "en_cours" }]), true);
  assert.equal(pageEstPerimee([run], []), true);
  // une génération que l'indicateur ne montre plus n'a aucun effet
  assert.equal(pageEstPerimee([], [{ uuid: "vieille", statut: "termine" }]), false);
});

test("tâches d'un asset : images de cet asset seulement", () => {
  const mien = tache({ statut: "en_cours", assetId: 7 });
  const autre = tache({ statut: "en_cours", assetId: 8 });
  const video = tache({ statut: "en_cours", genre: "video", assetId: null, cle: "video:3" });
  assert.deepEqual(tachesDeAsset([mien, autre, video], 7), [mien]);
});

test("clés : analyse", () => {
  const uuid = "3f2a9c1e-5b7d-4e8a-9c3f-1a2b3c4d5e6f";
  assert.deepEqual(analyserCle(`image:${uuid}`), { genre: "image", ref: uuid });
  assert.deepEqual(analyserCle("video:12"), { genre: "video", ref: "12" });
  // un uuid ou un id mal formé ne doit jamais atteindre la base
  assert.equal(analyserCle("image:abc"), null);
  assert.equal(analyserCle("image:pas-un-uuid"), null);
  assert.equal(analyserCle("video:12; drop"), null);
  assert.equal(analyserCle("video:-3"), null);
  assert.equal(analyserCle("audio:1"), null);
  assert.equal(analyserCle("image:"), null);
  assert.equal(analyserCle("nimporte"), null);
});

test("échecs et annulations : visibles une journée, vus ou non ; terminées non vues restent", () => {
  const jours = (j: number) => il_y_a(j * 24 * 60);
  const echecRecent = tache({ statut: "echoue", finishedAt: il_y_a(60) });
  const echecVieux = tache({ statut: "echoue", finishedAt: il_y_a(25 * 60) });
  const annuleeVieille = tache({ statut: "annulee", finishedAt: il_y_a(25 * 60), vuAt: il_y_a(24 * 60) });
  const annuleeRecente = tache({ statut: "annulee", finishedAt: il_y_a(60) });
  const termineeNonVue = tache({ statut: "termine", finishedAt: jours(3) });
  const termineeVueVieille = tache({ statut: "termine", finishedAt: jours(8), vuAt: jours(7) });
  assert.equal(estAffichable(echecRecent, MAINTENANT), true);
  assert.equal(estAffichable(echecVieux, MAINTENANT), false);
  assert.equal(estAffichable(annuleeVieille, MAINTENANT), false);
  assert.equal(estAffichable(annuleeRecente, MAINTENANT), true);
  assert.equal(estAffichable(termineeNonVue, MAINTENANT), true);
  assert.equal(estAffichable(termineeVueVieille, MAINTENANT), false);
});

test("une annulation n'est pas un échec : pas de point écarlate", () => {
  const r = resumerTaches([tache({ statut: "annulee", finishedAt: il_y_a(5) }), tache({ statut: "echoue", finishedAt: il_y_a(5) })]);
  assert.equal(r.echecsNonVus, 1);
  assert.equal(r.actives, 0);
});

// --- genre « llm » : le GPU est partagé avec ComfyUI (lib/gpu.ts)

test("ordre de la file : image, puis llm, puis vidéo ; chacun en FIFO", () => {
  const video = tache({ statut: "en_attente", genre: "video", cle: "video:1", createdAt: il_y_a(90) });
  const llm2 = tache({ statut: "en_attente", genre: "llm", cle: "llm:b", createdAt: il_y_a(20) });
  const llm1 = tache({ statut: "en_attente", genre: "llm", cle: "llm:a", createdAt: il_y_a(40) });
  const image = tache({ statut: "en_attente", cle: "image:i", createdAt: il_y_a(5) });
  const r = ordonnerTaches([video, llm2, llm1, image], MAINTENANT);
  assert.deepEqual(r.map((x) => x.cle), ["image:i", "llm:a", "llm:b", "video:1"]);
  assert.deepEqual(r.map((x) => x.positionFile), [1, 2, 3, 4]);
});

test("« derrière … » : une tâche d'un autre genre patiente derrière celle qui tient le GPU", () => {
  const enCours = tache({ statut: "en_cours", genre: "llm", cle: "llm:run", startedAt: il_y_a(1) });
  const image = tache({ statut: "en_attente", cle: "image:i" });
  const autreLlm = tache({ statut: "en_attente", genre: "llm", cle: "llm:autre" });
  const r = ordonnerTaches([enCours, image, autreLlm], MAINTENANT);
  const parCle = Object.fromEntries(r.map((x) => [x.cle, x]));
  assert.equal(parCle["image:i"]!.derriere, "llm", "une image attend derrière un appel d'agent");
  assert.equal(parCle["llm:autre"]!.derriere, null, "même genre : le rang suffit");
  assert.equal(parCle["llm:run"]!.derriere, null);

  const videoEnCours = tache({ statut: "en_cours", genre: "video", cle: "video:1", startedAt: il_y_a(1) });
  const llm = tache({ statut: "en_attente", genre: "llm", cle: "llm:x" });
  const r2 = ordonnerTaches([videoEnCours, llm], MAINTENANT);
  assert.equal(r2.find((x) => x.cle === "llm:x")!.derriere, "video");
  assert.equal(r2.find((x) => x.cle === "llm:x")!.derriereVideo, false, "derriereVideo reste réservé aux images");
});

test("clés : llm:<uuid> est reconnue, un uuid mal formé est refusé avant la base", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  assert.deepEqual(analyserCle(`llm:${uuid}`), { genre: "llm", ref: uuid });
  assert.equal(analyserCle("llm:pas-un-uuid"), null);
  assert.equal(analyserCle("llm:123"), null);
  assert.equal(analyserCle("agent:" + uuid), null);
});

test("résumé : un appel LLM actif compte comme tâche active, un échec LLM non vu comme échec non vu", () => {
  const taches = [
    tache({ statut: "en_cours", genre: "llm", cle: "llm:a", jetons: 120 }),
    tache({ statut: "echoue", genre: "llm", cle: "llm:b", finishedAt: il_y_a(5) }),
    tache({ statut: "termine", genre: "llm", cle: "llm:c", finishedAt: il_y_a(5) }),
  ];
  assert.deepEqual(resumerTaches(taches), { actives: 1, enCours: 1, enFile: 0, echecsNonVus: 1, terminesNonVus: 1 });
});

test("un appel LLM annulé ou échoué n'est gardé qu'une journée, comme les autres", () => {
  const vieux = tache({ statut: "annulee", genre: "llm", finishedAt: il_y_a(25 * 60) });
  const recent = tache({ statut: "echoue", genre: "llm", finishedAt: il_y_a(60) });
  assert.equal(estAffichable(vieux, MAINTENANT), false);
  assert.equal(estAffichable(recent, MAINTENANT), true);
});
