"use client";






import type { GenerationVue } from "@/lib/assets/queries-generations";
import type { GenreTache } from "@/lib/tasks/tasks";


/** A generation with its rank in the queue and, if it is waiting, the kind of
 * task holding the GPU (a video, an agent call…). */
export type GenerationVivante = GenerationVue & { position: number | null; derriere: GenreTache | null };
