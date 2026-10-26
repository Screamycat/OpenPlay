# OpenPlay Workspace Rules & Guidelines

## 1. Roadmap is STRICTLY READ-ONLY (STRICT RULE)
- **NEVER edit, overwrite, modify, append to, or check off checkboxes in `ROADMAP.md`.** It is strictly **READ-ONLY** for the assistant at all times.
- The user maintains sole ownership over editing, adding tasks/bugs, and signing off checkboxes in `ROADMAP.md`.
- Never touch `ROADMAP.md` under any circumstances; report any findings, proposed additions, or completions directly to the user in chat.

## 2. Repository & Documentation Synchronization
- Keep [README.md](./README.md) and project documentation synchronized with actual repository progress whenever major features, UI components, or architectural changes are implemented.
- Do not let documentation go stale or claim features that do not exist.
- Maintain a respectful, constructive tone towards other open-source projects (such as Playnite) at all times.

## 3. Technical Standards
- Frontend: React 19 + TypeScript + Tailwind CSS.
- Backend: Tauri v2 + Rust (`src-tauri/`) with SQLite storage (`rusqlite`).
- Offline-First: User privacy and local storage must always take precedence.

## 4. Constructive Critical Review (Feature & Architectural Planning)
- When discussing new feature concepts, cloud services, data syncing, or architectural changes, do not simply agree and immediately code.
- Exercise engineering judgment to stress-test the idea: point out where things could break, potential privacy/offline-first conflicts, and whether a better or simpler approach exists.
- **Always accompany every critique with a viable, concrete alternative or solution**.
- Reserve this critical review for feature planning and architectural discussions; do not slow down minor UI tweaks or straightforward bugfixes.

## 5. UI/UX Design & Vision Alignment (STRICT RULE)
- **Always align on the user's vision before implementing new UI designs, element placements, or UX workflows**, unless explicit placement and styling instructions were already provided.
- Proactively clarify:
  1. **Placement**: Which screen, modal, or tab it belongs in (keeping the main view clean and unbloated).
  2. **Appearance & Copy**: How it looks (preferring minimal, calm, clean text without redundant pills or wordy explanations).
  3. **Interaction**: What happens on click/toggle and how states (e.g., active, installed, cloud) are visually differentiated.
- Use planning or interactive questioning to ensure mutual consensus before coding frontend elements.
