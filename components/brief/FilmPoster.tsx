"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { uploaderPosterProjet } from "@/app/projects/actions";
import { AfficheZoom } from "@/components/posters/PosterZoom";
import { BoutonAffiche } from "@/components/posters/PosterButton";
import { Poster } from "@/components/ui/Poster";

/** L'affiche du film, dans la carte d'identité du brief : on l'agrandit d'un clic, on en génère une avec l'IA, ou on charge sa propre image. Le titre
 * de l'affiche est celui du projet. */
export function AfficheFilm({ projectId, titre, src }: { projectId: number; titre: string; src: string | null }) {
  const router = useRouter();
  const [locale, setLocale] = useState<string | null>(src);
  const [envoi, startEnvoi] = useTransition();

  // L'image qui vient d'être chargée s'affiche tout de suite ; la page serveur reprend la main dès qu'elle se recharge.
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
