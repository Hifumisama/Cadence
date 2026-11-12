/** Limiteur de débit : renvoie true au plus une fois par `intervalleMs`. */
export function limiteur(intervalleMs: number, maintenant: () => number = Date.now) {
  let dernier = -Infinity;
  return (): boolean => {
    const t = maintenant();
    if (t - dernier < intervalleMs) return false;
    dernier = t;
    return true;
  };
}

