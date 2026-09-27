const CLASSES: Record<string, string> = {
  brouillon: "b-brouillon",
  en_attente: "b-attente",
  en_cours: "b-encours",
  echoue: "b-echoue",
  rejoue: "b-rejoue",
  previsualise: "b-previsualise",
  termine: "b-termine",
};

const LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  en_attente: "En attente",
  en_cours: "En cours",
  echoue: "Échoué",
  rejoue: "Rejoué",
  previsualise: "Prévisualisé",
  termine: "Terminé",
};

const NODE_CLASSES: Record<string, string> = {
  brouillon: "st-brouillon",
  en_attente: "st-attente",
  en_cours: "st-encours",
  echoue: "st-echoue",
  rejoue: "st-rejoue",
  previsualise: "st-previsualise",
  termine: "st-termine",
};

export function statusNodeClass(statut: string): string {
  return NODE_CLASSES[statut] ?? "st-attente";
}

export function StatusBadge({ statut }: { statut: string }) {
  return (
    <span className={`badge ${CLASSES[statut] ?? CLASSES.en_attente}`}>
      <i />
      {LABELS[statut] ?? statut}
    </span>
  );
}
