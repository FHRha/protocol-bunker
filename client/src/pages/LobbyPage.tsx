import { useEffect, useState } from "react";
import {
  LINK_PATHS,
  buildLinkSet,
  normalizeBase,
  type GameSettings,
  type ManualRulesConfig,
  type RoomState,
} from "@bunker/shared";
import { ru } from "../i18n/ru";
import { API_BASE } from "../config";
import EyeIcon from "../components/EyeIcon";
import InfoTip from "../components/InfoTip";
import RulesModal from "../components/RulesModal";

interface LobbyPageProps {
  roomState: RoomState | null;
  playerId: string | null;
  playerToken: string | null;
  isControl: boolean;
  streamerMode: boolean;
  wsInteractive: boolean;
  onStart: () => void;
  onUpdateSettings: (settings: GameSettings) => void;
  onUpdateRules: (payload: {
    mode: "auto" | "manual";
    presetPlayerCount?: number;
    manualConfig?: ManualRulesConfig;
  }) => void;
  onKickPlayer: (targetPlayerId: string) => void;
  onTransferHost: (targetPlayerId: string) => void;
}

interface OverlayLinksPayload {
  showLanLinks: boolean;
  spectatorUrlLan: string;
  spectatorUrlExternal: string;
  overlayViewUrlLan: string;
  overlayViewUrlExternal: string;
  overlayControlUrlLan: string;
  overlayControlUrlExternal: string;
}

const GITHUB_URL = "https://github.com/FHRha";

