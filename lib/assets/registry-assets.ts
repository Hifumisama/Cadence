/** Le registre est à UN SEUL niveau (2026-10-03) : un asset est un master, ou un dérivé d'un master. Les états
 * d'un même décor ou les tenues d'un personnage sont des dérivés du même master, jamais une chaîne.
 * `parentDe` lit le parent d'un asset (null pour un master) ; renvoie l'id du master à retenir quand on
 * demande à dériver de `parentId` (qui peut lui-même être un dérivé). Borné : une boucle de données
 * abîmées ne bloque rien, elle s'arrête. */
export async function masterDe(parentId: number, parentDe: (id: number) => Promise<number | null>): Promise<number> {
  let courant = parentId;
  for (let i = 0; i < 20; i++) {
    const p = await parentDe(courant);
    if (p == null || p === courant) return courant;
    courant = p;
  }
  return courant;
}
