/** Rate limiter: returns true at most once per `intervalleMs`. */
export function limiteur(intervalleMs: number, maintenant: () => number = Date.now) {
  let dernier = -Infinity;
  return (): boolean => {
    const t = maintenant();
    if (t - dernier < intervalleMs) return false;
    dernier = t;
    return true;
  };
}

