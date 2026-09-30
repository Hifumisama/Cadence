"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";

/** Zone de dépôt : glisser-déposer un fichier dessus, ou cliquer pour le
 * choisir. Le fichier part tel quel vers l'action serveur passée en paramètre
 * (comme DeposerFichier, mais sur une surface plus large). */
export function ZoneDepot({
  action,
  accept,
  children,
  compact = false,
}: {
  action: (formData: FormData) => Promise<void>;
  accept: string;
  children: ReactNode;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = (f: File | undefined) => {
    if (!f) return;
    const fd = new FormData();
    fd.set("fichier", f);
    setErreur(null);
    startTransition(async () => {
      try {
        await action(fd);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec du dépôt.");
      }
    });
  };

  return (
    <div>
      <div
        className={`zone-depot${survol ? " is-survol" : ""}${compact ? " is-compact" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          envoyer(e.dataTransfer.files?.[0]);
        }}
      >
        {pending ? "Envoi…" : children}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            envoyer(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {erreur ? <p className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)", marginTop: 6 }}>{erreur}</p> : null}
    </div>
  );
}
