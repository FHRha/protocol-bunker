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
import RulesModal from "../components/RulesModal";
import { LobbyKickModal } from "../lobby/LobbyKickModal";
import { LobbyManualRulesCard } from "../lobby/LobbyManualRulesCard";
import { LobbyObsCard } from "../lobby/LobbyObsCard";
import { LobbyPlayersCard } from "../lobby/LobbyPlayersCard";
import { LobbyRulesCard } from "../lobby/LobbyRulesCard";
import { LobbySettingsCard } from "../lobby/LobbySettingsCard";
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
          <LobbyPlayersCard
            title={lobbyLocale.playersTitle}
            visiblePlayers={visiblePlayers}
            hostId={roomState.hostId}
            controlId={roomState.controlId}
            hostMarker={lobbyLocale.hostMarker}
            controlMarker={lobbyLocale.controlMarker}
            offlineMarker={lobbyLocale.offlineMarker}
            extraPlayers={extraPlayers}
            playerExtraText={extraPlayers > 0 ? lobbyLocale.playerExtra(extraPlayers) : null}
            canControl={canControl}
            kickCandidatesCount={kickCandidates.length}
            kickTitle={lobbyLocale.lobbyKickTitle}
            kickButton={lobbyLocale.lobbyKickButton}
            controlsDisabled={controlsDisabled}
            transferHostTitle={lobbyLocale.transferHostTitle}
            transferHostTargetId={transferHostTargetId}
            transferHostCandidates={transferHostCandidates}
            transferHostSelectPlaceholder={lobbyLocale.transferHostSelectPlaceholder}
            transferHostButton={lobbyLocale.transferHostButton}
            startButton={lobbyLocale.startButton}
            canStart={canStart}
            isClassic={isClassic}
            rulesNeedMinPlayers={lobbyLocale.rulesNeedMinPlayers}
            hostOnlyHint={lobbyLocale.hostOnlyHint}
            wsHint={wsHint}
            getLobbyPlayerName={getLobbyPlayerName}
            onOpenKickModal={() => {
              if (controlsDisabled) return;
              setKickAgree(false);
              setKickModalOpen(true);
            }}
            onTransferHostTargetChange={setTransferHostTargetId}
            onTransferHost={onTransferHost}
            onStart={() => {
              if (controlsDisabled) return;
              onStart();
            }}
          />

          <LobbyRulesCard
            title={lobbyLocale.rulesTitle}
            scenarioText={lobbyLocale.scenarioLabel(roomState.scenarioMeta.name)}
            rulesModeLabel={lobbyLocale.rulesModeLabel}
            canControl={canControl}
            isClassic={isClassic}
            rulesMode={rulesMode}
            rulesModeText={rulesModeText}
            controlsDisabled={controlsDisabled}
            rulesModeAuto={lobbyLocale.rulesModeAuto}
            rulesModeManual={lobbyLocale.rulesModeManual}
            onApplyRulesMode={applyRulesMode}
            playersText={lobbyLocale.rulesPlayers(roomState.players.length)}
            seatsText={lobbyLocale.rulesSeats(ruleset.bunkerSeats)}
            exilesText={lobbyLocale.rulesExiles(ruleset.totalExiles)}
            votesLabel={votesLabel}
            votesValue={votesValue}
          />
          {canControl && isClassic && rulesMode === "manual" ? (
            <LobbyManualRulesCard
              text={{
                manualModeTitle: lobbyLocale.manualModeTitle,
                rulesPresetLabel: lobbyLocale.rulesPresetLabel,
                manualFillFromTemplate: lobbyLocale.manualFillFromTemplate,
                manualBunkerSlotsLabel: lobbyLocale.manualBunkerSlotsLabel,
                manualVotesRequired: lobbyLocale.manualVotesRequired,
                manualRevealsRequiredLabel: lobbyLocale.manualRevealsRequiredLabel,
                manualRevealsRecommended: lobbyLocale.manualRevealsRecommended,
                manualRevealsWarning: lobbyLocale.manualRevealsWarning,
                manualRevealsPlanLabel: lobbyLocale.manualRevealsPlanLabel,
                votesByRoundLabel: lobbyLocale.votesByRoundLabel,
                manualRoundAdd: lobbyLocale.manualRoundAdd,
                manualRoundRemove: lobbyLocale.manualRoundRemove,
                manualGenerate: lobbyLocale.manualGenerate,
                manualVotesFormatHint: lobbyLocale.manualVotesFormatHint,
                manualVotesSumHint: lobbyLocale.manualVotesSumHint,
                manualAdjust: lobbyLocale.manualAdjust,
              }}
              controlsDisabled={controlsDisabled}
              manualTemplatePlayers={manualTemplatePlayers}
              setManualTemplatePlayers={setManualTemplatePlayers}
              rulesPresetOptions={lobbyLocale.rulesPresetOptions}
              fillManualFromTemplate={fillManualFromTemplate}
              manualConfig={manualConfig}
              requiredVotes={requiredVotes}
              manualRevealNotRecommended={manualRevealNotRecommended}
              revealPlanText={revealPlanText}
              updateManualConfig={updateManualConfig}
              manualVotesInput={manualVotesInput}
              setManualVotesInput={setManualVotesInput}
              parseVotesSchedule={parseVotesSchedule}
              generateVotesByDefault={generateVotesByDefault}
              fitVotesByTotal={fitVotesByTotal}
              manualVotesMismatch={manualVotesMismatch}
              manualVotesSum={manualVotesSum}
              wsHint={wsHint}
            />
          ) : null}
        </div>

        <div className="lobbyRightColumn">
          <LobbySettingsCard
            text={{
              settingsTitle: lobbyLocale.settingsTitle,
              settingsTimersBlock: lobbyLocale.settingsTimersBlock,
              settingsRevealDiscussionTimer: lobbyLocale.settingsRevealDiscussionTimer,
              settingsPreVoteTimer: lobbyLocale.settingsPreVoteTimer,
              settingsPostVoteTimer: lobbyLocale.settingsPostVoteTimer,
              settingsOtherBlock: lobbyLocale.settingsOtherBlock,
              settingsAutomationMode: lobbyLocale.settingsAutomationMode,
              settingsAutomationModeHint: lobbyLocale.settingsAutomationModeHint,
              settingsAutomationAuto: lobbyLocale.settingsAutomationAuto,
              settingsAutomationSemi: lobbyLocale.settingsAutomationSemi,
              settingsAutomationManual: lobbyLocale.settingsAutomationManual,
              settingsPresenterMode: lobbyLocale.settingsPresenterMode,
              settingsPresenterModeHint: lobbyLocale.settingsPresenterModeHint,
              settingsContinuePermission: lobbyLocale.settingsContinuePermission,
              settingsContinueHost: lobbyLocale.settingsContinueHost,
              settingsContinueRevealer: lobbyLocale.settingsContinueRevealer,
              settingsContinueAnyone: lobbyLocale.settingsContinueAnyone,
              settingsRevealTimeoutAction: lobbyLocale.settingsRevealTimeoutAction,
              settingsRevealTimeoutRandom: lobbyLocale.settingsRevealTimeoutRandom,
              settingsRevealTimeoutSkip: lobbyLocale.settingsRevealTimeoutSkip,
              settingsSpecialUsage: lobbyLocale.settingsSpecialUsage,
              settingsSpecialAnytime: lobbyLocale.settingsSpecialAnytime,
              settingsSpecialVotingOnly: lobbyLocale.settingsSpecialVotingOnly,
              settingsFinalThreatReveal: lobbyLocale.settingsFinalThreatReveal,
              settingsThreatHost: lobbyLocale.settingsThreatHost,
              settingsThreatAnyone: lobbyLocale.settingsThreatAnyone,
              settingsForcedDisaster: lobbyLocale.settingsForcedDisaster,
              settingsForcedDisasterRandom: lobbyLocale.settingsForcedDisasterRandom,
              settingsMaxPlayers: lobbyLocale.settingsMaxPlayers,
              maxPlayersHint: lobbyLocale.maxPlayersHint,
              settingsOn: lobbyLocale.settingsOn,
              settingsOff: lobbyLocale.settingsOff,
              presenterControlHint: lobbyLocale.presenterControlHint,
            }}
            canControl={canControl}
            controlsDisabled={controlsDisabled}
            settings={settings}
            continueTipText={continueTipText}
            threatTipText={threatTipText}
            supportsForcedDisaster={supportsForcedDisaster}
            normalizedForcedDisasterId={normalizedForcedDisasterId}
            disasterOptions={disasterOptions}
            forcedDisasterTitle={forcedDisasterTitle}
            minPlayersLimit={minPlayersLimit}
            wsHint={wsHint}
            updateField={updateField}
            updateAutomationMode={updateAutomationMode}
          />
        </div>
        {canControl ? (
          <LobbyObsCard
            text={{
              obsLinksTitle: lobbyLocale.obsLinksTitle,
              spectatorLinkHint: lobbyLocale.spectatorLinkHint,
              obsLinksLoading: lobbyLocale.obsLinksLoading,
              obsLinksUnavailable: lobbyLocale.obsLinksUnavailable,
              spectatorLinkTitle: lobbyLocale.spectatorLinkTitle,
              externalLabel: lobbyLocale.externalLabel,
              hiddenValue: lobbyLocale.hiddenValue,
              showSecret: lobbyLocale.showSecret,
              hideSecret: lobbyLocale.hideSecret,
              openButton: lobbyLocale.openButton,
              externalLinksHint: lobbyLocale.externalLinksHint,
              obsOverlayViewSectionTitle: lobbyLocale.obsOverlayViewSectionTitle,
              obsOverlayControlSectionTitle: lobbyLocale.obsOverlayControlSectionTitle,
            }}
            showHints={showHints}
            overlayLinksLoading={overlayLinksLoading}
            overlayLinksError={overlayLinksError}
            hasOverlayLinks={Boolean(overlayLinks)}
            showSpectatorLinks={showSpectatorLinks}
            spectatorAccessMode={spectatorAccessMode}
            setSpectatorAccessMode={setSpectatorAccessMode}
            showLanLinks={showLanLinks}
            spectatorHidden={spectatorHidden}
            spectatorUrlLan={spectatorUrlLan}
            spectatorUrlExternal={spectatorUrlExternal}
            overlayViewHidden={overlayViewHidden}
            overlayViewUrlLan={overlayViewUrlLan}
            overlayViewUrlExternal={overlayViewUrlExternal}
            overlayControlHidden={overlayControlHidden}
            overlayControlUrlLan={overlayControlUrlLan}
            overlayControlUrlExternal={overlayControlUrlExternal}
            copyLabel={copyLabel}
            onToggleSpectatorHidden={() => setShowSpectatorLink((prev) => !prev)}
            onToggleOverlayViewHidden={() => setShowOverlayView((prev) => !prev)}
            onToggleOverlayControlHidden={() => setShowOverlayControl((prev) => !prev)}
            onCopySpectator={(variant) => {
              void copySpectatorLink(variant);
            }}
            onCopyOverlayView={(variant) => {
              const value = variant === "external" ? overlayViewUrlExternal : overlayViewUrlLan;
              void copyText(value, variant === "external" ? "overlayViewExternal" : "overlayViewLan");
            }}
            onCopyOverlayControl={(variant) => {
              void copyFreshOverlayControlInvite(variant);
            }}
          />
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
      <LobbyKickModal
        open={kickModalOpen && canControl}
        title={lobbyLocale.lobbyKickTitle}
        cancelLabel={lobbyLocale.modalCancel}
        noTargetsLabel={lobbyLocale.devKickNoTargets}
        selectPlaceholder={lobbyLocale.lobbyKickSelectPlaceholder}
        agreeLabel={lobbyLocale.lobbyKickAgreeLabel}
        submitLabel={lobbyLocale.lobbyKickButton}
        kickCandidates={kickCandidates}
        kickTargetId={kickTargetId}
        setKickTargetId={setKickTargetId}
        kickAgree={kickAgree}
        setKickAgree={setKickAgree}
        controlsDisabled={controlsDisabled}
        getLobbyPlayerName={getLobbyPlayerName}
        onClose={() => {
          setKickModalOpen(false);
          setKickAgree(false);
        }}
        onConfirm={(targetPlayerId) => {
          if (controlsDisabled) return;
          onKickPlayer(targetPlayerId, { skipConfirm: true });
          setKickModalOpen(false);
          setKickAgree(false);
        }}
      />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
