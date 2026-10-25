---
name: repo-maintainer
description: >-
  Maintains documentation fidelity and repository hygiene for OpenPlay.
  Use when wrapping up tasks, implementing new features, updating README.md,
  or managing project roadmaps and architectural documentation.
---

# Repository Maintainer Skill for OpenPlay

Use this skill to keep the OpenPlay repository, documentation, and progress trackers perfectly synchronized with the actual codebase.

## 🚨 Non-Negotiable Rule: Roadmap Checkboxes
- **NEVER check any checkbox (`- [x]`) in `ROADMAP.md` unless the user explicitly and directly requests that specific item be checked off.**
- Even if a feature is 100% completed, tested, and running, leave the checkbox as `- [ ]`. Task completion sign-off belongs exclusively to the user.
- If new tasks, bugs, or ideas are identified during development, you may add them to the Quick Inbox or appropriate section in `ROADMAP.md` as unchecked items (`- [ ]`).

---

## 📋 Routine Maintenance Checklist

Whenever significant features, architectural changes, or settings are implemented:

### 1. Assess Documentation Impact
- Check if new features affect:
  - **Feature Matrix** in `README.md` (e.g., new integrations, platform support, settings tabs).
  - **Tech Stack / Architecture Diagram** in `README.md`.
  - **Prerequisites or Run Instructions** if dependencies or build targets changed.

### 2. Verify Documentation Accuracy
- Ensure documentation describes what actually works in the codebase.
- Maintain respectful, collaborative language toward the broader open-source gaming community (Playnite, Lutris, Heroic, Steam).
- Never claim features that have not been implemented or planned.

### 3. Git & Worktree Hygiene
- Check `git status` and `git diff` before committing to ensure no unintended files or scratch data are staged.
- Ensure all Rust code compiles without errors (`cargo check` in `src-tauri` if backend changes were made).
- Ensure TypeScript compiles cleanly (`npm run build` or Vite build check).
