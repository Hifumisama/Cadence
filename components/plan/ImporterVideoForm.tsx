"use client";

import { useRef, useState, useTransition } from "react";
import { importerVideoExistante } from "@/app/plans/actions";

export function ImporterVideoForm({ planId }: { planId: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const action = (formData: FormData) => {
    setErreur(null);
    startTransition(async () => {
      try {
        await importerVideoExistante(planId, formData);
        formRef.current?.reset();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'import.");
      }
    });
  };

  return (
    <div>
      <form ref={formRef} action={action}>
        <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
          {pending ? "Envoi..." : "Plan déjà tourné — importer la vidéo"}
          <input
            type="file"
            name="fichier"
            accept="video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.[0]) formRef.current?.requestSubmit();
            }}
          />
        </label>
      </form>
      {erreur ? (
        <p className="tiny-note" style={{ color: "var(--ecarlate-glow)", marginTop: 6 }}>
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
