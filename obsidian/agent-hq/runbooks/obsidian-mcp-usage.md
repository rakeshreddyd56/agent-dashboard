---
tags: [runbook, obsidian, mcp, knowledge-base]
created: 2026-03-07
---

# Runbook: Using Obsidian MCP in Agents

## How It Works

The `obsidian` MCP server is configured in `.mcp.json`:
```json
{
  "obsidian": {
    "command": "npx",
    "args": ["-y", "obsidian-mcp", "/Users/rakeshreddy/ObsidianVault/agent-hq"]
  }
}
```

It gives agents 12 tools to interact with the vault:
- `read_note` — read a specific note by path
- `write_note` — create or overwrite a note
- `search_notes` — semantic search across all notes
- `list_notes` — list notes in a folder
- `get_tags` — get all tags
- `create_folder` — create a new folder
- And more...

## Agent Workflow

### Before Starting Work
```
1. Search vault: "Has anyone researched [topic] before?"
2. Read existing notes if found
3. Build on existing knowledge, don't duplicate
```

### After Completing Work
```
1. Write findings to agents/{role}/
2. Update shared-log if cross-floor handoff needed
3. Tag properly: #project, #pattern, #research, #decision
```

### Writing Convention
```markdown
---
tags: [agent-name, topic, type]
created: YYYY-MM-DD
---

# Title

Content...
```

## Folder Permissions (by convention)

| Folder | Who Writes | Who Reads |
|--------|-----------|-----------|
| `agents/{role}/` | Only that agent | Everyone |
| `projects/{name}/` | Architect, Leads | Everyone |
| `patterns/` | Architect, Senior devs | Everyone |
| `floors/{floor}/` | Floor leads | Everyone |
| `daily/` | Supervisors | Everyone |
| `_coordination/` | Everyone (append-only) | Everyone |
| `runbooks/` | Ops team | Everyone |
| `retrospectives/` | Rataa-2 | Everyone |

## Concurrent Write Safety

The obsidian-mcp server is filesystem-direct — no locking. Safety rules:
1. Each agent only writes to their own `agents/{role}/` folder
2. `_coordination/shared-log.md` is append-only
3. If two agents need to update the same note, one should search first
4. Project-level docs should only be updated by leads/architect
