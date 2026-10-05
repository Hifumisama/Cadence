import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Ellipsis,
  GripVertical,
  Image as ImageIcone,
  LoaderCircle,
  Minus,
  Music,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  X,
  type LucideProps,
} from "lucide-react";

/** Les icônes de l'app, nommées par ce qu'elles SIGNIFIENT (pas par leur dessin) : changer de jeu d'icônes
 * ne demande de toucher qu'à ce fichier. Remplace les caractères Unicode (✎ ✕ ✦ ⋯ ⠿ ▸ ▾ ♪…), dont le rendu
 * change d'une police et d'un système à l'autre. Un bouton qui n'a qu'une icône garde son `aria-label`. */
const ICONES = {
  agent: Sparkles,
  modifier: Pencil,
  fermer: X,
  ajouter: Plus,
  supprimer: Trash2,
  plus: Ellipsis,
  poignee: GripVertical,
  bas: ChevronDown,
  droite: ChevronRight,
  replierTout: ChevronsDownUp,
  deplierTout: ChevronsUpDown,
  valide: Check,
  alerte: TriangleAlert,
  lecture: Play,
  image: ImageIcone,
  arret: Square,
  musique: Music,
  vide: Circle,
  encours: LoaderCircle,
  fait: CircleCheck,
  echec: CircleX,
  neutre: Minus,
} as const;

export type NomIcone = keyof typeof ICONES;

export function Icone({ nom, taille = 16, className, ...reste }: { nom: NomIcone; taille?: number } & Omit<LucideProps, "size">) {
  const Composant = ICONES[nom];
  return <Composant size={taille} strokeWidth={1.75} aria-hidden="true" focusable="false" className={className ? `icone ${className}` : "icone"} {...reste} />;
}
