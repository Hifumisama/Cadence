/** The registry is at ONE SINGLE level (2026-10-03): an asset is a master, or a derivative of a master. The states
 * of the same set or the costumes of a character are derivatives of the same master, never a chain.
 * `parentDe` reads an asset's parent (null for a master); returns the id of the master to keep when
 * asked to derive from `parentId` (which may itself be a derivative). Bounded: a loop of damaged data
 * blocks nothing, it stops. */
export async function masterDe(parentId: number, parentDe: (id: number) => Promise<number | null>): Promise<number> {
  let courant = parentId;
  for (let i = 0; i < 20; i++) {
    const p = await parentDe(courant);
    if (p == null || p === courant) return courant;
    courant = p;
  }
  return courant;
}
