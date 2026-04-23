import { useEffect, useMemo, useState } from "react";
import {
  LINK_PATHS,
  type BuiltLinkSet,
  type GameSettings,
  type ManualRulesConfig,
  type RoomState,
} from "@bunker/shared";
import { useUiLocaleNamespace, useUiLocaleNamespacesActivation } from "../localization";
import { API_BASE } from "../config";
import InfoTip from "../components/InfoTip";
import RulesModal from "../components/RulesModal";
import Modal from "../components/Modal";
import { OverlayLinkRow } from "../lobby/OverlayLinkRow";
import {
  buildRevealPlan,
  clampInt,
  fitVotesByTotal,
  generateVotesByDefault,
  normalizeVotesByRound,
  parseVotesSchedule,
  sumVotes,
} from "../lobby/rulesMath";

interface LobbyPageProps {
  roomState: RoomState | null;
  playerId: string | null;
  playerToken: string | null;
  isControl: boolean;
  streamerMode: boolean;
  showSpectatorLinks: boolean;
  showHints: boolean;
  wsInteractive: boolean;
  onStart: () => void;
  onUpdateSettings: (settings: GameSettings) => void;
  onUpdateRules: (payload: {
    mode: "auto" | "manual";
    presetPlayerCount?: number;
    manualConfig?: ManualRulesConfig;
  }) => void;
  onKickPlayer: (targetPlayerId: string, options?: { skipConfirm?: boolean }) => void;
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

interface OverlayLinksApiPayload {
  ok: true;
  roomCode: string;
  linkVisibility: string;
  buildProfile: string;
  links: BuiltLinkSet;
}

interface OverlayControlInviteCreatePayload {
  ok: true;
  roomCode: string;
  inviteTokenExpiresInMs: number | null;
  inviteUrlLan: string;
  inviteUrlExternal: string | null;
}

interface SpectatorInviteCreatePayload {
  ok: true;
  roomCode: string;
  maxUses: number;
  inviteTokenExpiresInMs: number | null;
  inviteUrlLan: string;
  inviteUrlExternal: string | null;
}

type LobbyPlayer = RoomState["players"][number];

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

function hasSuspiciousPlayerNameChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function getSafePlayerName(
  playerName: string | null | undefined,
  fallbackName: string
): string {
  const trimmed = typeof playerName === "string" ? playerName.trim() : "";
  return trimmed || fallbackName;
}

export default function LobbyPage({
  roomState,
  playerId,
  playerToken,
  isControl,
  streamerMode,
  showSpectatorLinks,
  showHints,
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
  useUiLocaleNamespacesActivation([
    "lobby",
    "common",
    "overlay-links",
    "room-settings",
    "rules",
    "format",
    "maps",
    "dev",
    "reconnect",
    "misc",
    "game",
  ]);
  const lobbyTexts = useUiLocaleNamespace("lobby", {
    fallbacks: [
      "common",
      "overlay-links",
      "room-settings",
      "rules",
      "format",
      "maps",
      "dev",
      "reconnect",
      "misc",
      "game",
    ],
  });
  const lobbyLocale = useMemo(() => {
    const rawPresetOptions = lobbyTexts.getRaw("rulesPresetOptions");
    const rulesPresetOptions = Array.isArray(rawPresetOptions)
      ? rawPresetOptions.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    return {
      authorGithubAria: lobbyTexts.t("authorGithubAria"),
      authorGithubLabel: lobbyTexts.t("authorGithubLabel"),
      controlMarker: lobbyTexts.t("controlMarker"),
      copiedButton: lobbyTexts.t("copiedButton"),
      copyButton: lobbyTexts.t("copyButton"),
      copyFailed: lobbyTexts.t("copyFailed"),
      devKickNoTargets: lobbyTexts.t("devKickNoTargets"),
      externalLabel: lobbyTexts.t("externalLabel"),
      externalLinksHint: lobbyTexts.t("externalLinksHint"),
      hiddenValue: lobbyTexts.t("hiddenValue"),
      hideSecret: lobbyTexts.t("hideSecret"),
      hostMarker: lobbyTexts.t("hostMarker"),
      hostOnlyHint: lobbyTexts.t("hostOnlyHint"),
      lobbyKickAgreeLabel: lobbyTexts.t("lobbyKickAgreeLabel"),
      lobbyKickButton: lobbyTexts.t("lobbyKickButton"),
      lobbyKickSelectPlaceholder: lobbyTexts.t("lobbyKickSelectPlaceholder"),
      lobbyKickTitle: lobbyTexts.t("lobbyKickTitle"),
      lobbyLoading: lobbyTexts.t("lobbyLoading"),
      lobbyTitle: lobbyTexts.t("lobbyTitle"),
      manualAdjust: lobbyTexts.t("manualAdjust"),
      manualBunkerSlotsLabel: lobbyTexts.t("manualBunkerSlotsLabel"),
      manualFillFromTemplate: lobbyTexts.t("manualFillFromTemplate"),
      manualGenerate: lobbyTexts.t("manualGenerate"),
      manualModeTitle: lobbyTexts.t("manualModeTitle"),
      manualRevealsPlanLabel: lobbyTexts.t("manualRevealsPlanLabel"),
      manualRevealsRecommended: lobbyTexts.t("manualRevealsRecommended"),
      manualRevealsRequiredLabel: lobbyTexts.t("manualRevealsRequiredLabel"),
      manualRevealsWarning: lobbyTexts.t("manualRevealsWarning"),
      manualRoundAdd: lobbyTexts.t("manualRoundAdd"),
      manualRoundRemove: lobbyTexts.t("manualRoundRemove"),
      manualVotesFormatHint: lobbyTexts.t("manualVotesFormatHint"),
      maxPlayersHint: lobbyTexts.t("maxPlayersHint"),
      modalCancel: lobbyTexts.t("modalCancel"),
      obsLinksLoading: lobbyTexts.t("obsLinksLoading"),
      obsLinksTitle: lobbyTexts.t("obsLinksTitle"),
      obsLinksUnavailable: lobbyTexts.t("obsLinksUnavailable"),
      obsOverlayControlSectionTitle: lobbyTexts.t("obsOverlayControlSectionTitle"),
      obsOverlayViewSectionTitle: lobbyTexts.t("obsOverlayViewSectionTitle"),
      offlineMarker: lobbyTexts.t("offlineMarker"),
      openButton: lobbyTexts.t("openButton"),
      playersTitle: lobbyTexts.t("playersTitle"),
      presenterControlHint: lobbyTexts.t("presenterControlHint"),
      rulesButtonShort: lobbyTexts.t("rulesButtonShort"),
      rulesModeAuto: lobbyTexts.t("rulesModeAuto"),
      rulesModeLabel: lobbyTexts.t("rulesModeLabel"),
      rulesModeManual: lobbyTexts.t("rulesModeManual"),
      rulesNeedMinPlayers: lobbyTexts.t("rulesNeedMinPlayers"),
      rulesPresetLabel: lobbyTexts.t("rulesPresetLabel"),
      rulesPresetOptions,
      rulesTitle: lobbyTexts.t("rulesTitle"),
      settingsAutomationAuto: lobbyTexts.t("settingsAutomationAuto"),
      settingsAutomationManual: lobbyTexts.t("settingsAutomationManual"),
      settingsAutomationMode: lobbyTexts.t("settingsAutomationMode"),
      settingsAutomationModeHint: lobbyTexts.t("settingsAutomationModeHint"),
      settingsAutomationSemi: lobbyTexts.t("settingsAutomationSemi"),
      settingsContinueAnyone: lobbyTexts.t("settingsContinueAnyone"),
      settingsContinueHost: lobbyTexts.t("settingsContinueHost"),
      settingsContinuePermission: lobbyTexts.t("settingsContinuePermission"),
      settingsContinueRevealer: lobbyTexts.t("settingsContinueRevealer"),
      settingsContinueTipText: lobbyTexts.t("settingsContinueTipText"),
      settingsFinalThreatReveal: lobbyTexts.t("settingsFinalThreatReveal"),
      settingsForcedDisaster: lobbyTexts.t("settingsForcedDisaster"),
      settingsForcedDisasterRandom: lobbyTexts.t("settingsForcedDisasterRandom"),
      settingsMaxPlayers: lobbyTexts.t("settingsMaxPlayers"),
      settingsOff: lobbyTexts.t("settingsOff"),
      settingsOn: lobbyTexts.t("settingsOn"),
      settingsOtherBlock: lobbyTexts.t("settingsOtherBlock"),
      settingsPostVoteTimer: lobbyTexts.t("settingsPostVoteTimer"),
      settingsPreVoteTimer: lobbyTexts.t("settingsPreVoteTimer"),
      settingsPresenterMode: lobbyTexts.t("settingsPresenterMode"),
      settingsPresenterModeHint: lobbyTexts.t("settingsPresenterModeHint"),
      settingsRevealDiscussionTimer: lobbyTexts.t("settingsRevealDiscussionTimer"),
      settingsRevealTimeoutAction: lobbyTexts.t("settingsRevealTimeoutAction"),
      settingsRevealTimeoutRandom: lobbyTexts.t("settingsRevealTimeoutRandom"),
      settingsRevealTimeoutSkip: lobbyTexts.t("settingsRevealTimeoutSkip"),
      settingsSpecialAnytime: lobbyTexts.t("settingsSpecialAnytime"),
      settingsSpecialUsage: lobbyTexts.t("settingsSpecialUsage"),
      settingsSpecialVotingOnly: lobbyTexts.t("settingsSpecialVotingOnly"),
      settingsThreatAnyone: lobbyTexts.t("settingsThreatAnyone"),
      settingsThreatHost: lobbyTexts.t("settingsThreatHost"),
      settingsThreatTipText: lobbyTexts.t("settingsThreatTipText"),
      settingsTimersBlock: lobbyTexts.t("settingsTimersBlock"),
      settingsTitle: lobbyTexts.t("settingsTitle"),
      showSecret: lobbyTexts.t("showSecret"),
      spectatorLinkHint: lobbyTexts.t("spectatorLinkHint"),
      spectatorLinkTitle: lobbyTexts.t("spectatorLinkTitle"),
      startButton: lobbyTexts.t("startButton"),
      transferHostButton: lobbyTexts.t("transferHostButton"),
      transferHostSelectPlaceholder: lobbyTexts.t("transferHostSelectPlaceholder"),
      transferHostTitle: lobbyTexts.t("transferHostTitle"),
      votesByRoundLabel: lobbyTexts.t("votesByRoundLabel"),
      wsActionDisabledHint: lobbyTexts.t("wsActionDisabledHint"),
      scenarioLabel: (name: string) => lobbyTexts.t("scenarioLabel", { name }),
      rulesPlayers: (count: number) => lobbyTexts.t("rulesPlayers", { count }),
      rulesSeats: (count: number) => lobbyTexts.t("rulesSeats", { count }),
      rulesVotes: (votes: number[]) => lobbyTexts.t("rulesVotes", { values: votes.join(" / ") }),
      rulesExiles: (count: number) => lobbyTexts.t("rulesExiles", { count }),
      playerExtra: (count: number) => lobbyTexts.t("playerExtra", { count }),
      playerFallback: (index: number) => lobbyTexts.t("playerFallback", { index }),
      manualVotesRequired: (count: number) => lobbyTexts.t("manualVotesRequired", { count }),
      manualVotesSumHint: (sum: number, required: number) =>
        lobbyTexts.t("manualVotesSumHint", { sum, required }),
    };
  }, [lobbyTexts]);


  const [overlayLinksLoading, setOverlayLinksLoading] = useState(false);
  const [overlayLinksError, setOverlayLinksError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GameSettings | null>(roomState?.settings ?? null);
  const [kickTargetId, setKickTargetId] = useState("");
  const [kickModalOpen, setKickModalOpen] = useState(false);
  const [kickAgree, setKickAgree] = useState(false);
  const [transferHostTargetId, setTransferHostTargetId] = useState("");
  const [manualTemplatePlayers, setManualTemplatePlayers] = useState(4);
  const [manualVotesInput, setManualVotesInput] = useState("0");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [spectatorAccessMode, setSpectatorAccessMode] = useState<"permanent" | "1" | "2" | "5" | "10">(
    "permanent"
  );

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
    if (!roomState) {
      setKickTargetId("");
      return;
    }
    const candidateIds = roomState.players
      .map((player) => player.playerId)
      .filter((playerId) => playerId !== roomState.controlId);
    setKickTargetId((prev) => (candidateIds.includes(prev) ? prev : candidateIds[0] ?? ""));
    if (candidateIds.length === 0) {
      setKickAgree(false);
      setKickModalOpen(false);
    }
  }, [roomState?.players, roomState?.controlId]);

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
            payload && typeof payload.message === "string" ? payload.message : lobbyLocale.obsLinksUnavailable;
          throw new Error(message);
        }
        if (cancelled) return;
        const raw = payload as OverlayLinksApiPayload & Record<string, unknown>;
        const links = raw.links;
        const apiRoomCode = String(raw.roomCode ?? roomCode).trim().toUpperCase();
        const linkVisibility = String(raw.linkVisibility ?? "all").trim().toLowerCase();
        const buildProfile = String(raw.buildProfile ?? "").trim().toLowerCase();
        const forcePublicOnly = buildProfile === "server";
        const showLanLinks =
          !forcePublicOnly && !(linkVisibility === "public" || linkVisibility === "external");

