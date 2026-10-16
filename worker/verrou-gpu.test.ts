import assert from "node:assert/strict";
import { test } from "node:test";
import { VerrouGpu } from "./verrou-gpu";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("deux tâches partagées tournent en même temps", async () => {
  const v = new VerrouGpu();
  let simultanees = 0;
  let max = 0;
  const tache = () =>
    v.avec(false, async () => {
      simultanees += 1;
      max = Math.max(max, simultanees);
      await pause(20);
      simultanees -= 1;
    });
  await Promise.all([tache(), tache()]);
  assert.equal(max, 2);
});

test("une tâche exclusive attend les partagées, et rien ne démarre à côté d'elle", async () => {
  const v = new VerrouGpu();
  const journal: string[] = [];
  const partagee = (nom: string, ms: number) =>
    v.avec(false, async () => {
      journal.push(`${nom}+`);
      await pause(ms);
      journal.push(`${nom}-`);
    });
  const p1 = partagee("a", 30);
  await pause(5);
  const ex = v.avec(true, async () => {
    journal.push("X+");
    await pause(20);
    journal.push("X-");
  });
  await pause(5);
  const p2 = partagee("b", 5); // arrive pendant l'attente de l'exclusive : passe après elle
  await Promise.all([p1, ex, p2]);
  assert.deepEqual(journal, ["a+", "a-", "X+", "X-", "b+", "b-"]);
});

test("une tâche qui échoue libère le verrou", async () => {
  const v = new VerrouGpu();
  await assert.rejects(v.avec(true, async () => { throw new Error("boum"); }));
  assert.equal(await v.avec(false, async () => "ok"), "ok");
});

test("deux exclusives se suivent, jamais ensemble", async () => {
  const v = new VerrouGpu();
  let dedans = 0;
  let max = 0;
  const tache = () =>
    v.avec(true, async () => {
      dedans += 1;
      max = Math.max(max, dedans);
      await pause(10);
      dedans -= 1;
    });
  await Promise.all([tache(), tache(), tache()]);
  assert.equal(max, 1);
});
