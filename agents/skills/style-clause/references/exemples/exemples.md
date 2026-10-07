# Examples — long prompt → short clause

Each example gives the **input** (shortened here) and the **clause** to write. Study what is kept (medium, line, colour, light, texture, the traits that set the style apart) and what is dropped (names, subjects, mood, composition).

## 1. A hand-painted animation look

**Input**

```json
{
  "nom": "Soft Studio Animation Style",
  "descriptor": "A gentle, hand-painted animation illustration style built on soft watercolor-inspired shading that gives every plane a breathable, tender texture, meticulous naturalistic detail applied with unhurried patience, rounded, softened forms carrying quiet sincerity, a hushed, wondrous stillness pervading even the most fantastical scenes, and a nostalgic, wholesome hand-crafted intensity. Influenced by: a famous animation director, a well-known studio's production technique, traditional feature-animation background painting, poster-color gouache background technique."
}
```

**Clause**

```json
{ "clause": "A gentle hand-painted animation look: soft watercolour-like shading, naturalistic painted backgrounds in poster-colour gouache, rounded softened forms and a warm, hushed, slightly faded palette." }
```

Dropped: the director and studio, « stillness pervading fantastical scenes », « quiet sincerity ».

## 2. A grainy film look

**Input**

```json
{
  "nom": "Analog Film Photography",
  "descriptor": "A photographic analog-film style built on visible organic grain, soft halation blooming around bright highlights, muted and slightly shifted colour with lifted blacks, natural available light with unforced contrast, gentle lens softness and vignetting at the edges, and a quiet, observational intensity built on the physical behaviour of film stock."
}
```

**Clause**

```json
{ "clause": "A grainy analog-film look: visible organic grain, soft halation around highlights, muted colour with lifted blacks, natural available light and slight lens softness with edge vignetting." }
```

## 3. A flat graphic look

**Input**

```json
{
  "nom": "Graphic Cel Animation",
  "descriptor": "A graphic cel-animation style built on flat colour fields cut by crisp two-tone shadow shapes, confident variable-weight ink linework defining every contour, hand-painted background plates with restrained detail, limited and deliberate palettes held across scenes, and a clean, hand-drawn intensity built on deliberate economy of line."
}
```

**Clause**

```json
{ "clause": "A graphic cel-animation look: flat colour fields with crisp two-tone shadows, confident variable-weight ink outlines, restrained hand-painted backgrounds and a limited, deliberate palette." }
```

## 4. A 3D look

**Input**

```json
{
  "nom": "Volumetric Digital Illustration",
  "descriptor": "A dimensionally precise digital-illustration style built on smooth, volumetric modeling that reads as fully three-dimensional through simulated geometry and light rather than drawn line, meticulously calculated illumination with soft ambient occlusion settling naturally into every contour, polished specular response giving forms convincing physical depth and weight, confident sculptural construction replacing traditional linework entirely, and a technically precise, computer-generated intensity. Influenced by: real-time 3D-rendering technique, CGI modeling practice, physically based rendering (PBR) method."
}
```

**Clause**

```json
{ "clause": "A precise computer-generated look: smooth volumetric forms read through simulated light, soft ambient occlusion, polished specular highlights and no drawn outlines." }
```

## 5. A style with a named reference in the name

**Input**

```json
{
  "nom": "Van Gogh Style",
  "descriptor": "A turbulent post-impressionist painting style built on thick, directional impasto brushstrokes that swirl and pulse across the whole surface, saturated cobalt and chrome-yellow contrasts, heavy outlined forms, and an urgent, emotionally charged rhythm of marks. Influenced by: Vincent van Gogh, post-impressionist painting tradition, impasto brushwork technique."
}
```

**Clause**

```json
{ "clause": "A post-impressionist oil-painting look: thick directional impasto strokes swirling across every surface, saturated cobalt and chrome-yellow contrasts and heavy dark outlines." }
```

Dropped: the painter's name (even though « post-impressionist » stays: it is a movement, not a name).

## 6. A rejected clause, and why

```json
{ "clause": "Cinematic sweeping shots of a lonely woman in a misty valley, in the manner of a famous painter, evoking deep melancholy." }
```

Rejected: it contains a **subject** (a woman, a valley), a **camera** word (« sweeping shots »), a **name** (« a famous painter ») and a **mood about a scene** (« deep melancholy »), and it says nothing about the rendering. Start again from the medium, the line, the colour, the light and the texture.
