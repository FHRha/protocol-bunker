# AI Bots Roadmap

## Purpose
- Add two bot tiers for regular matches:
  - rule-based bots with deterministic behavior and human-like canned explanations;
  - AI bots backed by an LLM through an OpenAI-compatible gateway.
- Keep bot behavior explainable in UI and logs without exposing hidden game data.
- Gate AI bot usage so it is not available to everyone by default.

## Current Scope Decision
- This work is deferred until the current refactor close-out is committed.
- Do not mix it with the remaining client/session cleanup or contract-hygiene audit.
- Treat mobile chat UX as a separate follow-up after the desktop flow is stable.

## Initial Implementation Status
- Shared lobby settings now include bot mode, bot type, and bot count.
- Lobby UI exposes bot enable/type/count controls.
- Server lobby lifecycle now creates/removes managed lobby bot players from those settings.
- Managed bot players are marked in room state and are not valid host-transfer targets.
- Rule-based bots now have a first gameplay skeleton:
  - localized automatic names;
  - reveal-card choice by simple deck priority plus lightweight disaster/world keyword scoring;
  - extracted scoring weights in `server/src/bots/ruleBasedConfig.ts`;
  - delayed one-step actions so bots appear to think instead of instantly advancing the match;
  - automatic continue after their reveal, also through the delayed action scheduler;
  - simple vote target choice during voting;
  - bot explanations are now written into the match message history after bot actions.
- Shared game view now has an initial `public.matchMessages` channel for bot/system narration.
- Server adds basic system narration for phase, turn, voting, resolution, and game-end changes.
- Desktop UI now has an initial match chat/history panel and speech bubbles for the latest bot message.
- Client settings include a local AI access key field with server validation.
- Server has an AI access key store and CLI for create, list, revoke, delete, and validate.
- AI bots now have a first execution path:
  - lobby settings include AI answer language (`ru` / `en`);
  - host AI access key is sent over a private WS message, not through broadcast room settings;
  - server blocks game start with AI bots unless the host has a valid AI access key;
  - server blocks game start with AI bots unless an OpenAI-compatible gateway is configured;
  - AI decisions use `/chat/completions` and expect a JSON action response;
  - AI model calls are used only for reveal/vote decisions, while round continuation is server-driven after the normal bot delay;
  - invalid or failed model responses fall back to a legal deterministic action so the match can continue.
- Speech bubbles and typewriter-style message rendering now have a first desktop implementation.
- Rule-based and system match messages now use localization keys with per-viewer localization.
- Host setup documentation now starts in `docs/host/bots-and-ai.md`.

## Bot Tiers

### 1. Rule-Based Bots
Goal:
- Provide a baseline bot that can play regular matches without any model calls.

Behavior:
- choose cards with a scoring algorithm;
- generate short canned explanations that sound human-like but are fully deterministic;
- use only game-visible information;
- stay simple enough for offline testing and regression coverage.
- act through a small randomized thinking delay instead of chaining actions immediately.

Suggested scoring inputs:
- survival value;
- synergy with the chosen scenario and role;
- resistance to elimination;
- consistency with the visible table state;
- ability to produce a believable justification string.

Lightweight scoring approach:
- keep static deck weights as the baseline;
- add small deck bonuses from disaster archetype keywords such as epidemic, war, cold, heat, flood, hunger, or social collapse;
- add cheap keyword overlap between visible world text and card labels/ids;
- never call an LLM or run expensive semantic analysis for regular bots;
- keep the score explainable so the UI can later say why a bot picked a card.

Current config:
- `server/src/bots/ruleBasedConfig.ts` keeps reveal deck priority and disaster keyword weights separate from the bot executor.
- `BUNKER_RULE_BOT_MIN_DELAY_MS` and `BUNKER_RULE_BOT_MAX_DELAY_MS` control the human-like delay before each rule-based bot action.

### 2. AI Bots
Goal:
- Use an LLM for richer decisions and explanations.

Behavior:
- generate a decision and a natural-language rationale;
- optionally pick a role/personality profile such as aggressive, empathetic, cautious, manipulative, or pragmatic;
- keep a running game context for the duration of the match;
- discard the context after the match ends.

Model context rules:
- include only information visible to the bot at that moment;
- preserve open cards, revealed opponent cards, round history, and prior bot messages for the same match;
- exclude hidden information, server-only state, and private setup data;
- clear the memory after the match to avoid cross-game contamination.

Prompting requirements:
- separate system rules from game state;
- make hidden-information constraints explicit;
- require short, explainable outputs for UI display;
- force the model to justify card choices and vote decisions in plain language;
- define a stable output schema for actions, explanation text, and optional persona metadata.

## Gateway And Config
- Support an OpenAI-compatible endpoint rather than a single hard-coded provider.
- Store per-environment gateway settings and per-bot model selection.
- Allow an admin or host-level configuration path, not a public user-facing setting.
- Include retries, timeouts, and rate-limit handling.
- Keep a local/offline fallback path for testing and for rooms without AI access.

