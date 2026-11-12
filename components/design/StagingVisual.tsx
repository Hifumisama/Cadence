import { apercuDe, type Picto } from "@/lib/h3ir/preview-style";

/** One pictogram per camera gesture or ambience (viewBox 160 x 90, strokes only: the colour comes from the CSS, `.cn-picto`). Deliberately simple drawings, without AI. */
const DESSINS: Record<Picto, React.ReactNode> = {
  aucun: <rect x="30" y="18" width="100" height="54" strokeDasharray="5 5" />,
  // Steps: the pose jumps from one notch to the next (stop-motion).
  pas: (
    <>
      <path d="M20 66h28v-14h28v-14h28v-14h28" />
      <circle cx="34" cy="44" r="6" />
      <circle cx="90" cy="16" r="6" opacity="0.5" />
    </>
  ),
  eclair: <path d="M88 8 56 50h24l-8 32 36-46H84z" />,
  vent: (
    <>
      <path d="M20 32c20-14 30 14 50 0s30-14 50 0" />
      <path d="M32 50c20-14 30 14 50 0s30-14 46 0" />
      <path d="M20 68c20-14 30 14 50 0" />
    </>
  ),
  orbite: (
    <>
      <ellipse cx="80" cy="45" rx="56" ry="22" />
      <circle cx="80" cy="45" r="6" />
      <circle cx="132" cy="38" r="4" />
    </>
  ),
  // A wide fixed shot: a frame and a tripod, two silhouettes.
  fixe: (
    <>
      <rect x="28" y="12" width="104" height="52" />
      <path d="M80 64v14M64 80l16-16 16 16" />
      <circle cx="62" cy="40" r="5" />
      <circle cx="98" cy="40" r="5" />
    </>
  ),
  // A subject pushed to the edge of a large dark frame.
  ombre: (
    <>
      <rect x="22" y="12" width="116" height="66" />
      <circle cx="40" cy="46" r="6" />
      <path d="M40 52v18" />
    </>
  ),
  travelling: (
    <>
      <path d="M20 45h92" />
      <path d="M100 32l16 13-16 13" />
      <rect x="116" y="30" width="24" height="30" />
    </>
  ),
  symetrie: (
    <>
      <path d="M80 8v74" strokeDasharray="4 4" />
      <rect x="38" y="24" width="30" height="42" />
      <rect x="92" y="24" width="30" height="42" />
      <circle cx="80" cy="45" r="5" />
    </>
  ),
  // A tiny silhouette in a very large space.
  echelle: (
    <>
      <path d="M14 70h132" />
      <path d="M14 70 60 30l30 24 24-18 32 34" />
      <circle cx="78" cy="62" r="2.5" />
    </>
  ),
  manuel: (
    <>
      <path d="M30 20l6-4 6 5 6-5 6 4M30 70l6 4 6-5 6 5 6-4" />
      <rect x="62" y="26" width="68" height="40" transform="rotate(-4 96 46)" />
    </>
  ),
  flou: (
    <>
      <path d="M20 30h110M34 45h112M20 60h96" />
      <circle cx="132" cy="30" r="5" />
      <circle cx="40" cy="60" r="5" />
    </>
  ),
  rayons: (
    <>
      <circle cx="80" cy="45" r="12" />
      <path d="M80 8v14M80 68v14M30 45h22M108 45h22M45 18l10 10M115 18l-10 10M45 72l10-10M115 72l-10-10" />
    </>
  ),
};

/** The visual of a style card: the demo's fixed image when it exists (`affiche`), otherwise the choice's pictogram. Always decorative (the title already gives the name). */
export function VisuelMise({ id, affiche }: { id: string; affiche?: string | null }) {
  const a = apercuDe(id);
  return (
    <span className={`cn-mise-visuel${affiche ? " has-image" : ""}`} aria-hidden="true">
      {affiche ? (
        // eslint-disable-next-line @next/next/no-img-element -- poster served by /api/media, already reduced (768 px)
        <img src={affiche} alt="" loading="lazy" decoding="async" />
      ) : (
        <svg className="cn-picto" viewBox="0 0 160 90" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          {DESSINS[a?.picto ?? "aucun"]}
        </svg>
      )}
    </span>
  );
}

/** The three keywords of a choice, as small pills (text only: colour is never the only signal). <i> elements inside a <span>: the content of a <button> must stay inline text. */
export function MotsMise({ id }: { id: string }) {
  const a = apercuDe(id);
  if (!a) return null;
  return (
    <span className="cn-mots">
      {a.mots.map((m) => (
        <i key={m}>{m}</i>
      ))}
    </span>
  );
}
