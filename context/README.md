# Covista Context — Workspace Memory System

## Layout

```
context/
├── covista-master.md                       ← canonical project state (mirrors copilot memory)
├── covista_full_context_chatgptderived_v2.md ← auxiliary condensed system spec (exec-level reference)
├── daily/
│   └── covista_YYYY-MM-DD.md               ← detailed day-of notes (one per work day)
└── README.md                               ← this file
```

**Auxiliary spec** (`covista_full_context_chatgptderived_v2.md`): a stable, condensed
15-section reference (architecture, data model, checklist mapping, FAFSA logic,
edge cases). Good for handoffs and exec-level review. Not a working file —
do not edit during normal session work; update only when the underlying
contract or architecture genuinely changes.

## Rules

1. **`covista-master.md` is the single source of truth.**
   - Long-form, append-only. Most recent block at the top.
   - Mirrors `/memories/repo/covista-context.md` (Copilot's memory store at
     `C:\Users\neosu\AppData\Roaming\Code\User\workspaceStorage\a0cf2d30d331fea7c4bdaf4729394a31\GitHub.copilot-chat\memory-tool\memories\repo\covista-context.md`).
   - Whenever Copilot updates memory, mirror the change here (or vice versa).

2. **`daily/covista_YYYY-MM-DD.md` is the day's detailed report.**
   - Drafts, exec summaries, paste-ready replies, decisions, links to artifacts.
   - Lives forever — historical record. Not summarized away.
   - File name: ISO date `covista_2026-04-28.md`.

3. **Rollup flow (end of each work day):**
   - Day's events captured live in `daily/covista_YYYY-MM-DD.md`.
   - Distill into a compact block (10–25 lines) → prepend to `covista-master.md` under `## YYYY-MM-DD <summary tag>`.
   - Update the `Last updated:` line at the top of the master.
   - Sync that compact block back into Copilot memory (`/memories/repo/covista-context.md`) so context survives session compaction.

4. **What goes in master vs. daily:**
   - Master: decisions, contract versions, schema/source facts, open questions, PR status, locked architecture.
   - Daily: meeting notes, draft replies, raw probe outputs, screenshots, drafts in flight.

## Sync command (workspace → memory)

When master is freshly edited and you want memory to match:

```powershell
Copy-Item `
  "C:\Algoworks\1\main\context\covista-master.md" `
  "C:\Users\neosu\AppData\Roaming\Code\User\workspaceStorage\a0cf2d30d331fea7c4bdaf4729394a31\GitHub.copilot-chat\memory-tool\memories\repo\covista-context.md" `
  -Force
```

## Sync command (memory → workspace)

When Copilot has updated memory and you want master to match:

```powershell
Copy-Item `
  "C:\Users\neosu\AppData\Roaming\Code\User\workspaceStorage\a0cf2d30d331fea7c4bdaf4729394a31\GitHub.copilot-chat\memory-tool\memories\repo\covista-context.md" `
  "C:\Algoworks\1\main\context\covista-master.md" `
  -Force
```

## Initial seed (Apr 28, 2026)

- `covista-master.md` seeded from current memory state (700+ lines, history through Apr 13).
- `daily/covista_2026-04-28.md` migrated from `docs/drafts/daily_summary_apr28_pm.md`.
