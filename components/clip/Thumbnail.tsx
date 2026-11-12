/** The first frame of a video from storage (`#t=0.1`), like the earlier filmstrip: no thumbnail is generated or stored.
 * Without a video (clip without a render, attempt queued or failed): an empty hatched frame. */
export function Vignette({ src }: { src: string | null }) {
  if (!src) return <span className="tm-vue-vide" aria-hidden="true" />;
  return <video src={`${src}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" />;
}

/** Service URL of a render from storage (path relative to MEDIA_ROOT). */
export const srcRendu = (chemin: string | null | undefined): string | null => (chemin ? `/api/media/${chemin}` : null);
