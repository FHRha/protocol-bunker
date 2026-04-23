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
- `Phase 12` - `complete`
- `Phase 13` - `complete`
- `Phase 14` - `complete-for-current-scope`

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
  - `client/src/app/uiPreferences.ts`
  - `client/src/app/AppModalLayer.tsx`
  - `client/src/app/AppSettingsPopover.tsx`
  - `client/src/app/AppThemePopover.tsx`
  - `client/src/game/categoryPresentation.ts`
  - `client/src/game/CardTile.tsx`
  - `client/src/game/GameDossierPanel.tsx`
  - `client/src/game/GameMobileDossierPanel.tsx`
  - `client/src/game/GameVoteModal.tsx`
  - `client/src/game/GameWorldModal.tsx`
  - `client/src/game/GameSpecialDialog.tsx`
  - `client/src/lobby/rulesMath.ts`
  - `client/src/lobby/OverlayLinkRow.tsx`
  - `client/src/lobby/LobbyPlayersCard.tsx`
  - `client/src/lobby/LobbyObsCard.tsx`
  - `client/src/lobby/LobbyKickModal.tsx`
  - `client/src/lobby/LobbyRulesCard.tsx`
  - `client/src/lobby/LobbySettingsCard.tsx`
  - `client/src/lobby/LobbyManualRulesCard.tsx`
  - `client/src/spectator/SpectatorCategoryCard.tsx`
  - `client/src/spectator/SpectatorWorldCardTile.tsx`
  - `client/src/spectator/SpectatorSelectedPanel.tsx`
  - `client/src/spectator/SpectatorWorldModal.tsx`
- current client split baseline:
  - `client/src/pages/GamePage.tsx` is reduced from the original giant page and now composes extracted game feature components
  - `client/src/pages/LobbyPage.tsx` is reduced from the original giant page and now composes extracted lobby feature components
  - `client/src/pages/SpectatorTablePage.tsx` is reduced and composes extracted spectator components
  - `client/src/App.tsx` is thinner, with UI preferences, modal layer, settings popover, and theme popover extracted

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

Current scope decision:
- deferred, not blocking the current refactor close-out
- should be handled as a separate audit pass before changing protocol behavior or AI bot contracts

## Phase 10. Client Session And App Split
Goal:
- reduce `client/src/App.tsx` to a true composition root

Main targets:
- optional next slice: move more topbar/shell composition out of `App.tsx`
- optional next slice: isolate remaining session orchestration from route composition

Current progress:
- session flow already partially extracted
- app UI side-effects already extracted
- modal layer extracted
- UI preference initialization extracted
- settings popover extracted
- theme popover extracted

Exit gate:
- `App.tsx` mostly wires routes, page props, and top-level state boundaries

Current scope decision:
- good enough for the current close-out
- further work should be a separate small refactor, not mixed into page/component split

## Phase 11. Client Actions And Selectors Split
Goal:
- make UI components know less about transport and side-effect paths

Main targets:
- continue extracting client actions
- continue extracting derived selectors/mappers
- reduce prop/event boilerplate wired inline in page shells

Exit gate:
- derived UI logic is not scattered through top-level page components

Current scope decision:
- deferred; keep as follow-up cleanup if future feature work touches these paths

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

Current status:
- complete for the current scope
- extracted card tile, dossier panels, vote modal, world modal, and special dialog components

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

Current status:
- complete for the current scope
- extracted players card, OBS/spectator card, kick modal, rules card, settings card, manual rules card, and overlay link row
- spectator table page was also reduced into dedicated spectator components

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

Current status:
- complete for the current scope
- internal backlog and project memory were updated to reflect the actual client split
- deeper transitional-helper cleanup is deferred until the next contract/session pass

## Current Recommended Order
1. Commit the current client decomposition and documentation close-out.
2. Treat `Phase 9` contract hygiene as a separate future audit.
3. Treat remaining `Phase 10-11` session/action cleanup as optional follow-up work.
4. Do not mix the next feature track, including AI bots, into this refactor close-out.

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
