---
name: ui-vision-alignment
description: Aligns with the user on UI/UX vision, element placement, aesthetic density, and interaction behavior before implementing frontend components or modifying user interfaces.
---

# UI/UX Vision & Design Alignment

Use this skill whenever designing, introducing, relocating, or restructuring UI elements, layouts, modals, or user workflows in OpenPlay.

## Core Principle
Never guess UI placement, visual hierarchy, or copy density. Always get on the exact same page with the user before touching code, either during the planning phase or via interactive probing.

---

## The 3 Alignment Checkpoints

Before writing any frontend code for a new element or layout change, ensure clear answers to these three questions:

### 1. Placement & Hierarchy
- **Where does this element live?**
  - Which container, modal, tab, or screen?
  - Does it belong in the main UI, an edit modal, a sidebar, or behind a menu?
  - Avoid UI clutter: If it's a secondary or advanced control, does it bloat the main screen?

### 2. Visual Presentation & Copy Density
- **How should it look?**
  - Is it a button, badge, dropdown, switch, or inline card?
  - **Copy Brevity**: Keep text minimal, calm, and punchy. Avoid excessive explanation paragraphs, redundant badge labels (e.g., unnecessary "Privacy" or status tags), or visual clutter.
  - **Visual Distinction**: How do active, installed, or selected states visually separate themselves (e.g., subtle white borders, distinct opacity, badge styling)?

### 3. Interaction & Function
- **How does it behave?**
  - What happens immediately on click, toggle, or selection?
  - Does it open a modal, toggle a boolean, prompt a confirmation, or trigger a background sync?
  - What feedback or loading state is presented to the user?

---

## How to Align with the User
- Present concise options or a direct inquiry:
  - *"Where are you envisioning this button to live: directly on the game details header, or inside the Edit Game modal under Scores & Playtime?"*
  - *"For the styling, should we keep it minimal with just an icon and label, or a card with description?"*
- If the user's initial request is underspecified, pause and ask rather than guessing.
