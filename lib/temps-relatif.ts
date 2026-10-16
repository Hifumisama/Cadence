/** « à l'instant », « il y a 4 min », « hier » : l'âge d'un essai pour le journal. Pur : testé dans `temps-relatif.test.ts`. */
export function ilYa(depuis: Date | string | number, maintenant: Date | number = Date.now()): string {
  const t = new Date(depuis).getTime();
  const n = typeof maintenant === "number" ? maintenant : maintenant.getTime();
  const s = Math.max(0, Math.round((n - t) / 1000));
  if (s < 45) return "à l'instant";
  const min = Math.round(s / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return "hier";
  if (j < 30) return `il y a ${j} jours`;
  return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
