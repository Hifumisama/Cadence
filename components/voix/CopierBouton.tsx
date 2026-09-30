"use client";

import { useState } from "react";

export function CopierBouton({ texte, label = "Copier" }: { texte: string; label?: string }) {
  const [copie, setCopie] = useState(false);
  if (!texte.trim()) return null;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-mini"
      onClick={() => {
        void navigator.clipboard?.writeText(texte).then(() => {
          setCopie(true);
          setTimeout(() => setCopie(false), 1200);
        });
      }}
      title="Copier pour ComfyUI"
    >
      {copie ? "Copié" : label}
    </button>
  );
}
