/** Verrou partagé / exclusif de la carte graphique, pour les deux voies du worker (ComfyUI, LLM).
 *
 * - **Partagé** : une tâche ordinaire. Les deux voies tournent en même temps quand la VRAM le permet.
 * - **Exclusif** : une tâche qui ne tient pas à côté de l'autre voie (l'upscale monte à 13 Go) ou le mode
 *   `serie` (tout est exclusif : une seule tâche à la fois, comme avant les deux voies). Il attend que les
 *   tâches en cours finissent, et pendant qu'il attend, plus aucune tâche partagée ne démarre (pas de famine).
 * - **Exclusif de groupe** : des exclusives qui portent le même groupe tournent ensemble (les appels d'une création de
 *   projet se partagent les slots du serveur LLM), mais restent seules face à tout ce qui n'est pas de leur groupe. */

export class VerrouGpu {
  private partages = 0;
  private exclusifsEnCours = 0;
  private groupeEnCours: string | null = null;
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

  /** Une exclusive peut entrer quand plus aucune partagée ne tourne, et que les exclusives en cours sont de son groupe. */
  private exclusifPeutEntrer(groupe: string | null): boolean {
    if (this.partages > 0) return false;
    if (this.exclusifsEnCours === 0) return true;
    return groupe != null && groupe === this.groupeEnCours;
  }

  async avec<T>(exclusif: boolean, travail: () => Promise<T>, groupe: string | null = null): Promise<T> {
    if (exclusif) {
      this.exclusifsEnAttente += 1;
      while (!this.exclusifPeutEntrer(groupe)) await this.attendre();
      this.exclusifsEnAttente -= 1;
      this.exclusifsEnCours += 1;
      this.groupeEnCours = groupe;
    } else {
      while (this.exclusifsEnCours > 0 || this.exclusifsEnAttente > 0) await this.attendre();
      this.partages += 1;
    }
    try {
      return await travail();
    } finally {
      if (exclusif) {
        this.exclusifsEnCours -= 1;
        if (this.exclusifsEnCours === 0) this.groupeEnCours = null;
      } else this.partages -= 1;
      this.reveiller();
    }
  }
}
