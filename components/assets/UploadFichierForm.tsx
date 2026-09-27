"use client";

import { useRef, useState, useTransition } from "react";
import { uploaderFichierAsset } from "@/app/assets/actions";

export function UploadFichierForm({ assetId, code }: { assetId: number; code: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [nomChoisi, setNomChoisi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const action = (formData: FormData) => {
    setErreur(null);
    startTransition(async () => {
      try {
        await uploaderFichierAsset(assetId, code, formData);
        formRef.current?.reset();
        setNomChoisi(null);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'upload.");
      }
    });
  };

  return (
    <div>
      <form ref={formRef} action={action} className="upload-fichier">
        <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
          {pending ? "Envoi..." : nomChoisi ?? "Choisir un fichier"}
          <input
            type="file"
            name="fichier"
            accept="image/*,audio/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              setNomChoisi(f?.name ?? null);
              if (f) formRef.current?.requestSubmit();
            }}
          />
        </label>
      </form>
      {erreur ? <p className="tiny-note" style={{ color: "var(--ecarlate-glow)", marginTop: 6 }}>{erreur}</p> : null}
    </div>
  );
}
