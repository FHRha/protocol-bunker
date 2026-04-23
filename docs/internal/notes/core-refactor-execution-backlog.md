# Core Refactor Execution Backlog

## Phase Status
- `Phase 1` - `complete`
- `Phase 2` - `complete`
- `Phase 3` - `complete`
- `Phase 4` - `complete`
- `Phase 5` - `complete`
- `Phase 6` - `complete`
- `Phase 7` - `complete`
- `Phase 8` - `complete`
- `Phase 9` - `partial`
- `Phase 10` - `partial`
- `Phase 11` - `partial`
- `Phase 12` - `partial`
- `Phase 13` - `partial`
- `Phase 14` - `not started`

## What Is Already Done
- `server/src/index.ts` is no longer the original giant mixed entrypoint
- server code is already split across:
  - `server/src/bootstrap/`
  - `server/src/config/`
  - `server/src/rooms/`
  - `server/src/ws/`
  - `server/src/sessions/`
  - `server/src/game/`
  - `server/src/actions/`
  - `server/src/presenters/`
  - `server/src/assets/`
  - `server/src/locales/`
- `shared/` is already reorganized around canonical contracts
- client has already extracted:
  - `client/src/session/`
  - `client/src/hooks/`
  - `client/src/app/derivedUi.ts`
  - `client/src/game/categoryPresentation.ts`
  - `client/src/lobby/rulesMath.ts`

## Remaining Work By Phase

## Phase 9. Contract Hygiene Pass
Goal:
- remove leftover duplicate normalization and shaping logic across layers

Main targets:
- role / permission checks
- event-name consistency
- payload-shaping helpers
- duplicated normalization helpers
- localization leaking into contract/domain decisions

Exit gate:
- one meaning should have one canonical helper or contract path

## Phase 10. Client Session And App Split
Goal:
- reduce `client/src/App.tsx` to a true composition root

Main targets:
- continue moving UI preference and shell concerns out of `App.tsx`
- keep session orchestration out of rendering-heavy sections
- keep topbar/settings/modal logic separated from route composition

Current progress:
- session flow already partially extracted
- app UI side-effects already extracted
- modal layer extracted
- UI preference initialization extracted

Exit gate:
- `App.tsx` mostly wires routes, page props, and top-level state boundaries

## Phase 11. Client Actions And Selectors Split
Goal:
- make UI components know less about transport and side-effect paths

Main targets:
- continue extracting client actions
- continue extracting derived selectors/mappers
- reduce prop/event boilerplate wired inline in page shells

Exit gate:
- derived UI logic is not scattered through top-level page components

## Phase 12. GamePage Split
Goal:
- split `client/src/pages/GamePage.tsx` into clear feature blocks

Main targets:
- world section / world modal
- special-dialog flow
- vote modal
- dossier/reveal blocks
- post-game and mobile-only world UI

Exit gate:
- `GamePage.tsx` becomes a shell that composes feature sections

## Phase 13. LobbyPage Split
Goal:
- split `client/src/pages/LobbyPage.tsx` into clear feature blocks

Main targets:
- overlay/spectator links section
- rules/settings section
- player-management controls
- transfer/kick related blocks

Exit gate:
- `LobbyPage.tsx` becomes a shell rather than one large mixed page file

## Phase 14. Cleanup And Documentation Pass
Goal:
- remove transitional debris after the refactor

Main targets:
- remove obsolete helpers
- rename ambiguous leftovers
- update internal docs to current architecture
- collapse temporary abstractions that are no longer needed

Exit gate:
- the new structure reads cleanly without needing old giant-file history

## Current Recommended Order
1. Finish `Phase 9`
2. Continue `Phase 10`
3. Continue `Phase 11`
4. Continue `Phase 12`
5. Continue `Phase 13`
6. Finish `Phase 14`

## Verification Between Slices
- `pnpm -C client typecheck`
- `pnpm -C shared typecheck`
- `pnpm -C server typecheck`
- `pnpm -C scenarios build`
- targeted manual checks for:
  - create room
  - join room
  - reconnect
  - host transfer
  - start game
  - reveal / vote / continue flow
