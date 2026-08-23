# System Prompt v2 + Opencode Default — Design Spec

## Overview
Improve Vortex agentic layer: ensure opencode is default tool, system prompt references all tools/project structure correctly, and sub-agents can change assets/filters/move/add assets verified visually via chrome-devtools.

## Problem
1. **Opencode not default**: global `~/.config/opencode/opencode.json` has stale `/Users/dennisloska` skill path (wrong on linux), no project-level `opencode.json`, no explicit default model, `.opencode/` gitignored but stale.
2. **System prompt gaps**: missing `moveAsset` + `clearFilter`, no project structure reference, no tool listing, no fix/fixed naming note, no intensity/layer docs, no examples for add/change/move/filter flows, filter preset list duplicated hard-coded in `server/routes/chat.ts`.
3. **CompositionAPI gap**: no `moveAsset` method, handler lacks moveAsset/clearFilter branches.
4. **Verification gap**: no sub-agent test coverage for prompt actions, no visual chrome-devtools check.

## Goals
- Opencode is default: project `opencode.json` + fixed global config, AGENTS.md at project root, correct skill paths, default provider/model set.
- System prompt v2: references project structure `projects/<name>/{assets,backgrounds,fix,texts}`, all CompositionAPI methods, all AgentAction types, available MCP/tools, correct alias guardrails, move/add/change/filter examples.
- Sub-agents can: change assets (remove+place), move assets (moveAsset), add assets (placeAsset+searchAssets), set/clear/adjust filters.
- Visual verification via chrome-devtools MCP (screenshot + DOM snapshot).

## Non-Goals
- No new LLM provider
- No asset upload UI
- No multi-user

## Architecture Changes

### 1. Opencode Default
- Create `opencode.json` at project root (checked in):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": { "lmstudio": { "models": { "qwen3.6-35b-a3b": {} } } },
  "model": "lmstudio/qwen3.6-35b-a3b",
  "plugin": ["opencode-mem","superpowers@git+..."],
  "skills": { "paths": [...] linux-correct },
  "instructions": ["AGENTS.md"]
}
```
- Fix `~/.config/opencode/opencode.json` skill path `/Users/dennisloska` → `/home/dennis`
- Add `AGENTS.md` at project root referencing opencode, tools, project structure
- Keep `.gitignore` `.opencode/` but document why; project `opencode.json` is source of truth
- Vite proxy already correct; add `opencode` script to package.json if missing

### 2. System Prompt v2
File: `server/system-prompt.ts` rewrite:
- Header: role + opencode default note
- Section: Project Structure (projects/<project>/{assets,backgrounds,fix,texts,project.json})
- Section: Available Tools (CompositionAPI methods, AgentAction schema, MCP servers context7/chrome-devtools/filesystem)
- Section: Available Actions — complete list with JSON examples, include moveAsset, clearFilter, searchAssets, createProject
- Section: Available Assets / Backgrounds / Filter Presets (injected)
- Section: Current Scene State (injected)
- Section: Rules + Examples (4 examples: add asset, move asset, change filter, search+place)
- Use centralized `FILTER_PRESETS` import knowledge, not hardcoded list in chat.ts

Need centralized filter list: create `server/filter-presets.ts` re-export or import from `src/app/scene-builder/filterPresets.ts` via shared module? Easiest: export list from server side file.

### 3. CompositionAPI + Types
- Add `moveAsset(alias, x, y, layer)` → finds child, updates position
- Add `clearFilter` already exists, ensure exposed
- Update `server/types.ts` AgentAction union: add `moveAsset`, `clearFilter`
- Update `server/routes/chat.ts` actionSchema: add moveAsset fields, clearFilter type
- Update `src/app/composition-api/AgentActionHandler.ts`: handle moveAsset, clearFilter, adjustIntensity

### 4. Verification
- Sub-agent tests: spawn 3 sub-agents each tests one capability via direct CompositionAPI mock or LLM structured output check
- Chrome devtools visual: start dev server, open page, trigger actions via handler, screenshot before/after, snapshot DOM

## Implementation Order
1. Fix opencode config (global + project root + AGENTS.md)
2. Add moveAsset + clearFilter to types/handler/API
3. Centralize filter presets on server
4. Rewrite system-prompt.ts v2
5. Sub-agent verification
6. Chrome visual verification

## Acceptance Criteria
- `opencode --help` works, project `opencode.json` exists and is valid, skill path correct on linux
- `buildSystemPrompt(...)` output contains: project structure, all tools, moveAsset example, filter docs, 4 examples
- Sub-agents report PASS for change/move/add/filter
- Chrome screenshot shows asset moved/filter applied
- `bun tsc --noEmit`, `bun run lint`, `vite build` all pass

## Open Questions
- Filter preset list share between client/server — copy array or shared file? Decide copy with TODO to share.
