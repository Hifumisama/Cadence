"use client";

import { useRef, useState, useTransition } from "react";

/** Bouton de dépôt d'un fichier produit à la main dans ComfyUI (prise,
 * candidat, rendu T1). Même geste que UploadFichierForm du registre, mais
 * l'action cible est passée en paramètre. Un dépôt remplace le précédent. */
export function DeposerFichier({
  action,
  accept = "audio/*",
  label = "Déposer",
  remplacer = false,
  disabled = false,
  decritPar,
}: {
  action: (formData: FormData) => Promise<void>;
  accept?: string;
  label?: string;
  remplacer?: boolean;
  /** Désactivé : la raison s'affiche à côté (id passé dans `decritPar`). */
  disabled?: boolean;
  decritPar?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <span className="deposer">
      <form
        ref={formRef}
        action={(fd) => {
          setErreur(null);
          startTransition(async () => {
            try {
              await action(fd);
              formRef.current?.reset();
            } catch (e) {
              setErreur(e instanceof Error ? e.message : "Échec du dépôt.");
            }
          });
        }}
      >
        <label className="btn btn-ghost btn-mini" aria-disabled={disabled || undefined} aria-describedby={disabled ? decritPar : undefined} style={disabled ? { cursor: "not-allowed", opacity: 0.45, pointerEvents: "none" } : { cursor: "pointer" }}>
          {pending ? "Envoi…" : remplacer ? "Remplacer" : label}
          <input
            type="file"
            name="fichier"
            accept={accept}
            disabled={disabled}
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.[0]) formRef.current?.requestSubmit();
            }}
          />
        </label>
      </form>
      {erreur ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</span> : null}
    </span>
  );
}