        if (!links?.viewerUrl?.lan || !links?.overlayViewUrl?.lan || !links?.overlayControlUrl?.lan || !apiRoomCode) {
          throw new Error(lobbyLocale.obsLinksUnavailable);
        }

        const lanSpectator = showLanLinks ? links.viewerUrl.lan : "";
        const lanOverlayView = showLanLinks ? links.overlayViewUrl.lan : "";
        const lanOverlayControl = showLanLinks ? links.overlayControlUrl.lan : "";
        setOverlayLinks({
          showLanLinks,
          spectatorUrlLan: lanSpectator,
          spectatorUrlExternal: links.viewerUrl.public ?? "",
          overlayViewUrlLan: lanOverlayView,
          overlayViewUrlExternal: links.overlayViewUrl.public ?? "",
          overlayControlUrlLan: lanOverlayControl,
          overlayControlUrlExternal: links.overlayControlUrl.public ?? "",
        });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : lobbyLocale.obsLinksUnavailable;
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
      window.alert(lobbyLocale.copyFailed);
      return;
    }
    setCopiedKey(key);
  };

  const copyFreshOverlayControlInvite = async (variant: "lan" | "external") => {
    if (!roomCode || !playerToken || !canControl) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}${LINK_PATHS.overlayControlInviteCreate}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, token: playerToken }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        const message =
          payload && typeof payload.message === "string" ? payload.message : lobbyLocale.obsLinksUnavailable;
        throw new Error(message);
      }

      const raw = payload as OverlayControlInviteCreatePayload;
      const nextLan = String(raw.inviteUrlLan ?? "").trim();
      const nextExternal = String(raw.inviteUrlExternal ?? "").trim();
      if (!nextLan) {
        throw new Error(lobbyLocale.obsLinksUnavailable);
      }

      setOverlayLinksError(null);
      setOverlayLinks((prev) =>
        prev
          ? {
              ...prev,
              overlayControlUrlLan: nextLan,
              overlayControlUrlExternal: nextExternal,
            }
          : prev
      );

      const valueToCopy = variant === "external" ? nextExternal || nextLan : nextLan;
      await copyText(valueToCopy, variant === "external" ? "overlayControlExternal" : "overlayControlLan");
    } catch (error) {
      const message = error instanceof Error ? error.message : lobbyLocale.obsLinksUnavailable;
      setOverlayLinksError(message);
      window.alert(message);
    }
  };

  const copySpectatorLink = async (variant: "lan" | "external") => {
    const fallbackValue = variant === "external" ? spectatorUrlExternal || spectatorUrlLan : spectatorUrlLan;
    if (!fallbackValue) return;

    if (spectatorAccessMode === "permanent") {
      await copyText(fallbackValue, variant === "external" ? "spectatorExternal" : "spectatorLan");
      return;
    }

    if (!roomCode || !playerToken || !canControl) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}${LINK_PATHS.spectatorInviteCreate}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode,
          token: playerToken,
          maxUses: Number(spectatorAccessMode),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        const message =
          payload && typeof payload.message === "string" ? payload.message : lobbyLocale.obsLinksUnavailable;
        throw new Error(message);
      }

      const raw = payload as SpectatorInviteCreatePayload;
      const inviteUrlLan = String(raw.inviteUrlLan ?? "").trim();
      const inviteUrlExternal = String(raw.inviteUrlExternal ?? "").trim();
      const valueToCopy = variant === "external" ? inviteUrlExternal || inviteUrlLan : inviteUrlLan;
      if (!valueToCopy) {
        throw new Error(lobbyLocale.obsLinksUnavailable);
      }

      setOverlayLinksError(null);
      await copyText(valueToCopy, variant === "external" ? "spectatorExternal" : "spectatorLan");
    } catch (error) {
      const message = error instanceof Error ? error.message : lobbyLocale.obsLinksUnavailable;
      setOverlayLinksError(message);
      window.alert(message);
    }
  };

  if (!roomState) {
    return (
      <section className="panel">
        <h2>{lobbyLocale.lobbyTitle}</h2>
        <p className="muted">{lobbyLocale.lobbyLoading}</p>
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
    copiedKey === key ? lobbyLocale.copiedButton : lobbyLocale.copyButton;

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
      ? lobbyLocale.settingsForcedDisasterRandom
      : disasterTitleById.get(normalizedForcedDisasterId) ?? normalizedForcedDisasterId;
  const isClassic = roomState.scenarioMeta.id === "classic";
  const ruleset = roomState.ruleset;
  const rulesMode: "auto" | "manual" = ruleset.rulesetMode === "auto" ? "auto" : "manual";
  const presetCount =
    roomState.rulesPresetCount ?? ruleset.manualConfig?.seedTemplatePlayers ?? ruleset.playerCount;
  const rulesModeText = rulesMode === "manual" ? lobbyLocale.rulesModeManual : lobbyLocale.rulesModeAuto;
  const votesSummary = lobbyLocale.rulesVotes(ruleset.votesPerRound);
  const votesSeparatorIndex = votesSummary.indexOf(":");
  const votesLabel =
    votesSeparatorIndex >= 0 ? votesSummary.slice(0, votesSeparatorIndex + 1) : lobbyLocale.votesByRoundLabel;
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
  const wsHint = controlsDisabled ? lobbyLocale.wsActionDisabledHint : null;
  const continueTipText = lobbyLocale.settingsContinueTipText;
  const threatTipText = lobbyLocale.settingsThreatTipText;
  const rulesButtonLabel = lobbyLocale.rulesButtonShort;

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
  const getFallbackPlayerName = (player: LobbyPlayer): string =>
    lobbyLocale.playerFallback((playerIndexById.get(player.playerId) ?? 0) + 1);
  const getLobbyPlayerName = (player: LobbyPlayer): string =>
    getSafePlayerName(player.name, getFallbackPlayerName(player));

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
              <h3 className="lobbyCardTitle">{lobbyLocale.playersTitle}</h3>
            </div>
            <div className="lobbyCardBody">
              <ul className="player-list compact">
                {visiblePlayers.map((player) => {
                  const safeName = getLobbyPlayerName(player);
                  return (
                    <li key={player.playerId}>
                      {safeName}
                      {player.playerId === roomState.hostId ? lobbyLocale.hostMarker : ""}
                      {player.playerId === roomState.controlId ? lobbyLocale.controlMarker : ""}
                      {player.connected ? "" : lobbyLocale.offlineMarker}
                    </li>
                  );
                })}
              </ul>
              {extraPlayers > 0 ? <div className="muted player-extra">{lobbyLocale.playerExtra(extraPlayers)}</div> : null}

              {canControl && kickCandidates.length > 0 ? (
                <div className="formRow">
                  <span>{lobbyLocale.lobbyKickTitle}</span>
                  <div className="formControlRow">
                    <button
                      className="ghost button-small"
                      disabled={controlsDisabled}
                      onClick={() => {
                        if (controlsDisabled) return;
                        setKickAgree(false);
                        setKickModalOpen(true);
                      }}
                    >
                      {lobbyLocale.lobbyKickButton}
                    </button>
                  </div>
                </div>
              ) : null}

              {canControl ? (
                <div className="formRow formRow--transferHost">
                  <span>{lobbyLocale.transferHostTitle}</span>
                  <div className="formControlRow formControlRow--transferHost">
                    <select
                      value={transferHostTargetId}
                      disabled={controlsDisabled || transferHostCandidates.length === 0}
                      onChange={(event) => setTransferHostTargetId(event.target.value)}
                    >
                      {transferHostCandidates.length === 0 ? (
                        <option value="" disabled>
                          {lobbyLocale.transferHostSelectPlaceholder}
                        </option>
                      ) : null}
                      {transferHostCandidates.map((player) => {
                        const safeName = getLobbyPlayerName(player);
                        return (
                          <option key={player.playerId} value={player.playerId}>
                            {safeName}
                            {player.playerId === roomState.controlId ? lobbyLocale.controlMarker : ""}
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
                      {lobbyLocale.transferHostButton}
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
                    {lobbyLocale.startButton}
                  </button>
                  {!canStart && isClassic ? <span className="muted">{lobbyLocale.rulesNeedMinPlayers}</span> : null}
                  {wsHint ? <span className="muted wsDisabledHint">{wsHint}</span> : null}
                </div>
              ) : (
                <div className="muted playerOnlyHint">{lobbyLocale.hostOnlyHint}</div>
              )}
            </div>
          </section>

          <section className="lobbyCard lobbyCard--rules rulesCard">
            <div className="lobbyCardHeader">
              <h3 className="lobbyCardTitle">{lobbyLocale.rulesTitle}</h3>
            </div>
            <div className="lobbyCardBody">
              <div className="rulesTop">
                <div className="lobbyMetaLine">
                  <span className="muted">{lobbyLocale.scenarioLabel(roomState.scenarioMeta.name)}</span>
                </div>
                <div className="rulesModeBox">
                  <div className="rulesModeLabel">{lobbyLocale.rulesModeLabel}</div>
                  {canControl && isClassic ? (
                    <select
                      className="rulesModeSelect"
                      value={rulesMode}
                      disabled={controlsDisabled}
                      onChange={(event) => applyRulesMode(event.target.value as "auto" | "manual")}
                    >
                      <option value="auto">{lobbyLocale.rulesModeAuto}</option>
                      <option value="manual">{lobbyLocale.rulesModeManual}</option>
                    </select>
                  ) : (
                    <div className="rulesModeValue">{rulesModeText}</div>
                  )}
                </div>
              </div>
              <div className="rulesStats">
                <div className="ruleCell">{lobbyLocale.rulesPlayers(roomState.players.length)}</div>
                <div className="ruleCell">{lobbyLocale.rulesSeats(ruleset.bunkerSeats)}</div>
                <div className="ruleCell ruleCellGhost" aria-hidden="true"></div>
                <div className="ruleCell">{lobbyLocale.rulesExiles(ruleset.totalExiles)}</div>
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
              <h3 className="lobbyCardTitle">{lobbyLocale.settingsTitle}</h3>
            </div>
            <div className="lobbyCardBody">
              {canControl ? (
                <fieldset className="settingsFieldset" disabled={controlsDisabled}>
                  <div className="settings-grid compact">
                  <div className="settings-section-title">{lobbyLocale.settingsTimersBlock}</div>
                  <label className="formRow settingsRow--timer">
                    <span className="settingsLabel">{lobbyLocale.settingsRevealDiscussionTimer}</span>
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
                    <span className="settingsLabel">{lobbyLocale.settingsPreVoteTimer}</span>
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
                    <span className="settingsLabel">{lobbyLocale.settingsPostVoteTimer}</span>
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
                  <div className="settings-section-title">{lobbyLocale.settingsOtherBlock}</div>
                  <label className="formRow">
                    <span className="settingsLabelWithTip">
                      <span>{lobbyLocale.settingsAutomationMode}</span>
                      <InfoTip text={lobbyLocale.settingsAutomationModeHint} />
                    </span>
                    <select
                      value={settings.automationMode}
                      onChange={(event) =>
                        updateAutomationMode(event.target.value as GameSettings["automationMode"])
                      }
                    >
                      <option value="auto">{lobbyLocale.settingsAutomationAuto}</option>
                      <option value="semi">{lobbyLocale.settingsAutomationSemi}</option>
                      <option value="manual">{lobbyLocale.settingsAutomationManual}</option>
                    </select>
                  </label>
                  <div className="formRow settingsRow--overlayControl">
                    <span className="settingsLabel settingsLabelWithTip">
                      <span>{lobbyLocale.settingsPresenterMode}</span>
                      <InfoTip text={lobbyLocale.settingsPresenterModeHint} />
                    </span>
                    <div className="formControlRow settingsControls checkboxLabel">
                      <div className="overlayControlCheckbox">
                        <input
                          type="checkbox"
                          checked={settings.enablePresenterMode}
                          onChange={(event) => updateField("enablePresenterMode", event.target.checked)}
                        />
                        <small className="muted">{lobbyLocale.settingsPresenterModeHint}</small>
                      </div>
                    </div>
                  </div>
                  <label className="formRow">
                    <span className="settingsLabelWithTip">
                      <span>{lobbyLocale.settingsContinuePermission}</span>
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
                      <option value="host_only">{lobbyLocale.settingsContinueHost}</option>
                      <option value="revealer_only">{lobbyLocale.settingsContinueRevealer}</option>
                      <option value="anyone">{lobbyLocale.settingsContinueAnyone}</option>
                    </select>
                  </label>
                  <label className="formRow">
                    <span>{lobbyLocale.settingsRevealTimeoutAction}</span>
                    <select
                      value={settings.revealTimeoutAction}
                      onChange={(event) =>
                        updateField(
                          "revealTimeoutAction",
                          event.target.value as GameSettings["revealTimeoutAction"]
                        )
                      }
                    >
                      <option value="random_card">{lobbyLocale.settingsRevealTimeoutRandom}</option>
                      <option value="skip_player">{lobbyLocale.settingsRevealTimeoutSkip}</option>
                    </select>
                  </label>
                  <label className="formRow">
                    <span>{lobbyLocale.settingsSpecialUsage}</span>
                    <select
                      value={settings.specialUsage}
                      onChange={(event) =>
                        updateField("specialUsage", event.target.value as GameSettings["specialUsage"])
                      }
                    >
                      <option value="anytime">{lobbyLocale.settingsSpecialAnytime}</option>
                      <option value="only_during_voting">{lobbyLocale.settingsSpecialVotingOnly}</option>
                    </select>
                  </label>
                  <label className="formRow">
                    <span className="settingsLabelWithTip">
                      <span>{lobbyLocale.settingsFinalThreatReveal}</span>
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
                      <option value="host">{lobbyLocale.settingsThreatHost}</option>
                      <option value="anyone">{lobbyLocale.settingsThreatAnyone}</option>
                    </select>
                  </label>
                  {supportsForcedDisaster ? (
                    <label className="formRow">
                      <span>{lobbyLocale.settingsForcedDisaster}</span>
                      <select
                        value={normalizedForcedDisasterId}
                        onChange={(event) => updateField("forcedDisasterId", event.target.value)}
                      >
                        <option value="random">{lobbyLocale.settingsForcedDisasterRandom}</option>
                        {disasterOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="formRow">
                    <span>{lobbyLocale.settingsMaxPlayers}</span>
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
                      <small className="muted">{lobbyLocale.maxPlayersHint}</small>
                    </div>
                  </label>
                </div>
                </fieldset>
              ) : (
                <div className="settings-readonly compact">
                  <div>
                    {lobbyLocale.settingsAutomationMode}:{" "}
                    {settings.automationMode === "manual"
                      ? lobbyLocale.settingsAutomationManual
                      : settings.automationMode === "semi"
                        ? lobbyLocale.settingsAutomationSemi
                        : lobbyLocale.settingsAutomationAuto}
                  </div>
                  <div>
                    {lobbyLocale.settingsPresenterMode}: {settings.enablePresenterMode ? lobbyLocale.settingsOn : lobbyLocale.settingsOff}
                  </div>
                  <div>
                    {lobbyLocale.settingsRevealDiscussionTimer}:{" "}
                    {settings.enableRevealDiscussionTimer ? lobbyLocale.settingsOn : lobbyLocale.settingsOff} (
                    {settings.revealDiscussionSeconds}s)
                  </div>
                  <div>
                    {lobbyLocale.settingsPreVoteTimer}: {settings.enablePreVoteDiscussionTimer ? lobbyLocale.settingsOn : lobbyLocale.settingsOff} (
                    {settings.preVoteDiscussionSeconds}s)
                  </div>
                  <div>
                    {lobbyLocale.settingsPostVoteTimer}: {settings.enablePostVoteDiscussionTimer ? lobbyLocale.settingsOn : lobbyLocale.settingsOff} (
                    {settings.postVoteDiscussionSeconds}s)
                  </div>
                  <div>
                    {lobbyLocale.settingsContinuePermission}:{" "}
                    {settings.continuePermission === "host_only"
                      ? lobbyLocale.settingsContinueHost
                      : settings.continuePermission === "revealer_only"
                        ? lobbyLocale.settingsContinueRevealer
                        : lobbyLocale.settingsContinueAnyone}
                  </div>
                  <div>
                    {lobbyLocale.settingsRevealTimeoutAction}:{" "}
                    {settings.revealTimeoutAction === "random_card" ? lobbyLocale.settingsRevealTimeoutRandom : lobbyLocale.settingsRevealTimeoutSkip}
                  </div>
                  <div>
                    {lobbyLocale.settingsSpecialUsage}: {settings.specialUsage === "anytime" ? lobbyLocale.settingsSpecialAnytime : lobbyLocale.settingsSpecialVotingOnly}
                  </div>
                  <div>
                    {lobbyLocale.settingsFinalThreatReveal}:{" "}
                    {settings.finalThreatReveal === "anyone" ? lobbyLocale.settingsThreatAnyone : lobbyLocale.settingsThreatHost}
                  </div>
                  {supportsForcedDisaster ? (
                    <div>
                      {lobbyLocale.settingsForcedDisaster}: {forcedDisasterTitle}
                    </div>
                  ) : null}
                  <div>
                    {lobbyLocale.settingsMaxPlayers}: {settings.maxPlayers}
                  </div>
                </div>
              )}
              {canControl && wsHint ? <div className="muted wsDisabledHint">{wsHint}</div> : null}
              {canControl && settings.enablePresenterMode ? (
                <div className="muted presenterHint">{lobbyLocale.presenterControlHint}</div>
              ) : null}
            </div>
          </section>
          {canControl && isClassic && rulesMode === "manual" ? (
            <section className="lobbyCard lobbyCard--manual manualCard">
              <div className="lobbyCardHeader">
                <h3 className="lobbyCardTitle">{lobbyLocale.manualModeTitle}</h3>
              </div>
              <div className="lobbyCardBody">
                <fieldset className="settingsFieldset" disabled={controlsDisabled}>
                <div className="manualRulesBuilder">
                  <div className="manualRulesRow">
                    <label>
                      <span>{lobbyLocale.rulesPresetLabel}</span>
                      <select
                        value={manualTemplatePlayers}
                        onChange={(event) => setManualTemplatePlayers(Number(event.target.value))}
                      >
                        {lobbyLocale.rulesPresetOptions.map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="ghost button-small" onClick={fillManualFromTemplate}>
                      {lobbyLocale.manualFillFromTemplate}
                    </button>
                  </div>

                  <div className="manualRulesRow manualRulesRow3Wide">
                    <label>
                      <span>{lobbyLocale.manualBunkerSlotsLabel}</span>
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
                      {lobbyLocale.manualVotesRequired(requiredVotes)}
                    </div>
                    <label className="manualRevealTargetField">
                      <span>{lobbyLocale.manualRevealsRequiredLabel}</span>
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
                      {lobbyLocale.manualRevealsRecommended}
                    </div>
                    {manualRevealNotRecommended ? (
                      <div className="manualRevealWarning">
                        {lobbyLocale.manualRevealsWarning}
                      </div>
                    ) : null}
                    <div className="manualRevealPlan">
                      {lobbyLocale.manualRevealsPlanLabel} <span className="nowrap">{revealPlanText}</span>
                    </div>
                  </div>

                  <div className="manualVotesHeader">
                    <div>{lobbyLocale.votesByRoundLabel}</div>
                    <div className="manualVotesActions">
                      <button
                        className="ghost button-small"
                        onClick={() =>
                          updateManualConfig({
                            votesByRound: [...manualConfig.votesByRound, 0],
                          })
                        }
                      >
                        {lobbyLocale.manualRoundAdd}
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
                        {lobbyLocale.manualRoundRemove}
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
                        {lobbyLocale.manualGenerate}
                      </button>
                    </div>
                  </div>

                  <label className="manualVotesTextField">
                    <span>{lobbyLocale.manualVotesFormatHint}</span>
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
                      {lobbyLocale.manualVotesSumHint(manualVotesSum, requiredVotes)}
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
                        {lobbyLocale.manualAdjust}
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
              <h3 className="lobbyCardTitle">{lobbyLocale.obsLinksTitle}</h3>
            </div>
            <div className="lobbyCardBody">
              {showHints ? <div className="muted">{lobbyLocale.spectatorLinkHint}</div> : null}
              {overlayLinksLoading ? <div className="muted">{lobbyLocale.obsLinksLoading}</div> : null}
              {!overlayLinksLoading && overlayLinksError ? (
                <div className="muted">{overlayLinksError || lobbyLocale.obsLinksUnavailable}</div>
              ) : null}
              {!overlayLinksLoading && overlayLinks ? (
                <>
                  {showSpectatorLinks ? (
                    <section className="linksSection">
                      <h4 className="linksSectionTitle">{lobbyLocale.spectatorLinkTitle}</h4>
                      <div className="formRow" style={{ marginBottom: 8 }}>
                        <span>Доступ по зрительской ссылке</span>
                        <div className="formControlRow">
                          <select
                            value={spectatorAccessMode}
                            onChange={(event) =>
                              setSpectatorAccessMode(event.target.value as "permanent" | "1" | "2" | "5" | "10")
                            }
                          >
                            <option value="permanent">Постоянная</option>
                            <option value="1">Лимит: 1 зритель</option>
                            <option value="2">Лимит: 2 зрителя</option>
                            <option value="5">Лимит: 5 зрителей</option>
                            <option value="10">Лимит: 10 зрителей</option>
                          </select>
                        </div>
                      </div>
                      <div className="obs-links-list">
                        {showLanLinks ? (
                          <OverlayLinkRow
                            label="LAN"
                            value={spectatorUrlLan}
                            hidden={spectatorHidden}
                            hiddenValueLabel={lobbyLocale.hiddenValue}
                            unavailableLabel={lobbyLocale.obsLinksUnavailable}
                            showSecretLabel={lobbyLocale.showSecret}
                            hideSecretLabel={lobbyLocale.hideSecret}
                            openButtonLabel={lobbyLocale.openButton}
                            copyButtonLabel={copyLabel("spectatorLan")}
                            onToggleHidden={() => setShowSpectatorLink((prev) => !prev)}
                            onOpen={() => {
                              if (spectatorUrlLan) {
                                window.open(spectatorUrlLan, "_blank", "noopener,noreferrer");
                              }
                            }}
                            onCopy={() => {
                              void copySpectatorLink("lan");
                            }}
                            disableOpen={!spectatorUrlLan}
                            disableCopy={!spectatorUrlLan}
                          />
                        ) : null}
                        {spectatorUrlExternal ? (
                          <OverlayLinkRow
                            label={lobbyLocale.externalLabel}
                            value={spectatorUrlExternal}
                            hidden={spectatorHidden}
                            hiddenValueLabel={lobbyLocale.hiddenValue}
                            unavailableLabel={lobbyLocale.obsLinksUnavailable}
                            showSecretLabel={lobbyLocale.showSecret}
                            hideSecretLabel={lobbyLocale.hideSecret}
                            openButtonLabel={lobbyLocale.openButton}
                            copyButtonLabel={copyLabel("spectatorExternal")}
                            onToggleHidden={() => setShowSpectatorLink((prev) => !prev)}
                            onOpen={() => {
                              window.open(spectatorUrlExternal, "_blank", "noopener,noreferrer");
                            }}
                            onCopy={() => {
                              void copySpectatorLink("external");
                            }}
                          />
                        ) : showHints ? (
                          <div className="muted linksSectionHint">{lobbyLocale.externalLinksHint}</div>
                        ) : null}
                      </div>
                    </section>
                  ) : null}

                  <section className="linksSection">
                    <h4 className="linksSectionTitle">{lobbyLocale.obsOverlayViewSectionTitle}</h4>
                    <div className="obs-links-list">
                      {showLanLinks ? (
                        <OverlayLinkRow
                          label="LAN"
                          value={overlayViewUrlLan}
                          hidden={overlayViewHidden}
                          hiddenValueLabel={lobbyLocale.hiddenValue}
                          unavailableLabel={lobbyLocale.obsLinksUnavailable}
                          showSecretLabel={lobbyLocale.showSecret}
                          hideSecretLabel={lobbyLocale.hideSecret}
                          openButtonLabel={lobbyLocale.openButton}
                          copyButtonLabel={copyLabel("overlayViewLan")}
                          onToggleHidden={() => setShowOverlayView((prev) => !prev)}
                          onOpen={() => {
                            if (overlayViewUrlLan) {
                              window.open(overlayViewUrlLan, "_blank", "noopener,noreferrer");
                            }
                          }}
                          onCopy={() => {
                            void copyText(overlayViewUrlLan, "overlayViewLan");
                          }}
                          disableOpen={!overlayViewUrlLan}
                          disableCopy={!overlayViewUrlLan}
                        />
                      ) : null}
                      {overlayViewUrlExternal ? (
                        <OverlayLinkRow
                          label={lobbyLocale.externalLabel}
                          value={overlayViewUrlExternal}
                          hidden={overlayViewHidden}
                          hiddenValueLabel={lobbyLocale.hiddenValue}
                          unavailableLabel={lobbyLocale.obsLinksUnavailable}
                          showSecretLabel={lobbyLocale.showSecret}
                          hideSecretLabel={lobbyLocale.hideSecret}
                          openButtonLabel={lobbyLocale.openButton}
                          copyButtonLabel={copyLabel("overlayViewExternal")}
                          onToggleHidden={() => setShowOverlayView((prev) => !prev)}
                          onOpen={() => {
                            window.open(overlayViewUrlExternal, "_blank", "noopener,noreferrer");
                          }}
                          onCopy={() => {
                            void copyText(overlayViewUrlExternal, "overlayViewExternal");
                          }}
                        />
                      ) : showHints ? (
                        <div className="muted linksSectionHint">{lobbyLocale.externalLinksHint}</div>
                      ) : null}
                    </div>
                  </section>

                  <section className="linksSection">
                    <h4 className="linksSectionTitle">{lobbyLocale.obsOverlayControlSectionTitle}</h4>
                    <div className="obs-links-list">
                      {showLanLinks ? (
                        <OverlayLinkRow
                          label="LAN"
                          value={overlayControlUrlLan}
                          hidden={overlayControlHidden}
                          hiddenValueLabel={lobbyLocale.hiddenValue}
                          unavailableLabel={lobbyLocale.obsLinksUnavailable}
                          showSecretLabel={lobbyLocale.showSecret}
                          hideSecretLabel={lobbyLocale.hideSecret}
                          openButtonLabel={lobbyLocale.openButton}
                          copyButtonLabel={copyLabel("overlayControlLan")}
                          onToggleHidden={() => setShowOverlayControl((prev) => !prev)}
                          onOpen={() => {
                            if (overlayControlUrlLan) {
                              window.open(overlayControlUrlLan, "_blank", "noopener,noreferrer");
                            }
                          }}
                          onCopy={() => {
                            void copyFreshOverlayControlInvite("lan");
                          }}
                          disableOpen={!overlayControlUrlLan}
                          disableCopy={!overlayControlUrlLan}
                        />
                      ) : null}
                      {overlayControlUrlExternal ? (
                        <OverlayLinkRow
                          label={lobbyLocale.externalLabel}
                          value={overlayControlUrlExternal}
                          hidden={overlayControlHidden}
                          hiddenValueLabel={lobbyLocale.hiddenValue}
                          unavailableLabel={lobbyLocale.obsLinksUnavailable}
                          showSecretLabel={lobbyLocale.showSecret}
                          hideSecretLabel={lobbyLocale.hideSecret}
                          openButtonLabel={lobbyLocale.openButton}
                          copyButtonLabel={copyLabel("overlayControlExternal")}
                          onToggleHidden={() => setShowOverlayControl((prev) => !prev)}
                          onOpen={() => {
                            window.open(overlayControlUrlExternal, "_blank", "noopener,noreferrer");
                          }}
                          onCopy={() => {
                            void copyFreshOverlayControlInvite("external");
                          }}
                        />
                      ) : showHints ? (
                        <div className="muted linksSectionHint">{lobbyLocale.externalLinksHint}</div>
                      ) : null}
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
        aria-label={lobbyLocale.authorGithubAria}
      >
        {lobbyLocale.authorGithubLabel}
      </a>
      <Modal
        open={kickModalOpen && canControl}
        title={lobbyLocale.lobbyKickTitle}
        onClose={() => {
          setKickModalOpen(false);
          setKickAgree(false);
        }}
        dismissible={true}
      >
        {kickCandidates.length === 0 ? (
          <div className="muted">{lobbyLocale.devKickNoTargets}</div>
        ) : (
          <>
            <label className="topbar-menu-field">
              <span>{lobbyLocale.lobbyKickSelectPlaceholder}</span>
              <select
                value={kickTargetId}
                disabled={controlsDisabled}
                onChange={(event) => setKickTargetId(event.target.value)}
              >
                {kickCandidates.map((player) => {
                  const safeName = getLobbyPlayerName(player);
                  return (
                    <option key={player.playerId} value={player.playerId}>
                      {safeName}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="topbar-menu-checkbox">
              <input
                type="checkbox"
                checked={kickAgree}
                onChange={(event) => setKickAgree(event.target.checked)}
              />
              <span>{lobbyLocale.lobbyKickAgreeLabel}</span>
            </label>
            <div className="modal-actions">
              <button
                className="ghost"
                onClick={() => {
                  setKickModalOpen(false);
                  setKickAgree(false);
                }}
              >
                {lobbyLocale.modalCancel}
              </button>
              <button
                className="primary"
                disabled={!kickTargetId || !kickAgree || controlsDisabled}
                onClick={() => {
                  if (controlsDisabled) return;
                  if (!kickTargetId || !kickAgree) return;
                  onKickPlayer(kickTargetId, { skipConfirm: true });
                  setKickModalOpen(false);
                  setKickAgree(false);
                }}
              >
                {lobbyLocale.lobbyKickButton}
              </button>
            </div>
          </>
        )}
      </Modal>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
