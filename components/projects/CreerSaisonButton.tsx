"use client";

import { useTransition } from "react";
import { creerSaison } from "@/app/projects/actions";

export function CreerSaisonButton({ projectId }: { projectId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button className="btn btn-gold" type="button" disabled={pending} onClick={() => startTransition(() => creerSaison(projectId))}>
      {pending ? "..." : "+ Saison"}
    </button>
  );
}