## User-Facing Documentation
- Update host/deployment docs with:
  - how to configure the OpenAI-compatible gateway;
  - how to generate AI access keys;
  - how to revoke/delete leaked or obsolete keys;
  - how to override the key-store path;
  - how to enter and validate a key in client settings.
- Initial host setup page: `docs/host/bots-and-ai.md`.
- Update player/host docs with lobby bot settings:
  - bots disabled;
  - regular bots;
  - AI bots;
  - bot count and current limitations.
- Keep security notes explicit:
  - raw generated keys are shown once;
  - stored server keys are hashed;
  - AI access keys should not be committed or shared publicly;
  - AI bot availability depends on server-side validation, not client UI.

## Token Gating
Goal:
- Restrict AI bot usage with explicit entitlements.

Possible shape:
- server-generated AI access key;
- host enters the AI access key in client settings;
- host-level AI entitlement validated by the server;
- per-bot token consumption or quota;
- server-side validation before a bot can join or call the model.

Rules:
- do not rely on the client for token enforcement;
- keep the token check on the server;
- store only hashed access keys on disk;
- show the raw generated access key only once;
- support key listing, revocation, deletion, and validation from a server-side script;
- make the denial mode clear so a room can still run with rule-based bots only;
- log token usage and exhaustion separately from match logic.

Initial server script shape:
- `pnpm -C server ai:key:create -- --label "Host name"`
- `pnpm -C server ai:key:list`
- `pnpm -C server ai:key:revoke -- <id>`
- `pnpm -C server ai:key:delete -- <id>`
- `pnpm -C server ai:key:validate -- <key>`

Default key store:
- `data/ai-access-keys.json`
- override with `BUNKER_AI_ACCESS_KEYS_FILE`

## UI / UX

### Desktop
- lobby settings should allow choosing:
  - bots disabled;
  - regular rule-based bots;
  - AI bots;
  - bot count;
- AI access key entry belongs in client settings, not in room state, because room state is broadcast to all players;
- show bot speech as a speech bubble emerging from the bot tile;
- render bot bubble text progressively, character by character, while keeping the final message in history;
- add a dedicated chat/history area on the left side of the main table;
- keep a scrollable history of bot messages and game-state announcements;
- use the same surface for:
  - bot explanations;
  - round changes;
  - next-turn notices;
  - other match narration that should be readable later.

Current desktop status:
- `GameView.public.matchMessages` carries the durable history.
- `GameMatchFeed` renders the left-side history panel.
- `TableLayout` renders the latest bot message as a speech bubble near the bot seat.
- `TypewriterText` handles progressive text rendering.
- Server-side system messages use localization keys and are localized for each viewer.
- Rule-based bot messages use localization keys and are localized for each viewer.
- AI bot messages are controlled by lobby setting `settings.bots.aiLanguage`.

### Desktop Follow-Up
- evolve the bubble into a richer chat system if the interaction pattern proves useful;
- keep the history panel as the durable source of truth for past messages.

### Mobile
- defer the mobile layout until the desktop version is stable;
- likely need a collapsed drawer / modal / bottom-sheet variant instead of a full left rail.

## Proposed Implementation Order
1. Define shared bot contracts:
   - bot identity;
   - action payloads;
   - explanation payloads;
   - personality metadata;
   - visibility rules for game state.
2. Implement rule-based bots first:
   - selection algorithm;
   - canned explanation generator;
   - tests for deterministic behavior.
3. Add server-side AI access key infrastructure:
   - key generation CLI;
   - hashed key store;
   - list, revoke, delete, validate commands;
   - HTTP validation endpoint for client settings.
4. Add the AI-bot execution path:
   - OpenAI-compatible client; initial `/chat/completions` path done;
   - prompt builder; initial version done;
   - match-context builder; initial visible-state version done;
   - response parsing; initial JSON parser done;
   - retries and fallback behavior; fallback done, retries pending.
5. Add token gating on the server:
   - entitlement check; initial host access-key gate done;
   - quota or token consumption model; pending;
   - clear failure mode for disabled rooms; initial start-game errors done.
6. Add UI surfaces:
   - lobby bot mode/type/count controls;
   - client setting for AI access key;
   - speech bubble from bot tile;
   - match chat/history panel;
   - round and turn announcements.
7. Add lifecycle cleanup:
   - clear match context after game end;
   - reset any per-match AI memory;
   - verify no hidden state leaks into prompts or logs.
8. Revisit mobile after the desktop interaction is stable.
9. Update public documentation for host setup, key management, and lobby configuration.

## Risks And Guardrails
- hidden-information leaks are the main failure mode;
- explanation text must not expose internal scoring details that would feel unnatural or exploitable;
- prompt changes need regression tests because behavior will be sensitive to wording;
- token gating must be enforced server-side only;
- AI failures must not break the match; rule-based fallback should keep the game playable.

## Open Questions
- where the entitlement source of truth should live;
- whether AI tokens are room-scoped, host-scoped, or both;
- whether AI bots may join as permanent participants or only as fill-in seats;
- how much of the bot reasoning should be visible to spectators versus players;
- whether the same UI channel should carry both bot speech and system announcements.
