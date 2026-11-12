import { ne } from "drizzle-orm";
import { assets } from "../../db/schema";
import { TYPE_AFFICHE } from "../posters/posters";

/** To add to ANY read « the assets of a project » (registry, totals, agent contexts, generation sources…):
 * the presentation posters are implementation assets, hidden from the registry (see lib/posters/posters.ts).
 * Reads by id, by code or by precise type do not need it. */
export const horsAffiches = ne(assets.type, TYPE_AFFICHE);