function fallbackCopy(value: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, area.value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

function maskValue(value: string, hidden: boolean): string {
  return hidden ? ru.hiddenValue : value;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeVotesByRound(votes: number[]): number[] {
  const normalized = votes.map((value) => clampInt(value, 0, 9));
  if (normalized.length === 0) {
    return [0];
  }
  return normalized;
}

function sumVotes(votes: number[]): number {
  return votes.reduce((acc, value) => acc + value, 0);
}

function normalizeOverlayQueryParams(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = String(rawKey || "").trim();
    if (!key || key === "room" || key === "roomCode" || key === "token") continue;
    const value = String(rawValue ?? "").trim();
    if (!value) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function fitVotesByTotal(votes: number[], requiredVotes: number): number[] {
  const next = normalizeVotesByRound(votes);
  const target = clampInt(requiredVotes, 0, 64);
  const roundsCount = next.length;
  let diff = target - sumVotes(next);

  if (diff > 0 && roundsCount > 0) {
    while (diff > 0) {
      let changedInCycle = false;
      for (let step = 0; step < roundsCount && diff > 0; step += 1) {
        const index = roundsCount - 1 - step;
        if (next[index] >= 9) continue;
        next[index] += 1;
        diff -= 1;
        changedInCycle = true;
      }
      if (!changedInCycle) {
        break;
      }
    }
    return next;
  }

  if (diff < 0 && roundsCount > 0) {
    let remainingToRemove = Math.abs(diff);
    while (remainingToRemove > 0) {
      let changedInCycle = false;
      for (let step = 0; step < roundsCount && remainingToRemove > 0; step += 1) {
        const index = roundsCount - 1 - step;
        if (next[index] <= 0) continue;
        next[index] -= 1;
        remainingToRemove -= 1;
        changedInCycle = true;
      }
      if (!changedInCycle) {
        break;
      }
    }
  }

  return next;
}

function generateVotesByDefault(requiredVotes: number, currentVotes: number[]): number[] {
  const target = clampInt(requiredVotes, 0, 64);
  const current = normalizeVotesByRound(currentVotes);
  const leadingZeroCount = (() => {
    let count = 0;
    for (const value of current) {
      if (value !== 0) break;
      count += 1;
    }
    return count;
  })();
  const minLength = Math.max(1, current.length, leadingZeroCount + target);
  const generated: number[] = Array.from({ length: minLength }, () => 0);
  let remaining = target;
  for (let index = leadingZeroCount; index < generated.length && remaining > 0; index += 1) {
    generated[index] = Math.min(1, remaining);
    remaining -= generated[index];
  }
  while (remaining > 0) {
    const add = Math.min(1, remaining);
    generated.push(add);
    remaining -= add;
  }
  if (generated.length === 0) {
    generated.push(0);
  }
  return generated;
}

function parseVotesSchedule(text: string): number[] {
  const tokens = text
    .split(/[\/,\s]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return [0];
  }
  return tokens.map((token) => {
    const value = Number(token);
    if (!Number.isFinite(value)) return 0;
    return clampInt(value, 0, 9);
  });
}

function buildRevealPlan(roundsCount: number, targetReveals: number): number[] {
  const rounds = Math.max(1, clampInt(roundsCount, 1, 64));
  const target = clampInt(targetReveals, 5, 7);
  const plan = Array.from({ length: rounds }, () => 0);
  const baseOnes = Math.min(rounds, target);
  for (let index = 0; index < baseOnes; index += 1) {
    plan[index] = 1;
  }
  let remaining = target - baseOnes;
  for (let index = rounds - 1; index >= 0 && remaining > 0; index -= 1) {
    if (plan[index] >= 2) continue;
    plan[index] += 1;
    remaining -= 1;
  }
  return plan;
}

function hasSuspiciousPlayerNameChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function getSafePlayerName(name: string, fallbackIndex: number): string {
  const trimmed = name.trim();
  if (!trimmed || hasSuspiciousPlayerNameChars(trimmed)) {
    return `Игрок ${fallbackIndex + 1}`;
  }
  return trimmed;
}

export default function LobbyPage({
  roomState,
  playerId,
  playerToken,
  isControl,
  streamerMode,
  wsInteractive,
  onStart,
  onUpdateSettings,
  onUpdateRules,
  onKickPlayer,
  onTransferHost,
}: LobbyPageProps) {
  const [showSpectatorLink, setShowSpectatorLink] = useState(false);
  const [showOverlayView, setShowOverlayView] = useState(false);
  const [showOverlayControl, setShowOverlayControl] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [overlayLinks, setOverlayLinks] = useState<OverlayLinksPayload | null>(null);
  const [overlayLinksLoading, setOverlayLinksLoading] = useState(false);
  const [overlayLinksError, setOverlayLinksError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GameSettings | null>(roomState?.settings ?? null);
  const [kickTargetId, setKickTargetId] = useState("");
  const [transferHostTargetId, setTransferHostTargetId] = useState("");
  const [manualTemplatePlayers, setManualTemplatePlayers] = useState(4);
  const [manualVotesInput, setManualVotesInput] = useState("0");
  const [rulesOpen, setRulesOpen] = useState(false);

  const canControl = Boolean(isControl);
  const roomCode = roomState?.roomCode ?? "";
  const controlsDisabled = !wsInteractive;

  useEffect(() => {
    if (!roomState) return;
    setDraft(roomState.settings);
  }, [roomState?.settings]);

  useEffect(() => {
    if (!roomState) {
      setTransferHostTargetId("");
      return;
    }
    const candidateIds = roomState.players
      .map((player) => player.playerId)
      .filter((playerId) => playerId !== roomState.hostId);
    setTransferHostTargetId((prev) => (candidateIds.includes(prev) ? prev : candidateIds[0] ?? ""));
  }, [roomState?.players, roomState?.hostId]);

  useEffect(() => {
    if (!roomState) return;
    const nextTemplate =
      roomState.ruleset.manualConfig?.seedTemplatePlayers ??
      roomState.rulesPresetCount ??
      roomState.ruleset.playerCount;
    setManualTemplatePlayers(clampInt(nextTemplate, 4, 16));
  }, [roomState?.ruleset, roomState?.rulesPresetCount]);

  useEffect(() => {
    if (!roomState) {
      setManualVotesInput("0");
      return;
    }
    const sourceVotes =
      roomState.ruleset.rulesetMode === "manual" && roomState.ruleset.manualConfig
        ? roomState.ruleset.manualConfig.votesByRound
        : roomState.ruleset.votesPerRound;
    setManualVotesInput(normalizeVotesByRound(sourceVotes).join("/"));
  }, [roomState?.ruleset]);

  useEffect(() => {
    setShowSpectatorLink(false);
    setShowOverlayView(false);
    setShowOverlayControl(false);
  }, [streamerMode, roomCode]);

  useEffect(() => {
    if (!roomCode || !canControl || !playerToken) {
      setOverlayLinks(null);
      setOverlayLinksError(null);
      setOverlayLinksLoading(false);
      return;
    }

    let cancelled = false;
    setOverlayLinksLoading(true);
    setOverlayLinksError(null);

    const loadLinks = async () => {
      try {
        const response = await fetch(`${API_BASE}${LINK_PATHS.apiOverlayLinks}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roomCode,
            token: playerToken,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          const message =
            payload && typeof payload.message === "string" ? payload.message : ru.obsLinksUnavailable;
          throw new Error(message);
        }
        if (cancelled) return;
        const raw = payload as Record<string, unknown>;
        const lanBase = normalizeBase(String(raw.lanBase ?? ""));
        const publicBase = normalizeBase(raw.publicBase == null ? "" : String(raw.publicBase));
        const overlayViewToken = String(raw.overlayViewToken ?? "");
        const overlayControlToken = String(raw.overlayControlToken ?? "");
        const overlayQueryParams = normalizeOverlayQueryParams(raw.overlayQueryParams);
        const apiRoomCode = String(raw.roomCode ?? roomCode).trim().toUpperCase();
        const linkVisibility = String(raw.linkVisibility ?? "all").trim().toLowerCase();
        const buildProfile = String(raw.buildProfile ?? "").trim().toLowerCase();
        const forcePublicOnly = buildProfile === "server";
        const showLanLinks =
          !forcePublicOnly && !(linkVisibility === "public" || linkVisibility === "external");

        if (!lanBase || !overlayViewToken || !overlayControlToken || !apiRoomCode) {
          throw new Error(ru.obsLinksUnavailable);
        }

        const built = buildLinkSet({
          lanBase,
          publicBase,
          roomCode: apiRoomCode,
          overlayViewToken,
          overlayControlToken,
          overlayQueryParams,
        });
        const lanSpectator = showLanLinks ? built.viewerUrl.lan : "";
        const lanOverlayView = showLanLinks ? built.overlayViewUrl.lan : "";
        const lanOverlayControl = showLanLinks ? built.overlayControlUrl.lan : "";
        setOverlayLinks({
          showLanLinks,
          spectatorUrlLan: lanSpectator,
          spectatorUrlExternal: built.viewerUrl.public ?? "",
          overlayViewUrlLan: lanOverlayView,
          overlayViewUrlExternal: built.overlayViewUrl.public ?? "",
          overlayControlUrlLan: lanOverlayControl,
          overlayControlUrlExternal: built.overlayControlUrl.public ?? "",
        });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : ru.obsLinksUnavailable;
        setOverlayLinksError(message);
        setOverlayLinks(null);
      } finally {
        if (!cancelled) {
          setOverlayLinksLoading(false);
        }
      }
    };

    void loadLinks();
    const timer = window.setInterval(() => {
      void loadLinks();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canControl, playerToken, roomCode]);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  const copyText = async (value: string, key: string) => {
    let copied = false;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) {
      copied = fallbackCopy(value);
    }
    if (!copied) {
      window.alert(ru.copyFailed);
      return;
    }
    setCopiedKey(key);
  };

  if (!roomState) {
    return (
      <section className="panel">
        <h2>{ru.lobbyTitle}</h2>
        <p className="muted">{ru.lobbyLoading}</p>
      </section>
    );
  }

  const spectatorHidden = streamerMode && !showSpectatorLink;
  const overlayViewHidden = streamerMode && !showOverlayView;
  const overlayControlHidden = streamerMode && !showOverlayControl;
  const spectatorUrlLan = overlayLinks?.spectatorUrlLan ?? "";
  const spectatorUrlExternal = overlayLinks?.spectatorUrlExternal ?? "";
  const overlayViewUrlLan = overlayLinks?.overlayViewUrlLan ?? "";
  const overlayViewUrlExternal = overlayLinks?.overlayViewUrlExternal ?? "";
  const overlayControlUrlLan = overlayLinks?.overlayControlUrlLan ?? "";
  const overlayControlUrlExternal = overlayLinks?.overlayControlUrlExternal ?? "";
  const showLanLinks = overlayLinks?.showLanLinks ?? true;
  const copyLabel = (key: string) =>
    copiedKey === key ? ru.copiedButton : ru.copyButton;

  const settings = draft ?? roomState.settings;
  const disasterOptions = roomState.disasterOptions ?? [];
  const supportsForcedDisaster = disasterOptions.length > 0;
  const disasterTitleById = new Map(disasterOptions.map((option) => [option.id, option.title]));
  const normalizedForcedDisasterId =
    settings.forcedDisasterId === "random" || disasterTitleById.has(settings.forcedDisasterId)
      ? settings.forcedDisasterId
      : "random";
  const forcedDisasterTitle =
    normalizedForcedDisasterId === "random"
      ? ru.settingsForcedDisasterRandom
      : disasterTitleById.get(normalizedForcedDisasterId) ?? normalizedForcedDisasterId;
  const isClassic = roomState.scenarioMeta.id === "classic";
  const ruleset = roomState.ruleset;
  const rulesMode: "auto" | "manual" = ruleset.rulesetMode === "auto" ? "auto" : "manual";
  const presetCount =
    roomState.rulesPresetCount ?? ruleset.manualConfig?.seedTemplatePlayers ?? ruleset.playerCount;
  const rulesModeText = rulesMode === "manual" ? ru.rulesModeManual : ru.rulesModeAuto;
  const votesSummary = ru.rulesVotes(ruleset.votesPerRound);
  const votesSeparatorIndex = votesSummary.indexOf(":");
  const votesLabel =
    votesSeparatorIndex >= 0 ? votesSummary.slice(0, votesSeparatorIndex + 1) : "Голосования по раундам:";
  const votesValue =
    votesSeparatorIndex >= 0
      ? votesSummary.slice(votesSeparatorIndex + 1).trim()
      : ruleset.votesPerRound.join(" / ");
  const manualConfig: ManualRulesConfig = ruleset.manualConfig
    ? {
        ...ruleset.manualConfig,
        votesByRound: normalizeVotesByRound(ruleset.manualConfig.votesByRound),
        targetReveals: clampInt(ruleset.manualConfig.targetReveals ?? 7, 5, 7),
      }
    : {
        bunkerSlots: ruleset.bunkerSeats,
        votesByRound: normalizeVotesByRound([...ruleset.votesPerRound]),
        targetReveals: 7,
        seedTemplatePlayers: clampInt(presetCount, 4, 16),
      };
  const requiredVotes = Math.max(0, roomState.players.length - manualConfig.bunkerSlots);
  const manualVotesSum = sumVotes(manualConfig.votesByRound);
  const manualVotesMismatch = manualVotesSum !== requiredVotes;
  const revealPlan = buildRevealPlan(manualConfig.votesByRound.length, manualConfig.targetReveals);
  const revealPlanText = revealPlan.join("/");
  const manualRevealNotRecommended = manualConfig.targetReveals !== 7;
  const canStart = !isClassic || roomState.players.length >= 4;
  const minPlayersLimit = Math.max(isClassic ? 4 : 2, roomState.players.length);
  const wsHint = controlsDisabled ? ru.wsActionDisabledHint : null;
  const continueTipText =
    "Определяет, кто может нажимать «Продолжить» после обсуждения: ведущий, раскрывший игрок или любой участник.";
  const threatTipText =
    "Определяет, кто может раскрывать карты угроз в финале игры: только ведущий или любой игрок.";
  const rulesButtonLabel = "\u041f\u0440\u0430\u0432\u0438\u043b\u0430";

  const sendRulesUpdate = (payload: {
    mode: "auto" | "manual";
    presetPlayerCount?: number;
    manualConfig?: ManualRulesConfig;
  }) => {
    if (controlsDisabled) return;
    onUpdateRules(payload);
  };

  const updateManualConfig = (patch: Partial<ManualRulesConfig>) => {
    const merged: ManualRulesConfig = {
      ...manualConfig,
      ...patch,
      seedTemplatePlayers: clampInt(
        patch.seedTemplatePlayers ?? manualConfig.seedTemplatePlayers ?? manualTemplatePlayers,
        4,
        16
      ),
      bunkerSlots: clampInt(patch.bunkerSlots ?? manualConfig.bunkerSlots, 1, 16),
      votesByRound: normalizeVotesByRound(patch.votesByRound ?? manualConfig.votesByRound),
      targetReveals: clampInt(patch.targetReveals ?? manualConfig.targetReveals, 5, 7),
    };
    sendRulesUpdate({
      mode: "manual",
      presetPlayerCount: merged.seedTemplatePlayers,
      manualConfig: merged,
    });
  };

  const applyRulesMode = (mode: "auto" | "manual") => {
    if (mode === "auto") {
      sendRulesUpdate({ mode: "auto" });
      return;
    }
    sendRulesUpdate({
      mode: "manual",
      presetPlayerCount: clampInt(manualTemplatePlayers, 4, 16),
      manualConfig: {
        ...manualConfig,
        seedTemplatePlayers: clampInt(manualTemplatePlayers, 4, 16),
      },
    });
  };

  const fillManualFromTemplate = () => {
    sendRulesUpdate({
      mode: "manual",
      presetPlayerCount: clampInt(manualTemplatePlayers, 4, 16),
    });
  };

  const maxPlayersVisible = 8;
  const visiblePlayers = roomState.players.slice(0, maxPlayersVisible);
  const extraPlayers = roomState.players.length - visiblePlayers.length;
  const kickCandidates = roomState.players.filter((player) => player.playerId !== roomState.controlId);
  const transferHostCandidates = roomState.players.filter((player) => player.playerId !== roomState.hostId);
  const playerIndexById = new Map(roomState.players.map((player, index) => [player.playerId, index]));

  const applySettings = (next: GameSettings) => {
    if (controlsDisabled) return;
    setDraft(next);
    onUpdateSettings(next);
  };

  const updateField = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    if (!draft) return;
    applySettings({ ...draft, [key]: value });
  };

  const updateAutomationMode = (mode: GameSettings["automationMode"]) => {
    if (!draft) return;
    applySettings({ ...draft, automationMode: mode });
  };

  return (
    <div className={`lobby-page lobbyLayout ${canControl ? "lobby--host" : "lobby--player"}`}>
      <div className="lobbyGrid">
        <div className="lobbyLeftColumn">
          <section className="lobbyCard lobbyCard--players playersCard">
            <div className="lobbyCardHeader">
              <h3 className="lobbyCardTitle">{ru.playersTitle}</h3>
            </div>
            <div className="lobbyCardBody">
              <ul className="player-list compact">
                {visiblePlayers.map((player) => {
                  const fallbackIndex = playerIndexById.get(player.playerId) ?? 0;
                  const safeName = getSafePlayerName(player.name, fallbackIndex);
                  return (
                    <li key={player.playerId}>
                      {safeName}
                      {player.playerId === roomState.hostId ? ru.hostMarker : ""}
                      {player.playerId === roomState.controlId ? ru.controlMarker : ""}
                      {player.connected ? "" : ru.offlineMarker}
                    </li>
                  );
                })}
              </ul>
              {extraPlayers > 0 ? <div className="muted player-extra">+{extraPlayers} ещё</div> : null}

              {canControl && kickCandidates.length > 0 ? (
                <div className="formRow">
                  <span>{ru.lobbyKickTitle}</span>
                  <div className="formControlRow">
                    <select
                      value={kickTargetId}
                      disabled={controlsDisabled}
                      onChange={(event) => setKickTargetId(event.target.value)}
                    >
                      <option value="" disabled>
                        {ru.lobbyKickSelectPlaceholder}
                      </option>
                      {kickCandidates.map((player) => {
                        const fallbackIndex = playerIndexById.get(player.playerId) ?? 0;
                        const safeName = getSafePlayerName(player.name, fallbackIndex);
                        return (
                          <option key={player.playerId} value={player.playerId}>
                            {safeName}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      className="ghost button-small"
                      disabled={!kickTargetId || controlsDisabled}
                      onClick={() => {
                        if (controlsDisabled) return;
                        if (!kickTargetId) return;
                        onKickPlayer(kickTargetId);
                        setKickTargetId("");
                      }}
                    >
                      {ru.lobbyKickButton}
                    </button>
                  </div>
                </div>
              ) : null}

              {canControl ? (
                <div className="formRow formRow--transferHost">
                  <span>{ru.transferHostTitle}</span>
                  <div className="formControlRow formControlRow--transferHost">
                    <select
                      value={transferHostTargetId}
                      disabled={controlsDisabled || transferHostCandidates.length === 0}
                      onChange={(event) => setTransferHostTargetId(event.target.value)}
                    >
                      {transferHostCandidates.length === 0 ? (
                        <option value="" disabled>
                          {ru.transferHostSelectPlaceholder}
                        </option>
                      ) : null}
                      {transferHostCandidates.map((player) => {
                        const fallbackIndex = playerIndexById.get(player.playerId) ?? 0;
                        const safeName = getSafePlayerName(player.name, fallbackIndex);
                        return (
                          <option key={player.playerId} value={player.playerId}>
                            {safeName}
                            {player.playerId === roomState.controlId ? ru.controlMarker : ""}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      className="ghost button-small"
                      disabled={!transferHostTargetId || controlsDisabled || transferHostCandidates.length === 0}
                      onClick={() => {
                        if (controlsDisabled) return;
                        if (!transferHostTargetId) return;
                        onTransferHost(transferHostTargetId);
                      }}
                    >
                      {ru.transferHostButton}
                    </button>
                  </div>
                </div>
              ) : null}

              {canControl ? (
                <div className="start-row">
                  <button
                    className="primary button-small"
                    disabled={!canStart || controlsDisabled}
                    onClick={() => {
                      if (controlsDisabled) return;
                      onStart();
                    }}
                  >
                    {ru.startButton}
                  </button>
                  {!canStart && isClassic ? <span className="muted">{ru.rulesNeedMinPlayers}</span> : null}
                  {wsHint ? <span className="muted wsDisabledHint">{wsHint}</span> : null}
                </div>
              ) : (
                <div className="muted playerOnlyHint">{ru.hostOnlyHint}</div>
              )}
            </div>
          </section>

          <section className="lobbyCard lobbyCard--rules rulesCard">
            <div className="lobbyCardHeader">
              <h3 className="lobbyCardTitle">{ru.rulesTitle}</h3>
            </div>
            <div className="lobbyCardBody">
              <div className="rulesTop">
                <div className="lobbyMetaLine">
                  <span className="muted">{ru.scenarioLabel(roomState.scenarioMeta.name)}</span>
                </div>
                <div className="rulesModeBox">
                  <div className="rulesModeLabel">{ru.rulesModeLabel}</div>
                  {canControl && isClassic ? (
                    <select
                      className="rulesModeSelect"
                      value={rulesMode}
                      disabled={controlsDisabled}
                      onChange={(event) => applyRulesMode(event.target.value as "auto" | "manual")}
                    >
                      <option value="auto">{ru.rulesModeAuto}</option>
                      <option value="manual">{ru.rulesModeManual}</option>
                    </select>
                  ) : (
                    <div className="rulesModeValue">{rulesModeText}</div>
                  )}
                </div>
              </div>
              <div className="rulesStats">
                <div className="ruleCell">{ru.rulesPlayers(roomState.players.length)}</div>
                <div className="ruleCell">{ru.rulesSeats(ruleset.bunkerSeats)}</div>
                <div className="ruleCell ruleCellGhost" aria-hidden="true"></div>
                <div className="ruleCell">{ru.rulesExiles(ruleset.totalExiles)}</div>
                <div className="ruleCell rulesSpan2">
                  <span className="ruleFactLabel">{votesLabel}</span>
                  <span className="ruleFactValue nowrap">{votesValue}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="lobbyRightColumn">
          <section className="lobbyCard lobbyCard--settings settingsCard">
            <div className="lobbyCardHeader">
              <h3 className="lobbyCardTitle">{ru.settingsTitle}</h3>
            </div>
            <div className="lobbyCardBody">
              {canControl ? (
                <fieldset className="settingsFieldset" disabled={controlsDisabled}>
                  <div className="settings-grid compact">
                  <div className="settings-section-title">{ru.settingsTimersBlock}</div>
                  <label className="formRow settingsRow--timer">
                    <span className="settingsLabel">{ru.settingsRevealDiscussionTimer}</span>
                    <div className="formControlRow settingsControls">
                      <input
                        type="checkbox"
                        checked={settings.enableRevealDiscussionTimer}
                        onChange={(event) => updateField("enableRevealDiscussionTimer", event.target.checked)}
                      />
                      <input
                        type="number"
                        min={5}
                        max={600}
                        value={settings.revealDiscussionSeconds}
                        onChange={(event) =>
                          updateField("revealDiscussionSeconds", Number(event.target.value))
                        }
                      />
                    </div>
                  </label>
                  <label className="formRow settingsRow--timer">
                    <span className="settingsLabel">{ru.settingsPreVoteTimer}</span>
                    <div className="formControlRow settingsControls">
                      <input
                        type="checkbox"
                        checked={settings.enablePreVoteDiscussionTimer}
                        onChange={(event) => updateField("enablePreVoteDiscussionTimer", event.target.checked)}
                      />
                      <input
                        type="number"
                        min={5}
                        max={600}
                        value={settings.preVoteDiscussionSeconds}
                        onChange={(event) =>
                          updateField("preVoteDiscussionSeconds", Number(event.target.value))
                        }
                      />
                    </div>
                  </label>
                  <label className="formRow settingsRow--timer">
                    <span className="settingsLabel">{ru.settingsPostVoteTimer}</span>
                    <div className="formControlRow settingsControls">
                      <input
                        type="checkbox"
                        checked={settings.enablePostVoteDiscussionTimer}
                        onChange={(event) => updateField("enablePostVoteDiscussionTimer", event.target.checked)}
                      />
                      <input
                        type="number"
                        min={5}
                        max={600}
                        value={settings.postVoteDiscussionSeconds}
                        onChange={(event) =>
                          updateField("postVoteDiscussionSeconds", Number(event.target.value))
                        }
                      />
                    </div>
                  </label>
                  <div className="settings-section-title">{ru.settingsOtherBlock}</div>
                  <label className="formRow">
                    <span className="settingsLabelWithTip">
                      <span>{ru.settingsAutomationMode}</span>
                      <InfoTip text={ru.settingsAutomationModeHint} />
                    </span>
                    <select
                      value={settings.automationMode}
                      onChange={(event) =>
                        updateAutomationMode(event.target.value as GameSettings["automationMode"])
                      }
                    >
                      <option value="auto">{ru.settingsAutomationAuto}</option>
                      <option value="semi">{ru.settingsAutomationSemi}</option>
                      <option value="manual">{ru.settingsAutomationManual}</option>
                    </select>
                  </label>
                  <div className="formRow settingsRow--overlayControl">
                    <span className="settingsLabel settingsLabelWithTip">
                      <span>{ru.settingsPresenterMode}</span>
                      <InfoTip text={ru.settingsPresenterModeHint} />
                    </span>
                    <div className="formControlRow settingsControls checkboxLabel">
                      <div className="overlayControlCheckbox">
                        <input
                          type="checkbox"
                          checked={settings.enablePresenterMode}
                          onChange={(event) => updateField("enablePresenterMode", event.target.checked)}
                        />
                        <small className="muted">{ru.settingsPresenterModeHint}</small>
                      </div>
                    </div>
                  </div>
                  <label className="formRow">
                    <span className="settingsLabelWithTip">
                      <span>{ru.settingsContinuePermission}</span>
                      <InfoTip text={continueTipText} />
                    </span>
                    <select
                      value={settings.continuePermission}
                      onChange={(event) =>
                        updateField(
                          "continuePermission",
                          event.target.value as GameSettings["continuePermission"]
                        )
                      }
                    >
                      <option value="host_only">{ru.settingsContinueHost}</option>
                      <option value="revealer_only">{ru.settingsContinueRevealer}</option>
                      <option value="anyone">{ru.settingsContinueAnyone}</option>
                    </select>
                  </label>
                  <label className="formRow">
                    <span>{ru.settingsRevealTimeoutAction}</span>
                    <select
                      value={settings.revealTimeoutAction}
                      onChange={(event) =>
                        updateField(
                          "revealTimeoutAction",
                          event.target.value as GameSettings["revealTimeoutAction"]
                        )
                      }
                    >
                      <option value="random_card">{ru.settingsRevealTimeoutRandom}</option>
                      <option value="skip_player">{ru.settingsRevealTimeoutSkip}</option>
                    </select>
                  </label>
                  <label className="formRow">
                    <span>{ru.settingsSpecialUsage}</span>
                    <select
                      value={settings.specialUsage}
                      onChange={(event) =>
                        updateField("specialUsage", event.target.value as GameSettings["specialUsage"])
                      }
                    >
                      <option value="anytime">{ru.settingsSpecialAnytime}</option>
                      <option value="only_during_voting">{ru.settingsSpecialVotingOnly}</option>
                    </select>
                  </label>
                  <label className="formRow">
                    <span className="settingsLabelWithTip">
                      <span>{ru.settingsFinalThreatReveal}</span>
                      <InfoTip text={threatTipText} />
                    </span>
                    <select
                      value={settings.finalThreatReveal}
                      onChange={(event) =>
                        updateField(
                          "finalThreatReveal",
                          event.target.value as GameSettings["finalThreatReveal"]
                        )
                      }
                    >
                      <option value="host">{ru.settingsThreatHost}</option>
                      <option value="anyone">{ru.settingsThreatAnyone}</option>
                    </select>
                  </label>
                  {supportsForcedDisaster ? (
                    <label className="formRow">
                      <span>{ru.settingsForcedDisaster}</span>
                      <select
                        value={normalizedForcedDisasterId}
                        onChange={(event) => updateField("forcedDisasterId", event.target.value)}
                      >
                        <option value="random">{ru.settingsForcedDisasterRandom}</option>
                        {disasterOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="formRow">
                    <span>{ru.settingsMaxPlayers}</span>
                    <div className="settingsMaxPlayersControl">
                      <input
                        type="number"
                        min={minPlayersLimit}
                        max={16}
                        value={settings.maxPlayers}
                        onChange={(event) =>
                          updateField(
                            "maxPlayers",
                            clampInt(Number(event.target.value), minPlayersLimit, 16)
                          )
                        }
                      />
                      <small className="muted">Максимум 16</small>
                    </div>
                  </label>
                </div>
                </fieldset>
              ) : (
                <div className="settings-readonly compact">
                  <div>
                    {ru.settingsAutomationMode}:{" "}
                    {settings.automationMode === "manual"
                      ? ru.settingsAutomationManual
                      : settings.automationMode === "semi"
                        ? ru.settingsAutomationSemi
                        : ru.settingsAutomationAuto}
                  </div>
                  <div>
                    {ru.settingsPresenterMode}: {settings.enablePresenterMode ? ru.settingsOn : ru.settingsOff}
                  </div>
                  <div>
                    {ru.settingsRevealDiscussionTimer}:{" "}
                    {settings.enableRevealDiscussionTimer ? ru.settingsOn : ru.settingsOff} (
                    {settings.revealDiscussionSeconds}s)
                  </div>
                  <div>
                    {ru.settingsPreVoteTimer}: {settings.enablePreVoteDiscussionTimer ? ru.settingsOn : ru.settingsOff} (
                    {settings.preVoteDiscussionSeconds}s)
                  </div>
                  <div>
                    {ru.settingsPostVoteTimer}: {settings.enablePostVoteDiscussionTimer ? ru.settingsOn : ru.settingsOff} (
                    {settings.postVoteDiscussionSeconds}s)
                  </div>
                  <div>
                    {ru.settingsContinuePermission}:{" "}
                    {settings.continuePermission === "host_only"
                      ? ru.settingsContinueHost
                      : settings.continuePermission === "revealer_only"
                        ? ru.settingsContinueRevealer
                        : ru.settingsContinueAnyone}
                  </div>
                  <div>
                    {ru.settingsRevealTimeoutAction}:{" "}
                    {settings.revealTimeoutAction === "random_card" ? ru.settingsRevealTimeoutRandom : ru.settingsRevealTimeoutSkip}
                  </div>
                  <div>
                    {ru.settingsSpecialUsage}: {settings.specialUsage === "anytime" ? ru.settingsSpecialAnytime : ru.settingsSpecialVotingOnly}
                  </div>
                  <div>
                    {ru.settingsFinalThreatReveal}:{" "}
                    {settings.finalThreatReveal === "anyone" ? ru.settingsThreatAnyone : ru.settingsThreatHost}
                  </div>
                  {supportsForcedDisaster ? (
                    <div>
                      {ru.settingsForcedDisaster}: {forcedDisasterTitle}
                    </div>
                  ) : null}
                  <div>
                    {ru.settingsMaxPlayers}: {settings.maxPlayers}
                  </div>
                </div>
              )}
              {canControl && wsHint ? <div className="muted wsDisabledHint">{wsHint}</div> : null}
              {canControl && settings.enablePresenterMode ? (
                <div className="muted presenterHint">{ru.presenterControlHint}</div>
              ) : null}
            </div>
          </section>
          {canControl && isClassic && rulesMode === "manual" ? (
            <section className="lobbyCard lobbyCard--manual manualCard">
              <div className="lobbyCardHeader">
                <h3 className="lobbyCardTitle">Ручной режим</h3>
              </div>
              <div className="lobbyCardBody">
                <fieldset className="settingsFieldset" disabled={controlsDisabled}>
                <div className="manualRulesBuilder">
                  <div className="manualRulesRow">
                    <label>
                      <span>{ru.rulesPresetLabel}</span>
                      <select
                        value={manualTemplatePlayers}
                        onChange={(event) => setManualTemplatePlayers(Number(event.target.value))}
                      >
                        {ru.rulesPresetOptions.map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="ghost button-small" onClick={fillManualFromTemplate}>
                      Заполнить
                    </button>
                  </div>

                  <div className="manualRulesRow manualRulesRow3Wide">
                    <label>
                      <span>Мест в бункере</span>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={manualConfig.bunkerSlots}
                        onChange={(event) =>
                          updateManualConfig({ bunkerSlots: Number(event.target.value) })
                        }
                      />
                    </label>
                    <div className="manualRequiredVotes" aria-live="polite">
                      Требуется голосований: {requiredVotes}
                    </div>
                    <label className="manualRevealTargetField">
                      <span>Требуется раскрытий</span>
                      <select
                        value={manualConfig.targetReveals}
                        onChange={(event) =>
                          updateManualConfig({ targetReveals: Number(event.target.value) })
                        }
                      >
                        <option value={5}>5</option>
                        <option value={6}>6</option>
                        <option value={7}>7</option>
                      </select>
                    </label>
                  </div>

                  <div className="manualRevealMeta">
                    <div className="manualRevealHint">
                      Рекомендуем: 7 (останется 1 закрытая карта из 8)
                    </div>
                    {manualRevealNotRecommended ? (
                      <div className="manualRevealWarning">
                        Внимание: выбрано не рекомендованное значение раскрытий.
                      </div>
                    ) : null}
                    <div className="manualRevealPlan">
                      Раскрытия по раундам: <span className="nowrap">{revealPlanText}</span>
                    </div>
                  </div>

                  <div className="manualVotesHeader">
                    <div>Голосования по раундам</div>
                    <div className="manualVotesActions">
                      <button
                        className="ghost button-small"
                        onClick={() =>
                          updateManualConfig({
                            votesByRound: [...manualConfig.votesByRound, 0],
                          })
                        }
                      >
                        + раунд
                      </button>
                      <button
                        className="ghost button-small"
                        disabled={manualConfig.votesByRound.length <= 1}
                        onClick={() =>
                          updateManualConfig({
                            votesByRound: manualConfig.votesByRound.slice(
                              0,
                              Math.max(1, manualConfig.votesByRound.length - 1)
                            ),
                          })
                        }
                      >
                        - раунд
                      </button>
                      <button
                        className="ghost button-small"
                        onClick={() =>
                          updateManualConfig({
                            votesByRound: generateVotesByDefault(
                              requiredVotes,
                              manualConfig.votesByRound
                            ),
                          })
                        }
                      >
                        Сгенерировать
                      </button>
                    </div>
                  </div>

                  <label className="manualVotesTextField">
                    <span>Голосования по раундам (формат: 0/0/1/1)</span>
                    <input
                      type="text"
                      value={manualVotesInput}
                      onChange={(event) => {
                        const text = event.target.value;
                        setManualVotesInput(text);
                        updateManualConfig({ votesByRound: parseVotesSchedule(text) });
                      }}
                    />
                  </label>

                  <div className="manualVotesInputs">
                    {manualConfig.votesByRound.map((votes, index) => (
                      <label key={`round-${index}`} className="manualVoteCell">
                        <span>R{index + 1}</span>
                        <input
                          type="number"
                          min={0}
                          max={9}
                          value={votes}
                          onChange={(event) => {
                            const next = [...manualConfig.votesByRound];
                            next[index] = Number(event.target.value);
                            updateManualConfig({ votesByRound: next });
                          }}
                        />
                      </label>
                    ))}
                  </div>

                  <div className={`manualVotesSummary${manualVotesMismatch ? " warning" : ""}`}>
                    <span>
                      Сумма голосований по раундам: {manualVotesSum}. Требуется: {requiredVotes}.
                    </span>
                    {manualVotesMismatch ? (
                      <button
                        className="ghost button-small"
                        onClick={() =>
                          updateManualConfig({
                            votesByRound: fitVotesByTotal(manualConfig.votesByRound, requiredVotes),
                          })
                        }
                      >
                        Подогнать
                      </button>
                    ) : null}
                  </div>
                </div>
                </fieldset>
                {wsHint ? <div className="muted wsDisabledHint">{wsHint}</div> : null}
              </div>
            </section>
          ) : null}
        </div>
        {canControl ? (
          <section className="lobbyCard lobbyObsCard obsCard">
            <div className="lobbyCardHeader">
              <h3 className="lobbyCardTitle">{ru.obsLinksTitle}</h3>
            </div>
            <div className="lobbyCardBody">
              <div className="muted">{ru.spectatorLinkHint}</div>
              {overlayLinksLoading ? <div className="muted">{ru.obsLinksLoading}</div> : null}
              {!overlayLinksLoading && overlayLinksError ? (
                <div className="muted">{overlayLinksError || ru.obsLinksUnavailable}</div>
              ) : null}
              {!overlayLinksLoading && overlayLinks ? (
                <>
                  <section className="linksSection">
                    <h4 className="linksSectionTitle">{ru.spectatorLinkTitle}</h4>
                    <div className="obs-links-list">
                      {showLanLinks ? (
                        <div className="obs-link-row">
                          <div className="obs-link-main">
                            <div className="obs-link-label">LAN</div>
                            <div
                              className={`secret-value obs-link-value${spectatorHidden ? " maskedText" : ""}`}
                              title={spectatorHidden ? ru.showSecret : spectatorUrlLan || ru.obsLinksUnavailable}
                            >
                              {maskValue(spectatorUrlLan || "—", spectatorHidden)}
                            </div>
                          </div>
                          <div className="secret-actions">
                            <button
                              type="button"
                              className="ghost iconButton"
                              aria-label={spectatorHidden ? ru.showSecret : ru.hideSecret}
                              title={spectatorHidden ? ru.showSecret : ru.hideSecret}
                              onClick={() => setShowSpectatorLink((prev) => !prev)}
                            >
                              <EyeIcon open={!spectatorHidden} />
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              disabled={!spectatorUrlLan}
                              onClick={() =>
                                spectatorUrlLan && window.open(spectatorUrlLan, "_blank", "noopener,noreferrer")
                              }
                            >
                              {ru.openButton}
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              disabled={!spectatorUrlLan}
                              onClick={() => copyText(spectatorUrlLan, "spectatorLan")}
                            >
                              {copyLabel("spectatorLan")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {spectatorUrlExternal ? (
                        <div className="obs-link-row">
                          <div className="obs-link-main">
                            <div className="obs-link-label">Внешняя</div>
                            <div
                              className={`secret-value obs-link-value${spectatorHidden ? " maskedText" : ""}`}
                              title={spectatorHidden ? ru.showSecret : spectatorUrlExternal}
                            >
                              {maskValue(spectatorUrlExternal, spectatorHidden)}
                            </div>
                          </div>
                          <div className="secret-actions">
                            <button
                              type="button"
                              className="ghost iconButton"
                              aria-label={spectatorHidden ? ru.showSecret : ru.hideSecret}
                              title={spectatorHidden ? ru.showSecret : ru.hideSecret}
                              onClick={() => setShowSpectatorLink((prev) => !prev)}
                            >
                              <EyeIcon open={!spectatorHidden} />
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              onClick={() =>
                                spectatorUrlExternal && window.open(spectatorUrlExternal, "_blank", "noopener,noreferrer")
                              }
                            >
                              {ru.openButton}
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              onClick={() => copyText(spectatorUrlExternal, "spectatorExternal")}
                            >
                              {copyLabel("spectatorExternal")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="muted linksSectionHint">{ru.externalLinksHint}</div>
                      )}
                    </div>
                  </section>

                  <section className="linksSection">
                    <h4 className="linksSectionTitle">OBS Overlay (просмотр)</h4>
                    <div className="obs-links-list">
                      {showLanLinks ? (
                        <div className="obs-link-row">
                          <div className="obs-link-main">
                            <div className="obs-link-label">LAN</div>
                            <div
                              className={`secret-value obs-link-value${overlayViewHidden ? " maskedText" : ""}`}
                              title={overlayViewHidden ? ru.showSecret : overlayViewUrlLan}
                            >
                              {maskValue(overlayViewUrlLan || "—", overlayViewHidden)}
                            </div>
                          </div>
                          <div className="secret-actions">
                            <button
                              type="button"
                              className="ghost iconButton"
                              aria-label={overlayViewHidden ? ru.showSecret : ru.hideSecret}
                              title={overlayViewHidden ? ru.showSecret : ru.hideSecret}
                              onClick={() => setShowOverlayView((prev) => !prev)}
                            >
                              <EyeIcon open={!overlayViewHidden} />
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              disabled={!overlayViewUrlLan}
                              onClick={() =>
                                overlayViewUrlLan && window.open(overlayViewUrlLan, "_blank", "noopener,noreferrer")
                              }
                            >
                              {ru.openButton}
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              disabled={!overlayViewUrlLan}
                              onClick={() => copyText(overlayViewUrlLan, "overlayViewLan")}
                            >
                              {copyLabel("overlayViewLan")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {overlayViewUrlExternal ? (
                        <div className="obs-link-row">
                          <div className="obs-link-main">
                            <div className="obs-link-label">Внешняя</div>
                            <div
                              className={`secret-value obs-link-value${overlayViewHidden ? " maskedText" : ""}`}
                              title={overlayViewHidden ? ru.showSecret : overlayViewUrlExternal}
                            >
                              {maskValue(overlayViewUrlExternal || "—", overlayViewHidden)}
                            </div>
                          </div>
                          <div className="secret-actions">
                            <button
                              type="button"
                              className="ghost iconButton"
                              aria-label={overlayViewHidden ? ru.showSecret : ru.hideSecret}
                              title={overlayViewHidden ? ru.showSecret : ru.hideSecret}
                              onClick={() => setShowOverlayView((prev) => !prev)}
                            >
                              <EyeIcon open={!overlayViewHidden} />
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              onClick={() =>
                                overlayViewUrlExternal && window.open(overlayViewUrlExternal, "_blank", "noopener,noreferrer")
                              }
                            >
                              {ru.openButton}
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              onClick={() => copyText(overlayViewUrlExternal, "overlayViewExternal")}
                            >
                              {copyLabel("overlayViewExternal")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="muted linksSectionHint">{ru.externalLinksHint}</div>
                      )}
                    </div>
                  </section>

                  <section className="linksSection">
                    <h4 className="linksSectionTitle">OBS Overlay (управление)</h4>
                    <div className="obs-links-list">
                      {showLanLinks ? (
                        <div className="obs-link-row">
                          <div className="obs-link-main">
                            <div className="obs-link-label">LAN</div>
                            <div
                              className={`secret-value obs-link-value${overlayControlHidden ? " maskedText" : ""}`}
                              title={overlayControlHidden ? ru.showSecret : overlayControlUrlLan}
                            >
                              {maskValue(overlayControlUrlLan || "—", overlayControlHidden)}
                            </div>
                          </div>
                          <div className="secret-actions">
                            <button
                              type="button"
                              className="ghost iconButton"
                              aria-label={overlayControlHidden ? ru.showSecret : ru.hideSecret}
                              title={overlayControlHidden ? ru.showSecret : ru.hideSecret}
                              onClick={() => setShowOverlayControl((prev) => !prev)}
                            >
                              <EyeIcon open={!overlayControlHidden} />
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              disabled={!overlayControlUrlLan}
                              onClick={() =>
                                overlayControlUrlLan &&
                                window.open(overlayControlUrlLan, "_blank", "noopener,noreferrer")
                              }
                            >
                              {ru.openButton}
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              disabled={!overlayControlUrlLan}
                              onClick={() => copyText(overlayControlUrlLan, "overlayControlLan")}
                            >
                              {copyLabel("overlayControlLan")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {overlayControlUrlExternal ? (
                        <div className="obs-link-row">
                          <div className="obs-link-main">
                            <div className="obs-link-label">Внешняя</div>
                            <div
                              className={`secret-value obs-link-value${overlayControlHidden ? " maskedText" : ""}`}
                              title={overlayControlHidden ? ru.showSecret : overlayControlUrlExternal}
                            >
                              {maskValue(overlayControlUrlExternal || "—", overlayControlHidden)}
                            </div>
                          </div>
                          <div className="secret-actions">
                            <button
                              type="button"
                              className="ghost iconButton"
                              aria-label={overlayControlHidden ? ru.showSecret : ru.hideSecret}
                              title={overlayControlHidden ? ru.showSecret : ru.hideSecret}
                              onClick={() => setShowOverlayControl((prev) => !prev)}
                            >
                              <EyeIcon open={!overlayControlHidden} />
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              onClick={() =>
                                overlayControlUrlExternal &&
                                window.open(overlayControlUrlExternal, "_blank", "noopener,noreferrer")
                              }
                            >
                              {ru.openButton}
                            </button>
                            <button
                              type="button"
                              className="ghost button-small"
                              onClick={() => copyText(overlayControlUrlExternal, "overlayControlExternal")}
                            >
                              {copyLabel("overlayControlExternal")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="muted linksSectionHint">{ru.externalLinksHint}</div>
                      )}
                    </div>
                  </section>

                </>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
      <button className="ghost rulesButton lobbyRulesButton" onClick={() => setRulesOpen(true)}>
        {rulesButtonLabel}
      </button>
      <a
        className="homeWatermark lobbyWatermark"
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub автора"
      >
        Сделано FHR · GitHub
      </a>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
