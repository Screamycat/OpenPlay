# OpenPlay Workspace Rules & Guidelines

## 1. Roadmap & Task Sign-Off (STRICT RULE)
- **NEVER mark or check off any checkbox (`- [x]`) in `ROADMAP.md` unless the user explicitly and specifically instructs you to check that exact item.**
- Even if a feature, fix, or enhancement is 100% completed and verified, leave the checkbox unchecked (`- [ ]`).
- The user maintains sole ownership over roadmap item sign-offs and status completion.
- You may add newly discovered items, backlog tasks, or bugs to `ROADMAP.md` when requested, but always leave them unchecked.

## 2. Repository & Documentation Synchronization
- Keep [README.md](./README.md) and project documentation synchronized with actual repository progress whenever major features, UI components, or architectural changes are implemented.
- Do not let documentation go stale or claim features that do not exist.
- Maintain a respectful, constructive tone towards other open-source projects (such as Playnite) at all times.

## 3. Technical Standards
- Frontend: React 19 + TypeScript + Tailwind CSS.
- Backend: Tauri v2 + Rust (`src-tauri/`) with SQLite storage (`rusqlite`).
- Offline-First: User privacy and local storage must always take precedence.
