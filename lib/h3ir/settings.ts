/** Open H3 IR creativity, reduced to ONE choice per clip: « temps fort » or not (ADR 0001, bench of 2026-11-24).
 *
 * - Without a temps fort, a clip compiles at « balanced » (the package's default and the recommended setting, T13 of 2026-11-17).
 * - A temps fort is compiled at « extreme »: every choice pushed to its maximum (wide and fast camera, hard contrasts, framing at the far end). The screenwriter
 *   proposes the clip that carries the film's strong moment, and the user can switch it on or off on any clip.
 *
 * There is no project-level nor scene-level setting: extreme on a whole film was measured and lost (T13), « bold » is indistinguishable from « balanced »
 * by design of the package (h3ir/creativity.py), « restrained » only differs by the music, which the design's music intention now decides
 * (lib/h3ir/music.ts). The staging style (directors and custom profiles) was removed: it lost 4 pairs out of 4 in the blind bench.
 * The value is stored in `plans.creativite`: `"extreme"` = temps fort, anything else (null, `"balanced"`) = a normal clip. Pure, importable client-side. */

export const CREATIVITES = ["balanced", "extreme"] as const;
export type Creativite = (typeof CREATIVITES)[number];
export const CREATIVITE_PAR_DEFAUT: Creativite = "balanced";
/** The stored value of a temps fort. */
export const CREATIVITE_TEMPS_FORT: Creativite = "extreme";

export const LIBELLE_TEMPS_FORT = "Temps fort";
/** What a temps fort does, in one sentence for the interface. */
export const AIDE_TEMPS_FORT =
  "Pousse chaque choix au maximum : caméra ample et rapide, cadrages francs, contrastes durs. À réserver aux plans les plus forts du film, pas à tous.";

export const estCreativite = (v: unknown): v is Creativite => typeof v === "string" && (CREATIVITES as readonly string[]).includes(v);

/** Is this stored value a temps fort? */
export const estTempsFort = (v: string | null | undefined): boolean => v === CREATIVITE_TEMPS_FORT;

/** The creativity a clip is compiled at, from what it stores: temps fort → extreme, anything else → balanced. */
export const creativiteDuPlan = (v: string | null | undefined): Creativite => (estTempsFort(v) ? CREATIVITE_TEMPS_FORT : CREATIVITE_PAR_DEFAUT);

/** What to store for a clip: `"extreme"` for a temps fort, `null` otherwise. */
export const valeurTempsFort = (tempsFort: boolean): Creativite | null => (tempsFort ? CREATIVITE_TEMPS_FORT : null);
