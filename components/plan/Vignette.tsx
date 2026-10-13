/** La première image d'une vidéo du stockage (`#t=0.1`), comme la pellicule d'avant : aucune vignette n'est générée ni stockée.
 * Sans vidéo (plan sans rendu, essai en file ou échoué) : un cadre vide hachuré. */
export function Vignette({ src }: { src: string | null }) {
  if (!src) return <span className="tm-vue-vide" aria-hidden="true" />;
  return <video src={`${src}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" />;
}

/** URL de service d'un rendu du stockage (chemin relatif à MEDIA_ROOT). */
export const srcRendu = (chemin: string | null | undefined): string | null => (chemin ? `/api/media/${chemin}` : null);
