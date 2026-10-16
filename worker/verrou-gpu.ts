/** Verrou partagé / exclusif de la carte graphique, pour les deux voies du worker (ComfyUI, LLM).
 *
 * - **Partagé** : une tâche ordinaire. Les deux voies tournent en même temps quand la VRAM le permet.
 * - **Exclusif** : une tâche qui ne tient pas à côté de l'autre voie (l'upscale monte à 13 Go) ou le mode
 *   `serie` (tout est exclusif : une seule tâche à la fois, comme avant les deux voies). Il attend que les
 *   tâches en cours finissent, et pendant qu'il attend, plus aucune tâche partagée ne démarre (pas de famine). */

export class VerrouGpu {
  private partages = 0;
  private exclusifEnCours = false;
  private exclusifsEnAttente = 0;
  private reveil: Array<() => void> = [];

  private attendre(): Promise<void> {
    return new Promise((resolve) => this.reveil.push(resolve));
  }

  private reveiller(): void {
    const files = this.reveil;
    this.reveil = [];
    for (const r of files) r();
  }

  async avec<T>(exclusif: boolean, travail: () => Promise<T>): Promise<T> {
    if (exclusif) {
      this.exclusifsEnAttente += 1;
      while (this.exclusifEnCours || this.partages > 0) await this.attendre();
      this.exclusifsEnAttente -= 1;
      this.exclusifEnCours = true;
    } else {
      while (this.exclusifEnCours || this.exclusifsEnAttente > 0) await this.attendre();
      this.partages += 1;
    }
    try {
      return await travail();
    } finally {
      if (exclusif) this.exclusifEnCours = false;
      else this.partages -= 1;
      this.reveiller();
    }
  }
}
