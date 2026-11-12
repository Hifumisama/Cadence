/** Shared / exclusive lock of the graphics card, for the two lanes of the worker (ComfyUI, LLM).
 *
 * - **Shared**: an ordinary task. Both lanes run at the same time when the VRAM allows it.
 * - **Exclusive**: a task that does not fit next to the other lane (the upscale goes up to 13 GB) or the
 *   `serie` mode (everything is exclusive: only one task at a time, as before the two lanes). It waits for the
 *   running tasks to finish, and while it waits, no shared task starts anymore (no starvation).
 * - **Exclusive per group**: exclusives carrying the same group run together (the calls of a project creation share
 *   the server's LLM slots), but remain alone against everything that is not in their group. */

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

  /** An exclusive can enter when no shared task is running anymore, and the exclusives running are from its group. */
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
