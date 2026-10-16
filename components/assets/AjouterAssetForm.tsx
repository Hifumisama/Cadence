"use client";

import "./assets.css";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { creerAssetRapide } from "@/app/assets/actions";
import { PREFIXE_PAR_TYPE, TYPES_CREABLES, construireCode, type TypeAsset } from "@/lib/assetCode";
import { LIBELLE_TYPE_ASSET } from "@/lib/registre-types";
import { Icone, type NomIcone } from "@/components/ui/Icone";

/** Ce que chaque type veut dire, en une phrase, et un exemple de nom : le choix se fait sur des cartes, pas dans une liste. */
const TYPES: Record<TypeAsset, { icone: NomIcone; indice: string; exemple: string }> = {
  personnage: { icone: "personnage", indice: "Un visage, une silhouette, une tenue", exemple: "Maya la danseuse" },
  decor: { icone: "decor", indice: "Un lieu, une ambiance", exemple: "Le phare de sel" },
  prop: { icone: "prop", indice: "Un objet que l'on voit à l'écran", exemple: "La clef de bronze" },
  vfx: { icone: "effet", indice: "Feu, fumée, magie, lumière", exemple: "Éclairs rouges" },
  sfx: { icone: "son", indice: "Un bruitage, une ambiance sonore", exemple: "Pas sur le gravier" },
  keyframe: { icone: "keyframe", indice: "Une image clé, un cadrage précis", exemple: "Plan d'ouverture" },
  oth: { icone: "autre", indice: "Tout ce qui ne rentre pas ailleurs", exemple: "Affiche du festival" },
};

/** « Nouveau sujet » : on choisit ce qu'on crée, on lui donne un nom, et on arrive sur la fiche (image, description et génération s'y
 * règlent). Le nom devient le `label` ; l'identifiant (le code) en est tiré une fois pour toutes, sans que l'utilisateur ait à le voir. */
export function AjouterAssetForm({ projectId }: { projectId: number }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeAsset>("personnage");
  const [nom, setNom] = useState("");
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const code = construireCode(type, nom);
  const valide = nom.trim() !== "" && code !== PREFIXE_PAR_TYPE[type];

  const fermer = () => {
    setOuvert(false);
    setNom("");
    setErreur(null);
  };

  // Échap ferme la fenêtre.
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => e.key === "Escape" && !pending && fermer();
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [ouvert, pending]);

  const creer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valide || pending) return;
    setErreur(null);
    startTransition(async () => {
      const r = await creerAssetRapide(projectId, type, nom);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      router.push(`/p/${projectId}/assets/${r.code}`);
    });
  };

  // Flèches : on passe d'une carte à l'autre sans quitter le clavier.
  const surFleche = (e: React.KeyboardEvent) => {
    const pas = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const suivant = TYPES_CREABLES[(TYPES_CREABLES.indexOf(type) + pas + TYPES_CREABLES.length) % TYPES_CREABLES.length]!;
    setType(suivant);
    (e.currentTarget.querySelector(`[data-type="${suivant}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <>
      <button className="btn btn-gold" type="button" onClick={() => setOuvert(true)}>
        <Icone nom="ajouter" taille={15} /> Nouveau sujet
      </button>
      {ouvert ? (
        <div className="modal-overlay as-nouveau-fond" onClick={() => !pending && fermer()}>
          <div className="modal-box as-nouveau" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="as-nouveau-titre">
            <button className="modal-close as-nouveau-fermer" type="button" onClick={fermer} aria-label="Fermer" disabled={pending}>
              <Icone nom="fermer" />
            </button>
            <form onSubmit={creer} className="as-nouveau-form">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>
                  Nouveau sujet
                </p>
                <h2 id="as-nouveau-titre">Qu&rsquo;est-ce qu&rsquo;on crée&nbsp;?</h2>
              </div>

              <div className="as-nouveau-types" role="radiogroup" aria-label="Type du sujet" onKeyDown={surFleche}>
                {TYPES_CREABLES.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    tabIndex={type === t ? 0 : -1}
                    data-type={t}
                    className="as-type"
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={() => setType(t)}
                  >
                    <Icone nom={TYPES[t].icone} taille={22} />
                    <b>{LIBELLE_TYPE_ASSET[t] ?? t}</b>
                    <small>{TYPES[t].indice}</small>
                  </button>
                ))}
              </div>

              <label className="as-nouveau-nom">
                <span>Son nom</span>
                <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={TYPES[type].exemple} autoFocus autoComplete="off" maxLength={120} />
              </label>

              {erreur ? (
                <p className="bf-erreur" role="alert">
                  {erreur}
                </p>
              ) : null}

              <div className="as-nouveau-pied">
                <button className="btn btn-gold" type="submit" disabled={pending || !valide}>
                  {pending ? "Création…" : "Créer et ouvrir la fiche"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={fermer} disabled={pending}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
