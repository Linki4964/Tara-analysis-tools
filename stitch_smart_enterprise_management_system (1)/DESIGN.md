---
name: Midnight Architect
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#353944'
  surface-container-lowest: '#0a0e17'
  surface-container-low: '#171c25'
  surface-container: '#1b2029'
  surface-container-high: '#262a34'
  surface-container-highest: '#30353f'
  on-surface: '#dfe2f0'
  on-surface-variant: '#c4c6d2'
  inverse-surface: '#dfe2f0'
  inverse-on-surface: '#2c303b'
  outline: '#8e909c'
  outline-variant: '#434651'
  surface-tint: '#b0c6ff'
  primary: '#b0c6ff'
  on-primary: '#002d6f'
  primary-container: '#003178'
  on-primary-container: '#7c9ce9'
  inverse-primary: '#3a5ca4'
  secondary: '#c7c6cc'
  on-secondary: '#2f3035'
  secondary-container: '#46464c'
  on-secondary-container: '#b5b4bb'
  tertiary: '#c7c6ca'
  on-tertiary: '#2f3033'
  tertiary-container: '#343538'
  on-tertiary-container: '#9e9da1'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d9e2ff'
  primary-fixed-dim: '#b0c6ff'
  on-primary-fixed: '#001945'
  on-primary-fixed-variant: '#1e448b'
  secondary-fixed: '#e3e2e8'
  secondary-fixed-dim: '#c7c6cc'
  on-secondary-fixed: '#1a1b20'
  on-secondary-fixed-variant: '#46464c'
  tertiary-fixed: '#e3e2e6'
  tertiary-fixed-dim: '#c7c6ca'
  on-tertiary-fixed: '#1a1b1e'
  on-tertiary-fixed-variant: '#46474a'
  background: '#0f131d'
  on-background: '#dfe2f0'
  surface-variant: '#30353f'
  canvas-bg: '#1a1b1e'
  surface-glass: rgba(37, 38, 43, 0.9)
  border-subtle: rgba(255, 255, 255, 0.1)
  node-primary: '#003178'
  grid-dot: '#333333'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  node-title:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
  node-caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  base: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-desktop: 32px
---

## Brand & Style
Midnight Architect is a sophisticated, technical design environment tailored for high-level enterprise and systems engineering. The brand personality is **precise, futuristic, and focused**, evoking the feeling of a mission control center. 

The visual style is a refined blend of **Glassmorphism** and **Technical Minimalism**. It utilizes deep dark backgrounds with vibrant "primary-tinted" highlights to guide the user's eye. The interface prioritizes a "lights-out" workspace where the content (the architecture) remains the focal point, supported by translucent, floating control surfaces that feel lightweight and non-obstructive.

## Colors
The palette is dominated by **Rich Obsidian (#1a1b1e)** and **Deep Charcoal (#25262b)**, creating a low-fatigue environment for long technical sessions. 

- **Primary:** A deep, authoritative blue (#003178) used for active states, primary branding elements, and critical connection paths.
- **Surface Strategy:** Surfaces use a layered approach. The base canvas is the darkest, while floating panels use a slightly lighter charcoal with 90-95% opacity and a high-intensity backdrop blur (20px+) to maintain legibility over complex diagrams.
- **Accents:** High-contrast white text and icons (80-90% opacity) ensure clarity, while subtle borders (10% white) define boundaries without adding visual weight.

## Typography
The system relies exclusively on **Inter** for its neutral, systematic character. The type scale is optimized for information density and readability at various zoom levels.

- **Headlines:** Use semi-bold weights with tighter letter spacing for a modern, "locked-in" appearance.
- **Labels:** Small caps or slightly tracked-out labels (label-md) are used for UI metadata and button text to differentiate from content.
- **Content Hierarchy:** Clear distinction between "Editor UI" (white/grey) and "Canvas Data" (black text on white nodes) to separate the tool from the work.

## Layout & Spacing
The application uses a **Contextual Canvas Layout**. 

- **The Canvas:** An infinite, 24px-interval dot-grid serves as the grounding coordinate system for nodes and connectors.
- **Floating Controls:** UI panels are not docked. They float with a 24px-32px margin from the screen edges, maintaining the "screen-real-estate first" philosophy.
- **Internal Padding:** Panels use a generous 16px (md) or 24px (lg) padding to ensure information doesn't feel cramped, even within a dark UI.
- **Responsive Behavior:** On smaller screens, side panels collapse into bottom sheets or accessible icon-only sidebars to preserve the central viewport.

## Elevation & Depth
Depth is achieved through a combination of **Glassmorphism** and **Soft Shadows**.

- **Level 0 (Canvas):** Flat, textured with a subtle dot grid.
- **Level 1 (Nodes):** High-contrast white surfaces with `shadow-md`. They sit "on top" of the canvas and represent the primary work units.
- **Level 2 (Floating Panels):** Dark, semi-transparent charcoal (#25262b at 90%) with `backdrop-filter: blur(20px)` and `shadow-2xl`. These represent the control layer.
- **Level 3 (Popovers/Tooltips):** Highest elevation, using 100% opaque surfaces or intensified blurs to command focus.

## Shapes
The shape language is **distinctly rounded**, contrasting with the technical nature of the content to make the software feel modern and approachable.

- **Floating Panels:** Use `2xl` (1.5rem) rounding for a "tablet-like" feel.
- **Nodes/Cards:** Use `xl` (0.75rem) or `lg` (0.5rem) rounding.
- **Buttons/Input Bars:** Utilize "Pill" shapes (full rounding) for a tactile, friendly interaction model, especially for AI-driven inputs.

## Components
- **Buttons:** 
    - *Primary:* Pill-shaped, semi-transparent background with a thin white border (20% opacity).
    - *Action Tool:* Circular buttons with high-contrast (Black on White) for the active selection, and low-contrast ghost styles for others.
- **Input Fields (AI Bar):** A central, pill-shaped capsule featuring backdrop-blur and a focus-ring that glows white/blue. Includes internal "chips" for model selection.
- **Nodes:** White containers with a structured vertical layout: Icon block (colored background) -> Title -> Subtitle. Features circular connection ports on the edges.
- **Panels:** Sectioned using `border-b` with 10% white opacity. Headers often feature a subtle "title bar" background (5% white) to distinguish the header from the content area.
- **Component Library Items:** Two-column grid of small, rounded-lg tiles with icons and 10px labels, designed for high-density browsing.