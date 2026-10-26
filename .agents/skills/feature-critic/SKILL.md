---
name: feature-critic
description: Critically reviews feature proposals, architectural designs, and system plans before implementation. Stress-tests failure modes, ethical & privacy impacts, offline-first compliance, and offers superior, constructive solutions.
---

# Feature & Architecture Critic

Use this skill when evaluating new feature proposals, system architecture decisions, data storage changes, or third-party integrations in OpenPlay.

## When to Activate (Judicious Triggering)
- **Activate for**:
  - New feature suggestions and roadmap items (e.g., cloud sync, online saving, remote backups).
  - Data storage, persistence, or migration designs.
  - Integration with external web services or accounts.
  - Significant architectural or structural changes.
- **Do NOT activate for**:
  - Trivial UI polish, color adjustments, or text tweaks.
  - Routine bug fixes with obvious root causes.
  - Direct user-instructed code refinements.

## The 4 Review Pillars

Whenever evaluating an idea, analyze and respond along these four dimensions:

### 1. Failure Modes & Breakpoints
- **Where can this break?** Network drops, race conditions, partial writes, corrupted states, schema mismatches, rate limits (e.g. HTTP 429), or OS filesystem differences.
- **Edge Cases**: Unauthenticated states, unexpected characters/encodings, large payload limits, background process terminations.

### 2. Ethics, Privacy & Trust
- **Offline-First Invariant**: User privacy and local storage must always take precedence. Does this proposal send unencrypted user data to the cloud? Does it require unnecessary accounts?
- **User Agency**: Does the user maintain 100% control, ownership, and visibility over what is stored or transmitted?

### 3. Architectural Soundness & Trade-offs
- **Tech Stack Fit**: Does this naturally fit Tauri v2 + Rust + SQLite + React 19, or does it introduce unneeded external bloat?
- **Maintenance Debt**: What ongoing maintenance burden does this introduce? Is the complexity justified by the payoff?

### 4. Better Alternatives & Constructive Solutions
- **The Construction Mandate**: Every identified risk or critique **must** be paired with a concrete, superior solution or mitigation strategy.
- Can we achieve 90% of the user benefit with a simpler local-first or standard approach?

## Response Structure
When conducting a review, structure the response clearly:
1. **The Core Verdict**: Brief, candid assessment of the proposal's viability (Sound / Needs Revision / High Risk).
2. **Critical Factors & Risks**: Bulleted points addressing break points, privacy, or architectural issues.
3. **Recommended Solution / Better Way**: Concrete, actionable implementation path that resolves the criticisms.
