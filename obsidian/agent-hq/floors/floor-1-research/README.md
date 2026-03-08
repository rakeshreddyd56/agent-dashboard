---
tags: [floor, floor-1, research, ideation]
created: 2026-03-07
---

# Floor 1 — Research & Ideation

## Team

| Agent | Character | Model | Role |
|-------|-----------|-------|------|
| `rataa-research` | Nico Robin | Opus | Research Lead — coordinates all research, synthesizes findings |
| `researcher-1` | Chopper | GPT-4o | Council Chairman — chairs idea voting, cross-references |
| `researcher-2` | Brook | Claude Sonnet | Code Analyst — examines architecture and patterns |
| `researcher-3` | Jinbe | Gemini Flash | Risk Analyst — evaluates trade-offs, scales, risks |
| `researcher-4` | Carrot | Llama 3.1 70B | Trend Scout — tracks emerging tech, open-source tools |

## Workflow

```
IDLE → CLONING → ANALYZING → RESEARCHING → REVIEWING → SYNTHESIZING → PLANNING
```

1. **Robin** receives a research topic or auto-triggers from git analysis
2. **Robin** delegates sub-tasks to researchers based on speciality
3. Each researcher writes findings to `agents/{role}/` in this vault
4. **Chopper** chairs the council vote on ideas
5. **Robin** synthesizes all findings into a research brief
6. Brief gets handed off to Floor 2 via `_coordination/shared-log.md`

## Communication with Other Floors

- **→ Floor 2**: Research briefs, architecture proposals, technology recommendations
- **→ Floor 3**: Risk assessments, scaling concerns, deployment considerations
- **← Floor 2**: Feedback on feasibility, implementation questions
- **← Floor 3**: Production metrics, performance data for research validation

## Key Files in Dashboard

- `src/lib/office/council.ts` — Council voting logic
- `src/lib/office/git-analyzer.ts` — Git repo analysis for research triggers
- `data/office/souls/rataa-research.md` — Robin's soul/personality
- `data/office/souls/researcher.md` — Shared researcher soul

## Obsidian Usage

Each researcher writes to their own folder:
- `agents/rataa-research/` — synthesis notes, research briefs
- `agents/researcher-1/` — council summaries, cross-references
- `agents/researcher-2/` — code analysis, pattern discoveries
- `agents/researcher-3/` — risk assessments, trade-off analyses
- `agents/researcher-4/` — trend reports, tool evaluations
