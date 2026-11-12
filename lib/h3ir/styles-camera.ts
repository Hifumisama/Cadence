/** The 7 « staging style » profiles of Open H3 IR (`director`, h3ir/director.py): each is a complete staging « taste » (camera, framing, light, palette, acting, sounds, music)
 * that only fills what the request and the reference images do not settle (h3ir/director.py). The director's name is never sent to the model, only the traits.
 * File with no import at all, on purpose: the interface (client component) reads it, and lib/h3ir/brief.ts draws from server code (node:child_process). */
export const STYLES_CAMERA = ["cameron", "tarantino", "anderson", "villeneuve", "bigelow", "wong", "spielberg"] as const;
