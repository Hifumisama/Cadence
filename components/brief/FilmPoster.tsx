"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { uploaderPosterProjet } from "@/app/projects/actions";
import { AfficheZoom } from "@/components/posters/PosterZoom";
import { BoutonAffiche } from "@/components/posters/PosterButton";
import { Poster } from "@/components/ui/Poster";

/** The film's poster, in the brief's identity card: enlarge it with one click, generate one with AI, or upload your own image. The poster's
 * title is the project's. */
export function AfficheFilm({ projectId, titre, src }: { projectId: number; titre: string; src: string | null }) {
  const router = useRouter();
  const [locale, setLocale] = useState<string | null>(src);
  const [envoi, startEnvoi] = useTransition();

  // The image just loaded shows up at once; the server page takes over again as soon as it reloads.
  useEffect(() => setLocale(src), [src]);

  const onChoisir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setLocale(URL.createObjectURL(fichier));
    const formData = new FormData();
    formData.set("fichier", fichier);
    startEnvoi(async () => {
      await uploaderPosterProjet(projectId, formData);
      router.refresh();
    });
  };

  return (
    <div className="bf-affiche-bloc bf-in bf-d3">
      <div className="bf-affiche">
        <AfficheZoom src={locale} titre={titre}>
          <Poster src={locale} titre={titre} cleRepli={`projet:${projectId}`} taille="card" />
        </AfficheZoom>
      </div>
      <div className="bf-affiche-actions">
        <BoutonAffiche cible="projects" id={projectId} className="bf-btn bf-press" libelle="Mettre à jour l'affiche" />
        <label className="bf-btn bf-press">
          {envoi ? "Envoi…" : "Importer une affiche"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChoisir} disabled={envoi} />
        </label>
      </div>
    </div>
  );
}
