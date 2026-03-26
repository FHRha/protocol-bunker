 (async () => {
  function parseOverlayControlParams() {
    const search = new URLSearchParams(window.location.search || "");
    const hashRaw = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
    const hashQueryIndex = hashRaw.indexOf("?");
    const hashParams = new URLSearchParams(hashQueryIndex >= 0 ? hashRaw.slice(hashQueryIndex + 1) : "");

    const getFirst = (keys) => {
      for (const key of keys) {
        const fromSearch = search.get(key);
        if (fromSearch && String(fromSearch).trim()) return String(fromSearch).trim();
        const fromHash = hashParams.get(key);
        if (fromHash && String(fromHash).trim()) return String(fromHash).trim();
      }
      return "";
    };

    const roomCode = getFirst(["room", "roomCode"]).toUpperCase();
    const token = getFirst(["token"]);
    const inviteToken = getFirst(["invite", "inviteToken"]);

    return { roomCode, token, inviteToken };
  }

  const parsedParams = parseOverlayControlParams();
  const roomCode = parsedParams.roomCode;
  let token = parsedParams.token;
  const inviteToken = parsedParams.inviteToken;
  const TAB_ID_KEY = "bunker.dev_tab_id";
  const SESSION_ID_KEY = "bunker.sessionId";
  const CONTROL_SESSION_TOKEN_PREFIX = "bunker.overlayControl.sessionToken";
  const LOCALE_STORAGE_KEY = "bunker.locale";

  const controlSessionStorageKey = roomCode ? `${CONTROL_SESSION_TOKEN_PREFIX}:${roomCode}` : CONTROL_SESSION_TOKEN_PREFIX;

  function readControlSessionToken() {
    if (!roomCode) return "";
    try {
      const value = sessionStorage.getItem(controlSessionStorageKey);
      return value && String(value).trim() ? String(value).trim() : "";
    } catch {
      return "";
    }
  }

  function writeControlSessionToken(nextToken) {
    if (!roomCode || !nextToken) return;
    try {
      sessionStorage.setItem(controlSessionStorageKey, String(nextToken));
    } catch {
      // ignore storage errors
    }
  }

  function clearControlSessionToken() {
    if (!roomCode) return;
    try {
      sessionStorage.removeItem(controlSessionStorageKey);
    } catch {
      // ignore storage errors
    }
  }

  async function exchangeInviteForControlSession() {
    if (!roomCode || !inviteToken) return "";
    try {
      const response = await fetch("/overlay-control/invite/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, inviteToken }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) return "";
      const issuedToken = String(payload.controlSessionToken || "").trim();
      if (!issuedToken) return "";
      return issuedToken;
    } catch {
      return "";
    }
  }

  if (!token) {
    token = readControlSessionToken();
  }
  if (!token && roomCode && inviteToken) {
    token = await exchangeInviteForControlSession();
  }
  if (token) {
    writeControlSessionToken(token);
  }

  const overlayLocaleApi = window.BUNKER_OVERLAY_LOCALE || null;
  const normalizeLocale =
    typeof overlayLocaleApi?.normalizeLang === "function"
      ? overlayLocaleApi.normalizeLang
      : (raw) => (String(raw || "").trim().toLowerCase() === "en" ? "en" : "ru");

  const localeFromUrl = (() => {
    const search = new URLSearchParams(window.location.search || "");
    const hashRaw = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
    const hashQueryIndex = hashRaw.indexOf("?");
    const hashParams = new URLSearchParams(hashQueryIndex >= 0 ? hashRaw.slice(hashQueryIndex + 1) : "");
    return String(search.get("lang") || hashParams.get("lang") || "").trim();
  })();
  const hasLocaleFromUrl = Boolean(localeFromUrl);

  let controlLang = normalizeLocale(localeFromUrl || (() => {
    try {
      return localStorage.getItem(LOCALE_STORAGE_KEY) || document.documentElement.lang || "ru";
    } catch {
      return document.documentElement.lang || "ru";
    }
  })());

  function tr(key, params = {}, fallback = "") {
    if (typeof overlayLocaleApi?.t === "function") {
      const value = overlayLocaleApi.t(controlLang, key, params);
      if (value !== key) return value;
    }
    return fallback || key;
  }

  function applyStaticLocale(root = document) {
    const textNodes = root.querySelectorAll("[data-locale]");
    for (const node of textNodes) {
      const key = String(node.getAttribute("data-locale") || "").trim();
      if (!key) continue;
      if (!node.dataset.localeFallbackText) {
        node.dataset.localeFallbackText = String(node.textContent || "");
      }
      node.textContent = tr(key, {}, node.dataset.localeFallbackText);
    }

    const placeholderNodes = root.querySelectorAll("[data-locale-placeholder]");
    for (const node of placeholderNodes) {
      const key = String(node.getAttribute("data-locale-placeholder") || "").trim();
      if (!key) continue;
      if (!node.dataset.localeFallbackPlaceholder) {
        node.dataset.localeFallbackPlaceholder = String(node.getAttribute("placeholder") || "");
      }
      node.setAttribute(
        "placeholder",
        tr(key, {}, node.dataset.localeFallbackPlaceholder)
      );
    }

    const titleNodes = root.querySelectorAll("[data-locale-title]");
    for (const node of titleNodes) {
      const key = String(node.getAttribute("data-locale-title") || "").trim();
      if (!key) continue;
      if (!node.dataset.localeFallbackTitle) {
        node.dataset.localeFallbackTitle = String(node.getAttribute("title") || "");
      }
      node.setAttribute("title", tr(key, {}, node.dataset.localeFallbackTitle));
    }

    const ariaNodes = root.querySelectorAll("[data-locale-aria-label]");
    for (const node of ariaNodes) {
      const key = String(node.getAttribute("data-locale-aria-label") || "").trim();
      if (!key) continue;
      if (!node.dataset.localeFallbackAriaLabel) {
        node.dataset.localeFallbackAriaLabel = String(node.getAttribute("aria-label") || "");
      }
      node.setAttribute(
        "aria-label",
        tr(key, {}, node.dataset.localeFallbackAriaLabel)
      );
    }
  }

  const $ = (id) => document.getElementById(id);
  const roomLabel = $("roomLabel");
  const controlConnection = $("controlConnection");
  const urlParamsDebug = $("urlParamsDebug");
  const statusEl = $("status");
  const dirtyBadge = $("dirtyBadge");
  const controlLocaleLabel = $("controlLocaleLabel");
  const controlLocaleSelect = $("controlLocaleSelect");
  const saveBtn = $("saveBtn");
  const reloadBtn = $("reloadBtn");
  const resetPlayerBtn = $("resetPlayerBtn");
  const confirmModal = $("confirmModal");
  const confirmModalTitle = $("confirmModalTitle");
  const confirmModalMessage = $("confirmModalMessage");
  const confirmModalCancel = $("confirmModalCancel");
  const confirmModalConfirm = $("confirmModalConfirm");

  const playerSelect = $("playerSelect");
  const playersList = $("playersList");
  const sidebarPlayerActions = $("sidebarPlayerActions");
  const kickSelectedLabel = $("kickSelectedLabel");
  const playerEditorTitle = $("playerEditorTitle");
  const categoriesGrid = $("categoriesGrid");
  const categoriesAllowedKeys = $("categoriesAllowedKeys");
  const playerCategoriesJson = $("playerCategoriesJson");
  const insertCategoriesTemplateBtn = $("insertCategoriesTemplateBtn");
  const applyCategoriesJsonBtn = $("applyCategoriesJsonBtn");

  const topCurrentBunker = $("topCurrentBunker");
  const topCurrentCatastrophe = $("topCurrentCatastrophe");
  const topCurrentThreats = $("topCurrentThreats");
  const topBaseCatastrophe = $("topBaseCatastrophe");
  const topCatastropheSource = $("topCatastropheSource");
  const topBunkerLines = $("topBunkerLines");
  const topCatastropheText = $("topCatastropheText");
  const topThreatsLines = $("topThreatsLines");
  const topBunkerMeta = $("topBunkerMeta");
  const topCatastropheMeta = $("topCatastropheMeta");
  const topThreatsMeta = $("topThreatsMeta");
  const backgroundPresetSelect = $("backgroundPresetSelect");
  const backgroundPresetHint = $("backgroundPresetHint");
  const overlayUrlPresetButtons = $("overlayUrlPresetButtons");
  const overlayUrlPresetHint = $("overlayUrlPresetHint");
  const overlayUrlPresetValue = $("overlayUrlPresetValue");
  const overlayUrlPresetTemplate = $("overlayUrlPresetTemplate");
  const overlayUrlPresetOpenBtn = $("overlayUrlPresetOpenBtn");
  const overlayUrlPresetCopyBtn = $("overlayUrlPresetCopyBtn");
  const urlParamTheme = $("urlParamTheme");
  const urlParamLang = $("urlParamLang");
  const urlParamScale = $("urlParamScale");
  const urlParamTop = $("urlParamTop");
  const urlParamTopBunkerAlign = $("urlParamTopBunkerAlign");
  const urlParamTopCatastropheAlign = $("urlParamTopCatastropheAlign");
  const urlParamTopThreatsAlign = $("urlParamTopThreatsAlign");
  const urlParamTopBunkerScale = $("urlParamTopBunkerScale");
  const urlParamTopCatastropheScale = $("urlParamTopCatastropheScale");
  const urlParamTopThreatsScale = $("urlParamTopThreatsScale");
  const urlParamDebug = $("urlParamDebug");
  const enabledTopBunker = $("enabled_topBunker");
  const enabledTopCatastrophe = $("enabled_topCatastrophe");
  const enabledTopThreats = $("enabled_topThreats");

  const playerEnabledName = $("playerEnabledName");
  const playerEnabledTraits = $("playerEnabledTraits");
  const playerEnabledCategories = $("playerEnabledCategories");
  const playerNameInput = $("playerName");
  const traitSexInput = $("traitSex");
  const traitAgeInput = $("traitAge");
  const traitOrientInput = $("traitOrient");
  const currentPlayerName = $("currentPlayerName");
  const currentTraitSex = $("currentTraitSex");
  const currentTraitAge = $("currentTraitAge");
  const currentTraitOrient = $("currentTraitOrient");

  const extraTextsList = $("extraTextsList");
  const addExtraTextBtn = $("addExtraTextBtn");
  const syncExtraTextsJsonBtn = $("syncExtraTextsJsonBtn");
  const applyExtraTextsJsonBtn = $("applyExtraTextsJsonBtn");
  const extraTextsJson = $("extraTextsJson");
  const gameControlTabBtn = $("gameControlTabBtn");
  const obsControlTabBtn = $("obsControlTabBtn");
  const gameControlTab = $("gameControlTab");
  const obsControlTab = $("obsControlTab");
  const presenterPanel = $("presenterPanel");
  const presenterModeState = $("presenterModeState");
  const presenterDisabled = $("presenterDisabled");
  const presenterContent = $("presenterContent");
  const presenterRoomPhase = $("presenterRoomPhase");
  const presenterGamePhase = $("presenterGamePhase");
  const presenterRound = $("presenterRound");
  const presenterVotePhase = $("presenterVotePhase");
  const presenterPlayersBody = $("presenterPlayersBody");
  const presenterKickPlayerBtn = $("presenterKickPlayerBtn");
  const replaceTargetPlayerSelect = $("replaceTargetPlayerSelect");
  const replaceCardSelect = $("replaceCardSelect");
  const replaceModeSelect = $("replaceModeSelect");
  const replaceSpecificCardSelect = $("replaceSpecificCardSelect");
  const replaceExecuteBtn = $("replaceExecuteBtn");
  const replaceHint = $("replaceHint");
  const voteStartGameBtn = $("voteStartGameBtn");
  const voteNextStepBtn = $("voteNextStepBtn");
  const voteSkipStepBtn = $("voteSkipStepBtn");
  const voteStartBtn = $("voteStartBtn");
  const voteEndBtn = $("voteEndBtn");
  const voteSkipRoundBtn = $("voteSkipRoundBtn");
  const voteOutcomeRow = $("voteOutcomeRow");
  const voteOutcomeSurvivedBtn = $("voteOutcomeSurvivedBtn");
  const voteOutcomeFailedBtn = $("voteOutcomeFailedBtn");
  const voteOutcomeState = $("voteOutcomeState");
  const hostTransferTargetSelect = $("hostTransferTargetSelect");
  const hostTransferBtn = $("hostTransferBtn");
  const hostTransferHint = $("hostTransferHint");
  const worldKindSelect = $("worldKindSelect");
  const worldIndexSelect = $("worldIndexSelect");
  const worldToggleRevealBtn = $("worldToggleRevealBtn");
  const worldReplaceModeSelect = $("worldReplaceModeSelect");
  const worldReplaceCardSelect = $("worldReplaceCardSelect");
  const worldCountInput = $("worldCountInput");
  const worldReplaceBtn = $("worldReplaceBtn");
  const worldSetCountBtn = $("worldSetCountBtn");
  const worldHint = $("worldHint");
  const specialActorPlayerSelect = $("specialActorPlayerSelect");
  const specialSourceModeSelect = $("specialSourceModeSelect");
  const specialPickerSelect = $("specialPickerSelect");
  const specialTargetPlayerSelect = $("specialTargetPlayerSelect");
  const specialTargetCardSelect = $("specialTargetCardSelect");
  const specialThreatIndexSelect = $("specialThreatIndexSelect");
  const specialCategorySelect = $("specialCategorySelect");
  const specialUseSelfSelect = $("specialUseSelfSelect");
  const specialDescriptionText = $("specialDescriptionText");
  const specialApplyBtn = $("specialApplyBtn");
  const specialHint = $("specialHint");
  const devBotNameInput = $("devBotNameInput");
  const devTargetPlayerSelect = $("devTargetPlayerSelect");
  const devAddBotBtn = $("devAddBotBtn");
  const devRemoveBotBtn = $("devRemoveBotBtn");
  const devKickBtn = $("devKickBtn");
  const devMarkLeftBtn = $("devMarkLeftBtn");
  const devSkipRoundBtn = $("devSkipRoundBtn");
  const devHint = $("devHint");
  const controlActorSelect = $("controlActorSelect");
  const controlScenarioAction = $("controlScenarioAction");
  const controlTargetRow = $("controlTargetRow");
  const controlTargetSelect = $("controlTargetSelect");
  const controlCardRow = $("controlCardRow");
  const controlCardSelect = $("controlCardSelect");
  const controlSpecialRow = $("controlSpecialRow");
  const controlSpecialSelect = $("controlSpecialSelect");
  const controlThreatRow = $("controlThreatRow");
  const controlThreatIndex = $("controlThreatIndex");
  const controlOutcomeRow = $("controlOutcomeRow");
  const controlOutcomeSelect = $("controlOutcomeSelect");
  const controlDevNameRow = $("controlDevNameRow");
  const controlDevNameInput = $("controlDevNameInput");
  const controlPayloadJson = $("controlPayloadJson");
  const controlExecuteBtn = $("controlExecuteBtn");
  const controlActionHint = $("controlActionHint");
  const controlQuickActions = $("controlQuickActions");
  const controlGuide = $("controlGuide");
  const controlCardPicker = $("controlCardPicker");
  const controlSpecialPicker = $("controlSpecialPicker");
  const controlThreatPicker = $("controlThreatPicker");

  if (
    !roomLabel || !controlConnection || !urlParamsDebug || !statusEl || !dirtyBadge || !controlLocaleLabel || !controlLocaleSelect ||
    !saveBtn || !reloadBtn || !resetPlayerBtn ||
    !playerSelect || !playersList || !sidebarPlayerActions || !kickSelectedLabel || !playerEditorTitle || !categoriesGrid || !categoriesAllowedKeys ||
    !playerCategoriesJson || !insertCategoriesTemplateBtn || !applyCategoriesJsonBtn ||
    !topCurrentBunker || !topCurrentCatastrophe || !topCurrentThreats || !topBaseCatastrophe || !topCatastropheSource || !topBunkerLines ||
    !topCatastropheText || !topThreatsLines || !topBunkerMeta || !topCatastropheMeta || !topThreatsMeta ||
    !backgroundPresetSelect || !backgroundPresetHint ||
    !overlayUrlPresetButtons || !overlayUrlPresetHint || !overlayUrlPresetValue || !overlayUrlPresetTemplate || !overlayUrlPresetOpenBtn || !overlayUrlPresetCopyBtn ||
    !urlParamTheme || !urlParamLang || !urlParamScale || !urlParamTop ||
    !urlParamTopBunkerAlign || !urlParamTopCatastropheAlign || !urlParamTopThreatsAlign ||
    !urlParamTopBunkerScale || !urlParamTopCatastropheScale || !urlParamTopThreatsScale || !urlParamDebug ||
    !enabledTopBunker || !enabledTopCatastrophe || !enabledTopThreats ||
    !playerEnabledName || !playerEnabledTraits || !playerEnabledCategories || !playerNameInput ||
    !traitSexInput || !traitAgeInput || !traitOrientInput || !currentPlayerName || !currentTraitSex ||
    !currentTraitAge || !currentTraitOrient || !extraTextsList || !addExtraTextBtn ||
    !syncExtraTextsJsonBtn || !applyExtraTextsJsonBtn || !extraTextsJson ||
    !gameControlTabBtn || !obsControlTabBtn || !gameControlTab || !obsControlTab ||
    !presenterPanel || !presenterModeState || !presenterDisabled || !presenterContent || !presenterRoomPhase ||
    !presenterGamePhase || !presenterRound || !presenterVotePhase || !presenterPlayersBody ||
    !presenterKickPlayerBtn ||
    !replaceTargetPlayerSelect || !replaceCardSelect || !replaceModeSelect || !replaceSpecificCardSelect ||
    !replaceExecuteBtn || !replaceHint ||
    !voteStartGameBtn || !voteNextStepBtn || !voteSkipStepBtn || !voteStartBtn || !voteEndBtn ||
    !voteSkipRoundBtn || !voteOutcomeRow || !voteOutcomeSurvivedBtn || !voteOutcomeFailedBtn || !voteOutcomeState ||
    !hostTransferTargetSelect || !hostTransferBtn || !hostTransferHint ||
    !worldKindSelect || !worldIndexSelect || !worldToggleRevealBtn || !worldReplaceModeSelect ||
    !worldReplaceCardSelect || !worldCountInput || !worldReplaceBtn || !worldSetCountBtn || !worldHint ||
    !specialActorPlayerSelect || !specialSourceModeSelect || !specialPickerSelect || !specialTargetPlayerSelect ||
    !specialTargetCardSelect || !specialThreatIndexSelect || !specialCategorySelect || !specialUseSelfSelect ||
    !specialDescriptionText || !specialApplyBtn || !specialHint ||
    !devBotNameInput || !devTargetPlayerSelect || !devAddBotBtn || !devRemoveBotBtn || !devKickBtn ||
    !devMarkLeftBtn || !devSkipRoundBtn || !devHint ||
    !controlActorSelect || !controlScenarioAction || !controlTargetRow || !controlTargetSelect ||
    !controlCardRow || !controlCardSelect || !controlSpecialRow || !controlSpecialSelect ||
    !controlThreatRow || !controlThreatIndex || !controlOutcomeRow || !controlOutcomeSelect ||
    !controlDevNameRow || !controlDevNameInput || !controlPayloadJson || !controlExecuteBtn ||
    !controlActionHint || !controlQuickActions || !controlGuide ||
    !controlCardPicker || !controlSpecialPicker || !controlThreatPicker
  ) {
    return;
  }

  if (!roomCode || !token) {
    clearControlSessionToken();
    console.error("[overlay-control] missing room/token in URL", {
      roomCodeFromUrl: roomCode || null,
      tokenPresent: Boolean(token),
      invitePresent: Boolean(inviteToken),
    });
    urlParamsDebug.textContent = `roomCodeFromUrl: ${roomCode || "-"} • tokenPresent: ${token ? "yes" : "no"} • invitePresent: ${inviteToken ? "yes" : "no"}`;
    controlConnection.textContent = tr(
      "control.connection.summary",
      {
        connected: tr("control.connection.no"),
        role: "-",
        room: roomCode || "-",
      },
      `Подключено: нет • Роль: - • Комната: ${roomCode || "-"}`
    );
    setStatus(tr("control.status.missingRoomToken"), true);
    return;
  }

  urlParamsDebug.textContent = `roomCodeFromUrl: ${roomCode} • tokenPresent: yes • invitePresent: ${inviteToken ? "yes" : "no"}`;
  roomLabel.textContent = tr("control.room.label", { room: roomCode });
  console.log("[overlay-control] parsed URL params", {
    roomCodeFromUrl: roomCode,
    tokenPresent: Boolean(token),
    invitePresent: Boolean(inviteToken),
  });

  const MAX_LINE_LEN = 120;
  const MAX_CATA_LEN = 600;
  const MAX_NAME_LEN = 24;
  const MAX_BUNKER_LINES = 5;
  const MAX_THREAT_LINES = 6;

  const DEFAULT_CATEGORIES = [
    { key: "profession", label: tr("overlay.category.profession") },
    { key: "health", label: tr("overlay.category.health") },
    { key: "hobby", label: tr("overlay.category.hobby") },
    { key: "phobia", label: tr("overlay.category.phobia") },
    { key: "baggage", label: tr("overlay.category.baggage") },
    { key: "fact1", label: tr("overlay.category.fact1") },
    { key: "fact2", label: tr("overlay.category.fact2") },
    { key: "biology", label: tr("overlay.category.biology") },
  ];

  const CATEGORY_KEY_ALIASES = {
    fact1: ["facts1"],
    fact2: ["facts2"],
    facts1: ["fact1"],
    facts2: ["fact2"],
  };

  function defaultCategoryEnabled(categoryKey) {
    return String(categoryKey || "") !== "phobia";
  }

  function getCategoryEnabledFlag(categoryEnabledMap, categoryKey) {
    const key = String(categoryKey || "");
    if (isRecord(categoryEnabledMap) && typeof categoryEnabledMap[key] === "boolean") {
      return categoryEnabledMap[key];
    }
    return defaultCategoryEnabled(key);
  }

  let players = [];
  let selectedPlayerId = "";
  let serverOverrides = {};
  let draftOverrides = {};
  let latestOverlayState = null;
  let effectiveOverlayState = null;
  let backgroundCatalog = { defaultPreset: "default", presets: [] };
  let overlayUrlPresets = [];
  let selectedOverlayUrlPresetId = "";
  let categoryDefsFromServer = [...DEFAULT_CATEGORIES];
  let categoryDefs = [...DEFAULT_CATEGORIES];
  let presenterState = null;
  let presenterModeFromState = null;
  let controlDeckCatalog = {};
  let specialCatalogCache = [];
  let presenterActionState = {
    commandsReady: false,
    canStartGame: false,
    canNextStep: false,
    canSkipStep: false,
    canStartVote: false,
    canEndVote: false,
    canSkipRound: false,
    canSetOutcome: false,
    postGameActive: false,
    postGameOutcome: "",
  };
  let latestRoomState = null;
  let latestGameView = null;
  let controlActorPlayerId = "";
  let wsSocket = null;
  let wsPlayerId = "";
  let wsRoomReady = false;
  let connectedRoomCode = roomCode || "-";
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let isRealtimeConnected = false;
  let controlRole = "";

  const DEFAULT_OVERLAY_URL_PRESETS = [
    {
      id: "base",
      label: "Base",
      urlTemplate: `${window.location.origin}/overlay?room={ROOM}&token={TOKEN}&lang={LANG}`,
      comment: tr("control.urlPreset.comment.base"),
    },
    {
      id: "debug",
      label: "Debug",
      urlTemplate: `${window.location.origin}/overlay?room={ROOM}&token={TOKEN}&lang={LANG}&debug=1`,
      comment: tr("control.urlPreset.comment.debug"),
    },
    {
      id: "fullhd",
      label: "FullHD",
      urlTemplate:
        `${window.location.origin}/overlay?room={ROOM}&token={TOKEN}&lang={LANG}&top=200&scale=1.3&theme=mint`,
      comment: tr("control.urlPreset.comment.fullhd"),
    },
    {
      id: "fullhd-bg",
      label: "FullHD + BG",
      urlTemplate:
        `${window.location.origin}/overlay?room={ROOM}&token={TOKEN}&lang={LANG}&top=200&scale=1.3&theme=mint&bgPreset={BG_PRESET}`,
      comment: tr(
        "control.urlPreset.comment.fullhdBg",
        {}
      ),
    },
  ];

  const CONTROL_ACTION_META = {
    revealCard: {
      titleKey: "control.meta.revealCard.title",
      titleFallback: "",
      hintKey: "control.meta.revealCard.hint",
      hintFallback: "",
      guideKey: "control.meta.revealCard.guide",
      guideFallback: "",
    },
    applySpecial: {
      titleKey: "control.meta.applySpecial.title",
      titleFallback: "",
      hintKey: "control.meta.applySpecial.hint",
      hintFallback: "",
      guideKey: "control.meta.applySpecial.guide",
      guideFallback: "",
    },
    vote: {
      titleKey: "control.meta.vote.title",
      titleFallback: "",
      hintKey: "control.meta.vote.hint",
      hintFallback: "",
      guideKey: "control.meta.vote.guide",
      guideFallback: "",
    },
    continueRound: {
      titleKey: "control.meta.continueRound.title",
      titleFallback: "",
      hintKey: "control.meta.continueRound.hint",
      hintFallback: "",
      guideKey: "control.meta.continueRound.guide",
      guideFallback: "",
    },
    finalizeVoting: {
      titleKey: "control.meta.finalizeVoting.title",
      titleFallback: "",
      hintKey: "control.meta.finalizeVoting.hint",
      hintFallback: "",
      guideKey: "control.meta.finalizeVoting.guide",
      guideFallback: "",
    },
    revealWorldThreat: {
      titleKey: "control.meta.revealWorldThreat.title",
      titleFallback: "",
      hintKey: "control.meta.revealWorldThreat.hint",
      hintFallback: "",
      guideKey: "control.meta.revealWorldThreat.guide",
      guideFallback: "",
    },
    setBunkerOutcome: {
      titleKey: "control.meta.setBunkerOutcome.title",
      titleFallback: "",
      hintKey: "control.meta.setBunkerOutcome.hint",
      hintFallback: "",
      guideKey: "control.meta.setBunkerOutcome.guide",
      guideFallback: "",
    },
    markLeftBunker: {
      titleKey: "control.meta.markLeftBunker.title",
      titleFallback: "",
      hintKey: "control.meta.markLeftBunker.hint",
      hintFallback: "",
      guideKey: "control.meta.markLeftBunker.guide",
      guideFallback: "",
    },
    devKickPlayer: {
      titleKey: "control.meta.devKickPlayer.title",
      titleFallback: "",
      hintKey: "control.meta.devKickPlayer.hint",
      hintFallback: "",
      guideKey: "control.meta.devKickPlayer.guide",
      guideFallback: "",
    },
    devSkipRound: {
      titleKey: "control.meta.devSkipRound.title",
      titleFallback: "",
      hintKey: "control.meta.devSkipRound.hint",
      hintFallback: "",
      guideKey: "control.meta.devSkipRound.guide",
      guideFallback: "",
    },
    devAddPlayer: {
      titleKey: "control.meta.devAddPlayer.title",
      titleFallback: "",
      hintKey: "control.meta.devAddPlayer.hint",
      hintFallback: "",
      guideKey: "control.meta.devAddPlayer.guide",
      guideFallback: "",
    },
    devRemovePlayer: {
      titleKey: "control.meta.devRemovePlayer.title",
      titleFallback: "",
      hintKey: "control.meta.devRemovePlayer.hint",
      hintFallback: "",
      guideKey: "control.meta.devRemovePlayer.guide",
      guideFallback: "",
    },
  };
  renderConnectionStatus();

  const isRecord = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));

  function looksLikeMojibake(value) {
    if (typeof value !== "string") return false;
    const cyrillicPairCount = (value.match(/[РС][\u0400-\u04ff]/g) || []).length;
    return cyrillicPairCount >= 3;
  }

  function fixMojibake(value, fallback = "—") {
    const text = String(value ?? "");
    return looksLikeMojibake(text) ? fallback : text;
  }

  function formatPlayerNameShort(name, maxLen = 14) {
    const clean = fixMojibake(String(name ?? "").trim(), "");
    if (!clean) return "";
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen - 1)}…`;
  }

  function formatRoomPhase(value) {
    const key = String(value ?? "").trim();
    return tr(`control.roomPhase.${key}`, {}, key || "-");
  }

  function formatGamePhase(value, presenter = null) {
    const key = String(value ?? "").trim();
    if (key === "reveal_discussion") {
      const turnPlayerId = isRecord(presenter) ? String(presenter.currentTurnPlayerId ?? "") : "";
      const listedPlayers = isRecord(presenter) && Array.isArray(presenter.players) ? presenter.players : [];
      const discussionPlayer = listedPlayers.find((player) => player && player.playerId === turnPlayerId);
      const shortName = formatPlayerNameShort(discussionPlayer?.name || "");
      return shortName
        ? `${tr("control.gamePhase.revealDiscussion")} ${shortName}`
        : tr("control.gamePhase.revealDiscussion");
    }
    return tr(`control.gamePhase.${key}`, {}, key || "-");
  }

  function formatVotePhase(value) {
    const key = String(value ?? "").trim();
    return tr(`control.votePhase.${key}`, {}, key || "-");
  }

  function formatPlayerStatus(value) {
    const key = String(value ?? "").trim();
    return tr(`control.playerStatus.${key}`, {}, key || "-");
  }

  function commandLabel(action) {
    const code = String(action || "").trim();
    if (!code) return tr("control.command.fallback");
    return tr(`control.command.${code}`, {}, code);
  }

  function renderConnectionStatus() {
    const connectedText =
      isRealtimeConnected && wsRoomReady
        ? tr("control.connection.yes", {})
        : tr("control.connection.no");
    const roleText = controlRole || "-";
    controlConnection.textContent = tr(
      "control.connection.summary",
      { connected: connectedText, role: roleText, room: connectedRoomCode || roomCode || "-" },
      `Подключено: ${connectedText} • Роль: ${roleText} • Комната: ${connectedRoomCode || roomCode || "-"}`
    );
  }

  function switchControlTab(tab) {
    const isGameTab = tab === "game";
    gameControlTab.hidden = !isGameTab;
    obsControlTab.hidden = isGameTab;
    sidebarPlayerActions.hidden = !isGameTab;
    gameControlTabBtn.classList.toggle("is-active", isGameTab);
    obsControlTabBtn.classList.toggle("is-active", !isGameTab);
    gameControlTabBtn.setAttribute("aria-selected", isGameTab ? "true" : "false");
    obsControlTabBtn.setAttribute("aria-selected", isGameTab ? "false" : "true");
  }

  function mergeTopLevel(base, patch) {
    const source = isRecord(base) ? base : {};
    const diff = isRecord(patch) ? patch : {};
    return { ...source, ...diff };
  }

  function applyRoomStateSnapshot(nextRoomState) {
    if (!isRecord(nextRoomState)) return;
    latestRoomState = nextRoomState;
    connectedRoomCode = String(nextRoomState.roomCode || roomCode || "-").toUpperCase();
    roomLabel.textContent = tr("control.room.label", { room: connectedRoomCode });

    if (wsPlayerId) {
      if (String(nextRoomState.controlId || "") === wsPlayerId) {
        controlRole = "CONTROL";
      } else if (
        Array.isArray(nextRoomState.players) &&
        nextRoomState.players.some((player) => String(player?.playerId || "") === wsPlayerId)
      ) {
        controlRole = "PLAYER";
      } else {
        controlRole = "VIEW";
      }
    }

    wsRoomReady = true;
    renderConnectionStatus();
    if (controlRole !== "CONTROL") {
      setStatus(tr("control.status.connectedNotControl"), true);
    }
    renderPresenter();
  }

  function setStatus(message, isError = false) {
    const safeMessage = fixMojibake(String(message || ""), isError ? "Ошибка отображения текста." : "");
    statusEl.textContent = safeMessage;
    statusEl.className = isError ? "status error" : "status";
  }

  function sanitizeLineRaw(value) {
    return String(value ?? "")
      .replace(/\r\n?/g, " ")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sanitizeLine(value, maxLen) {
    return sanitizeLineRaw(value).slice(0, maxLen);
  }

  function sanitizeMultiRaw(value) {
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim();
  }

  function sanitizeMulti(value, maxLen) {
    return sanitizeMultiRaw(value).slice(0, maxLen);
  }

  function getOrCreateScopedId(key, prefix) {
    try {
      const existing = window.sessionStorage.getItem(key);
      if (existing && String(existing).trim()) return String(existing).trim();
      const generated = typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(key, generated);
      return generated;
    } catch {
      return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function parseLines(value, maxLines, maxLen) {
    const raw = String(value ?? "").split(/\r?\n/).map((line) => sanitizeLineRaw(line)).filter(Boolean);
    return {
      lines: raw.slice(0, maxLines).map((line) => line.slice(0, maxLen)),
      count: raw.length,
      tooMany: raw.length > maxLines,
      tooLong: raw.some((line) => line.length > maxLen),
    };
  }

  function ensureDraftShape() {
    if (!isRecord(draftOverrides)) draftOverrides = {};
    if (!isRecord(draftOverrides.enabled)) draftOverrides.enabled = {};
    if (!isRecord(draftOverrides.top)) draftOverrides.top = {};
    if (!isRecord(draftOverrides.players)) draftOverrides.players = {};
  }

  function normalizeBackgroundPresetId(value) {
    return sanitizeLine(value, 64)
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "");
  }

  const BACKGROUND_PRESET_DEFAULT = "__default__";
  const BACKGROUND_PRESET_NONE = "__none__";
  const NO_BACKGROUND_PRESET_IDS = new Set(["none", "off", "transparent", "__none__", "__transparent__"]);

  function isNoBackgroundPresetId(value) {
    const normalized = normalizeBackgroundPresetId(value || "");
    return normalized ? NO_BACKGROUND_PRESET_IDS.has(normalized) : false;
  }

  function normalizeOverlayUrlParamKey(value) {
    return sanitizeLine(value, 64)
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function normalizeOverlayLang(value) {
    const normalized = sanitizeLine(value, 16).trim().toLowerCase();
    if (normalized === "en") return "en";
    return "ru";
  }

  function normalizeTopVerticalAlign(value) {
    const normalized = sanitizeLine(value, 16).trim().toLowerCase();
    if (normalized === "top" || normalized === "bottom") return normalized;
    return "center";
  }

  function sanitizeOverlayUrlParamsForOverrides(raw) {
    if (!isRecord(raw)) return {};
    const out = {};
    const entries = Object.entries(raw);
    for (let index = 0; index < entries.length; index += 1) {
      if (Object.keys(out).length >= 24) break;
      const [rawKey, rawValue] = entries[index];
      const key = normalizeOverlayUrlParamKey(rawKey);
      if (!key || key === "room" || key === "roomCode" || key === "token") continue;
      let value = sanitizeLine(rawValue, 256).trim();
      if (!value) continue;
      if (key === "lang") {
        const upper = value.toUpperCase();
        if (upper === "{LANG}" || upper === "%7BLANG%7D") continue;
        value = normalizeOverlayLang(value);
      }
      out[key] = value;
    }
    return out;
  }

  function normalizeBackgroundCatalog(raw) {
    if (!isRecord(raw)) return { defaultPreset: "default", presets: [] };
    const presets = Array.isArray(raw.presets)
      ? raw.presets
          .map((item) => {
            if (!isRecord(item)) return null;
            const id = normalizeBackgroundPresetId(item.id);
            if (!id) return null;
            const label = sanitizeLine(item.label || id, 80) || id;
            const layouts = isRecord(item.layouts) ? item.layouts : {};
            const outLayouts = {};
            if (typeof layouts.l4 === "string" && layouts.l4.trim()) outLayouts.l4 = layouts.l4.trim();
            if (typeof layouts.l8 === "string" && layouts.l8.trim()) outLayouts.l8 = layouts.l8.trim();
            if (typeof layouts.l12 === "string" && layouts.l12.trim()) outLayouts.l12 = layouts.l12.trim();
            if (!Object.keys(outLayouts).length) return null;
            return { id, label, layouts: outLayouts };
          })
          .filter(Boolean)
      : [];
    const defaultPresetRaw = normalizeBackgroundPresetId(raw.defaultPreset || "");
    const defaultPreset =
      defaultPresetRaw && presets.some((item) => item.id === defaultPresetRaw)
        ? defaultPresetRaw
        : presets[0]?.id || "default";
    return { defaultPreset, presets };
  }

  function getBackgroundPresetById(presetId) {
    const id = normalizeBackgroundPresetId(presetId || "");
    if (!id) return null;
    return backgroundCatalog.presets.find((item) => item.id === id) || null;
  }

  function renderBackgroundPresetEditor() {
    const selected = normalizeBackgroundPresetId(draftOverrides.backgroundPreset || "");
    const defaultPreset = getBackgroundPresetById(backgroundCatalog.defaultPreset);

    backgroundPresetSelect.textContent = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = BACKGROUND_PRESET_DEFAULT;
    defaultOption.textContent = defaultPreset
      ? `Default (${defaultPreset.label})`
      : "Default";
    backgroundPresetSelect.append(defaultOption);

    const noneOption = document.createElement("option");
    noneOption.value = BACKGROUND_PRESET_NONE;
    noneOption.textContent = tr("control.background.none");
    backgroundPresetSelect.append(noneOption);

    for (const preset of backgroundCatalog.presets) {
      const option = document.createElement("option");
      option.value = preset.id;
      const layouts = [];
      if (preset.layouts.l4) layouts.push("4p");
      if (preset.layouts.l8) layouts.push("8p");
      if (preset.layouts.l12) layouts.push("12p");
      option.textContent = `${preset.label}${layouts.length ? ` (${layouts.join(", ")})` : ""}`;
      backgroundPresetSelect.append(option);
    }

    if (isNoBackgroundPresetId(selected)) {
      backgroundPresetSelect.value = BACKGROUND_PRESET_NONE;
    } else if (selected && backgroundCatalog.presets.some((preset) => preset.id === selected)) {
      backgroundPresetSelect.value = selected;
    } else {
      backgroundPresetSelect.value = BACKGROUND_PRESET_DEFAULT;
    }

    if (backgroundPresetSelect.value === BACKGROUND_PRESET_NONE) {
      backgroundPresetHint.textContent = tr(
        "control.background.hint.transparent",
        {},
        "Фон отключён: overlay будет прозрачным."
      );
      return;
    }
    const effectivePresetId =
      backgroundPresetSelect.value === BACKGROUND_PRESET_DEFAULT
        ? normalizeBackgroundPresetId(backgroundCatalog.defaultPreset || "")
        : normalizeBackgroundPresetId(backgroundPresetSelect.value);
    const chosenPreset = getBackgroundPresetById(effectivePresetId);
    if (!chosenPreset) {
      backgroundPresetHint.textContent = tr("control.background.hint.unknown");
      return;
    }
    const availableLayouts = [];
    if (chosenPreset.layouts.l4) availableLayouts.push("4p");
    if (chosenPreset.layouts.l8) availableLayouts.push("8p");
    if (chosenPreset.layouts.l12) availableLayouts.push("12p");
    backgroundPresetHint.textContent = tr(
      "control.background.hint.current",
      { preset: chosenPreset.label, layouts: availableLayouts.join(", ") || "-" },
      `Используется пресет: ${chosenPreset.label}. Доступные layouts: ${availableLayouts.join(", ") || "-"}.`
    );
  }

  function applyBackgroundPresetInputToDraft() {
    const selected = normalizeBackgroundPresetId(backgroundPresetSelect.value);
    if (selected === normalizeBackgroundPresetId(BACKGROUND_PRESET_NONE)) {
      draftOverrides.backgroundPreset = normalizeBackgroundPresetId(BACKGROUND_PRESET_NONE);
      return;
    }
    if (selected === normalizeBackgroundPresetId(BACKGROUND_PRESET_DEFAULT)) {
      delete draftOverrides.backgroundPreset;
      return;
    }
    if (selected && backgroundCatalog.presets.some((preset) => preset.id === selected)) {
      draftOverrides.backgroundPreset = selected;
    } else {
      delete draftOverrides.backgroundPreset;
    }
  }

  function normalizeOverlayUrlPresets(raw) {
    const fromApi =
      isRecord(raw) && Array.isArray(raw.presets)
        ? raw.presets
            .map((item) => {
              if (!isRecord(item)) return null;
              const id = normalizeBackgroundPresetId(item.id);
              const label = sanitizeLine(item.label || id, 120);
              const urlTemplate = sanitizeLine(item.urlTemplate, 2048);
              const comment = sanitizeLine(item.comment || "", 240);
              if (!id || !label || !urlTemplate) return null;
              return { id, label, urlTemplate, comment };
            })
            .filter(Boolean)
        : [];

    const merged = [...DEFAULT_OVERLAY_URL_PRESETS, ...fromApi];
    const seen = new Set();
    return merged
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const id = normalizeBackgroundPresetId(item.id || "");
        const label = sanitizeLine(item.label || id, 120);
        const urlTemplate = sanitizeLine(item.urlTemplate || "", 2048);
        const comment = sanitizeLine(item.comment || "", 240);
        if (!id || !label || !urlTemplate) return null;
        if (seen.has(id)) return null;
        seen.add(id);
        return { id, label, urlTemplate, comment };
      })
      .filter(Boolean);
  }

  function buildResolvedPresetUrl(template) {
    const rawTemplate = String(template || "").trim();
    if (!rawTemplate) return "";
    const selectedBgPresetRaw = normalizeBackgroundPresetId(draftOverrides.backgroundPreset || "");
    const selectedBgPreset = isNoBackgroundPresetId(selectedBgPresetRaw) ? "" : selectedBgPresetRaw;
    const selectedLang = normalizeOverlayLang(
      sanitizeOverlayUrlParamsForOverrides(draftOverrides.overlayUrlParams).lang ||
        String(urlParamLang.value || "").trim() ||
        "ru"
    );

    const substitutedTemplate = rawTemplate
      .replace(/\{ROOM\}|%7BROOM%7D/gi, roomCode)
      .replace(/\{TOKEN\}|%7BTOKEN%7D/gi, token)
      .replace(/\{LANG\}|%7BLANG%7D/gi, selectedLang)
      .replace(/\{BG_PRESET\}|%7BBG_PRESET%7D/gi, selectedBgPreset)
      .replace(/\{BG\}|%7BBG%7D/gi, selectedBgPreset);

    let parsed;
    try {
      parsed = new URL(substitutedTemplate, window.location.origin);
    } catch {
      return "";
    }
    const baseUrl = new URL(window.location.origin);
    baseUrl.pathname = "/overlay";
    baseUrl.search = "";
    baseUrl.hash = "";

    for (const [key, value] of parsed.searchParams.entries()) {
      if (key === "room" || key === "roomCode" || key === "token") continue;
      if (key === "lang" && !String(value || "").trim()) continue;
      if (key === "bgPreset" && !String(value || "").trim()) continue;
      baseUrl.searchParams.set(key, value);
    }
    baseUrl.searchParams.set("room", roomCode);
    baseUrl.searchParams.set("token", token);
    if (!baseUrl.searchParams.get("lang")) {
      baseUrl.searchParams.set("lang", selectedLang);
    }
    if (!baseUrl.searchParams.get("bgPreset")) {
      if (selectedBgPreset) {
        baseUrl.searchParams.set("bgPreset", selectedBgPreset);
      }
    }
    return baseUrl.toString();
  }

  function extractOverlayQueryParamsFromResolvedUrl(urlValue) {
    let parsed;
    try {
      parsed = new URL(String(urlValue || "").trim(), window.location.origin);
    } catch {
      return {};
    }
    const out = {};
    for (const [rawKey, rawValue] of parsed.searchParams.entries()) {
      const key = normalizeOverlayUrlParamKey(rawKey);
      if (!key || key === "room" || key === "roomCode" || key === "token") continue;
      let value = sanitizeLine(rawValue, 256).trim();
      if (!value) continue;
      if (key === "lang") {
        const upper = value.toUpperCase();
        if (upper === "{LANG}" || upper === "%7BLANG%7D") continue;
        value = normalizeOverlayLang(value);
      }
      out[key] = value;
    }
    return out;
  }

  function buildOverlayTemplateFromStoredParams(params) {
    const cleaned = sanitizeOverlayUrlParamsForOverrides(params);
    if (!Object.keys(cleaned).length) return "";
    const selectedBgPresetRaw = normalizeBackgroundPresetId(draftOverrides.backgroundPreset || "");
    const selectedBgPreset = isNoBackgroundPresetId(selectedBgPresetRaw) ? "" : selectedBgPresetRaw;
    const templateUrl = new URL(window.location.origin);
    templateUrl.pathname = "/overlay";
    templateUrl.search = "";
    templateUrl.hash = "";
    for (const [key, value] of Object.entries(cleaned)) {
      if (key === "bgPreset" && selectedBgPreset && value === selectedBgPreset) {
        templateUrl.searchParams.set("bgPreset", "{BG_PRESET}");
      } else if (key === "lang") {
        templateUrl.searchParams.set("lang", "{LANG}");
      } else {
        templateUrl.searchParams.set(key, value);
      }
    }
    templateUrl.searchParams.set("room", roomCode);
    templateUrl.searchParams.set("token", token);
    return templateUrl.toString();
  }

  function applyOverlayUrlPresetTemplateToDraft() {
    ensureDraftShape();
    const template = String(overlayUrlPresetTemplate.value || "").trim();
    if (!template) {
      delete draftOverrides.overlayUrlParams;
      overlayUrlPresetValue.value = "";
      return;
    }
    const resolvedUrl = buildResolvedPresetUrl(template);
    overlayUrlPresetValue.value = resolvedUrl;
    const params = sanitizeOverlayUrlParamsForOverrides(
      extractOverlayQueryParamsFromResolvedUrl(resolvedUrl)
    );
    if (Object.keys(params).length) {
      draftOverrides.overlayUrlParams = params;
      return;
    }
    delete draftOverrides.overlayUrlParams;
  }

  function renderOverlayUrlParamInputs() {
    const params = sanitizeOverlayUrlParamsForOverrides(draftOverrides.overlayUrlParams);
    urlParamLang.value = normalizeOverlayLang(params.lang || "ru");
    urlParamTheme.value = String(params.theme || "");
    urlParamScale.value = String(params.scale || "1.3");
    urlParamTop.value = String(params.top || "");
    urlParamTopBunkerAlign.value = normalizeTopVerticalAlign(params.topBunkerAlign || "center");
    urlParamTopCatastropheAlign.value = normalizeTopVerticalAlign(params.topCatastropheAlign || "center");
    urlParamTopThreatsAlign.value = normalizeTopVerticalAlign(params.topThreatsAlign || "center");
    const fallbackTopScale = String(params.topTextScale || "1");
    urlParamTopBunkerScale.value = String(params.topBunkerScale || fallbackTopScale);
    urlParamTopCatastropheScale.value = String(params.topCatastropheScale || fallbackTopScale);
    urlParamTopThreatsScale.value = String(params.topThreatsScale || fallbackTopScale);
    urlParamDebug.value = String(params.debug === "1" ? "1" : "");
  }

  function applyOverlayUrlParamInputsToDraft() {
    ensureDraftShape();
    const params = sanitizeOverlayUrlParamsForOverrides(draftOverrides.overlayUrlParams);

    const lang = normalizeOverlayLang(urlParamLang.value || "ru");
    params.lang = lang;

    const theme = String(urlParamTheme.value || "").trim().toLowerCase();
    if (theme && ["mint", "warm", "dark"].includes(theme)) params.theme = theme;
    else delete params.theme;

    const scaleNum = Number.parseFloat(String(urlParamScale.value || "").trim());
    if (Number.isFinite(scaleNum)) {
      const normalizedScale = Math.max(0.8, Math.min(1.6, scaleNum));
      params.scale = normalizedScale.toFixed(2).replace(/\.?0+$/, "");
    } else {
      delete params.scale;
    }

    const topNum = Number.parseFloat(String(urlParamTop.value || "").trim());
    if (Number.isFinite(topNum)) {
      const normalizedTop = Math.round(Math.max(160, Math.min(320, topNum)));
      params.top = String(normalizedTop);
    } else {
      delete params.top;
    }

    const bunkerAlign = normalizeTopVerticalAlign(urlParamTopBunkerAlign.value || "center");
    if (bunkerAlign === "center") delete params.topBunkerAlign;
    else params.topBunkerAlign = bunkerAlign;

    const catastropheAlign = normalizeTopVerticalAlign(urlParamTopCatastropheAlign.value || "center");
    if (catastropheAlign === "center") delete params.topCatastropheAlign;
    else params.topCatastropheAlign = catastropheAlign;

    const threatsAlign = normalizeTopVerticalAlign(urlParamTopThreatsAlign.value || "center");
    if (threatsAlign === "center") delete params.topThreatsAlign;
    else params.topThreatsAlign = threatsAlign;

    const topBunkerScaleNum = Number.parseFloat(String(urlParamTopBunkerScale.value || "").trim());
    if (Number.isFinite(topBunkerScaleNum)) {
      const normalizedTopBunkerScale = Math.max(0.7, Math.min(2, topBunkerScaleNum));
      if (Math.abs(normalizedTopBunkerScale - 1) < 0.0001) delete params.topBunkerScale;
      else params.topBunkerScale = normalizedTopBunkerScale.toFixed(2).replace(/\.?0+$/, "");
    } else {
      delete params.topBunkerScale;
    }

    const topCatastropheScaleNum = Number.parseFloat(String(urlParamTopCatastropheScale.value || "").trim());
    if (Number.isFinite(topCatastropheScaleNum)) {
      const normalizedTopCatastropheScale = Math.max(0.7, Math.min(2, topCatastropheScaleNum));
      if (Math.abs(normalizedTopCatastropheScale - 1) < 0.0001) delete params.topCatastropheScale;
      else params.topCatastropheScale = normalizedTopCatastropheScale.toFixed(2).replace(/\.?0+$/, "");
    } else {
      delete params.topCatastropheScale;
    }

    const topThreatsScaleNum = Number.parseFloat(String(urlParamTopThreatsScale.value || "").trim());
    if (Number.isFinite(topThreatsScaleNum)) {
      const normalizedTopThreatsScale = Math.max(0.7, Math.min(2, topThreatsScaleNum));
      if (Math.abs(normalizedTopThreatsScale - 1) < 0.0001) delete params.topThreatsScale;
      else params.topThreatsScale = normalizedTopThreatsScale.toFixed(2).replace(/\.?0+$/, "");
    } else {
      delete params.topThreatsScale;
    }

    delete params.topTextScale;

    if (String(urlParamDebug.value || "").trim() === "1") params.debug = "1";
    else delete params.debug;

    if (Object.keys(params).length) {
      draftOverrides.overlayUrlParams = params;
    } else {
      delete draftOverrides.overlayUrlParams;
    }
  }

  function syncOverlayTemplateFromDraftParams() {
    const templateFromParams = buildOverlayTemplateFromStoredParams(draftOverrides.overlayUrlParams);
    if (templateFromParams) {
      overlayUrlPresetTemplate.value = templateFromParams;
      return;
    }
    if (!String(overlayUrlPresetTemplate.value || "").trim()) return;
    overlayUrlPresetTemplate.value = "";
  }

  function renderOverlayUrlPresets() {
    const presets = overlayUrlPresets.length ? overlayUrlPresets : DEFAULT_OVERLAY_URL_PRESETS;
    if (!selectedOverlayUrlPresetId || !presets.some((item) => item.id === selectedOverlayUrlPresetId)) {
      selectedOverlayUrlPresetId = presets[0]?.id || "";
    }

    overlayUrlPresetButtons.textContent = "";
    for (const preset of presets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-small";
      button.dataset.presetId = preset.id;
      if (preset.id === selectedOverlayUrlPresetId) {
        button.classList.add("btn--primary");
      }
      button.textContent = preset.label;
      overlayUrlPresetButtons.append(button);
    }

    const selectedPreset = presets.find((item) => item.id === selectedOverlayUrlPresetId) || null;
    if (!String(overlayUrlPresetTemplate.value || "").trim()) {
      const fromDraftTemplate = buildOverlayTemplateFromStoredParams(draftOverrides.overlayUrlParams);
      if (fromDraftTemplate) {
        overlayUrlPresetTemplate.value = fromDraftTemplate;
      }
    }
    if (selectedPreset && !String(overlayUrlPresetTemplate.value || "").trim()) {
      overlayUrlPresetTemplate.value = selectedPreset.urlTemplate;
    }

    const template = String(overlayUrlPresetTemplate.value || "").trim() || selectedPreset?.urlTemplate || "";
    overlayUrlPresetValue.value = buildResolvedPresetUrl(template);
    renderOverlayUrlParamInputs();

    if (!template) {
      overlayUrlPresetHint.textContent = tr(
        "control.urlPreset.selectHint",
        {},
        "Выбери пресет для быстрого URL в OBS."
      );
      return;
    }
    if (!selectedPreset) {
      overlayUrlPresetHint.textContent = tr(
        "control.urlPreset.customHint",
        {},
        "Используется пользовательский шаблон URL."
      );
      return;
    }
    overlayUrlPresetHint.textContent =
      selectedPreset.comment ||
      tr(
        "control.urlPreset.appliedHint",
        {},
        "Параметры пресета применены к текущей комнате и токену control-панели."
      );
  }

  function normalizeExtraText(raw, index = 0) {
    if (!isRecord(raw)) return null;
    const idRaw = sanitizeLine(raw.id, 64);
    const id = idRaw.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "") || `text-${index + 1}`;
    const text = sanitizeLine(raw.text, MAX_LINE_LEN);
    if (!text) return null;
    return {
      id,
      text,
      x: clamp(Number(raw.x), 0, 1),
      y: clamp(Number(raw.y), 0, 1),
      align: raw.align === "left" || raw.align === "center" || raw.align === "right" ? raw.align : "center",
      size: clamp(Number(raw.size), 8, 96),
      color: typeof raw.color === "string" ? sanitizeLine(raw.color, 32) : "",
      shadow: typeof raw.shadow === "boolean" ? raw.shadow : true,
      visible: typeof raw.visible === "boolean" ? raw.visible : true,
    };
  }

  function cleanupOverrides(raw) {
    const src = isRecord(raw) ? raw : {};
    const out = {};

    if (isRecord(src.enabled)) {
      const enabled = {};
      if (src.enabled.topBunker === false) enabled.topBunker = false;
      if (src.enabled.topCatastrophe === false) enabled.topCatastrophe = false;
      if (src.enabled.topThreats === false) enabled.topThreats = false;
      if (src.enabled.playerNames === false) enabled.playerNames = false;
      if (src.enabled.playerTraits === false) enabled.playerTraits = false;
      if (src.enabled.playerCategories === false) enabled.playerCategories = false;
      if (Object.keys(enabled).length) out.enabled = enabled;
    }

    if (isRecord(src.top)) {
      const top = {};
      const bunkerLines = Array.isArray(src.top.bunkerLines)
        ? src.top.bunkerLines.map((v) => sanitizeLine(v, MAX_LINE_LEN)).filter(Boolean).slice(0, MAX_BUNKER_LINES)
        : [];
      const threatsLines = Array.isArray(src.top.threatsLines)
        ? src.top.threatsLines.map((v) => sanitizeLine(v, MAX_LINE_LEN)).filter(Boolean).slice(0, MAX_THREAT_LINES)
        : [];
      const catastropheText = sanitizeMulti(src.top.catastropheText, MAX_CATA_LEN);
      if (bunkerLines.length) top.bunkerLines = bunkerLines;
      if (threatsLines.length) top.threatsLines = threatsLines;
      if (catastropheText) top.catastropheText = catastropheText;
      if (Object.keys(top).length) out.top = top;
    }

    if (isRecord(src.players)) {
      const playersOut = {};
      for (const [playerId, rawPlayer] of Object.entries(src.players)) {
        if (!isRecord(rawPlayer)) continue;
        const p = {};
        const name = sanitizeLine(rawPlayer.name, MAX_NAME_LEN);
        if (name) p.name = name;

        if (isRecord(rawPlayer.traits)) {
          const traits = {};
          const sex = sanitizeLine(rawPlayer.traits.sex, MAX_LINE_LEN);
          const age = sanitizeLine(rawPlayer.traits.age, MAX_LINE_LEN);
          const orient = sanitizeLine(rawPlayer.traits.orient, MAX_LINE_LEN);
          if (sex) traits.sex = sex;
          if (age) traits.age = age;
          if (orient) traits.orient = orient;
          if (Object.keys(traits).length) p.traits = traits;
        }

        if (isRecord(rawPlayer.categories)) {
          const categories = {};
          for (const [k, v] of Object.entries(rawPlayer.categories)) {
            const key = sanitizeLine(k, 40);
            const value = sanitizeLine(v, MAX_LINE_LEN);
            if (key && value) categories[key] = value;
          }
          if (Object.keys(categories).length) p.categories = categories;
        }

        if (isRecord(rawPlayer.enabled)) {
          const enabled = {};
          if (rawPlayer.enabled.name === false) enabled.name = false;
          if (rawPlayer.enabled.traits === false) enabled.traits = false;
        if (isRecord(rawPlayer.enabled.categories)) {
          const flags = {};
          for (const [k, v] of Object.entries(rawPlayer.enabled.categories)) {
            const key = sanitizeLine(k, 40);
            if (!key || typeof v !== "boolean") continue;
            if (v !== defaultCategoryEnabled(key)) flags[key] = v;
          }
          if (Object.keys(flags).length) enabled.categories = flags;
        }
          if (Object.keys(enabled).length) p.enabled = enabled;
        }

        if (Object.keys(p).length) playersOut[playerId] = p;
      }
      if (Object.keys(playersOut).length) out.players = playersOut;
    }

    if (Array.isArray(src.extraTexts)) {
      const extraTexts = src.extraTexts.map((item, index) => normalizeExtraText(item, index)).filter(Boolean);
      if (extraTexts.length) out.extraTexts = extraTexts;
    }

    const backgroundPreset = normalizeBackgroundPresetId(src.backgroundPreset || "");
    if (backgroundPreset) {
      out.backgroundPreset = backgroundPreset;
    }

    const overlayUrlParams = sanitizeOverlayUrlParamsForOverrides(src.overlayUrlParams);
    if (Object.keys(overlayUrlParams).length) {
      out.overlayUrlParams = overlayUrlParams;
    }

    return out;
  }

  function stable(value) {
    const norm = (entry) => {
      if (Array.isArray(entry)) return entry.map((item) => norm(item));
      if (!isRecord(entry)) return entry;
      const out = {};
      for (const key of Object.keys(entry).sort()) out[key] = norm(entry[key]);
      return out;
    };
    return JSON.stringify(norm(value));
  }

  function isDirty() {
    return stable(cleanupOverrides(draftOverrides)) !== stable(cleanupOverrides(serverOverrides));
  }

  function syncDirtyBadge() {
    if (isDirty()) {
      dirtyBadge.textContent = tr("control.dirty.dirty");
      dirtyBadge.classList.add("is-dirty");
      return;
    }
    dirtyBadge.textContent = tr("control.dirty.clean");
    dirtyBadge.classList.remove("is-dirty");
  }

  function applyOverridesForControl(baseState, overrides) {
    if (!isRecord(baseState)) return null;
    if (!isRecord(overrides)) return clone(baseState);

    const state = clone(baseState);
    const enabled = isRecord(overrides.enabled) ? overrides.enabled : {};
    const isEnabled = (key) => enabled[key] !== false;

    if (isRecord(overrides.top) && isRecord(state.top)) {
      if (isEnabled("topBunker") && Array.isArray(overrides.top.bunkerLines) && isRecord(state.top.bunker)) {
        state.top.bunker.lines = overrides.top.bunkerLines.slice(0, MAX_BUNKER_LINES).map((v) => String(v ?? ""));
      }
      if (isEnabled("topCatastrophe") && typeof overrides.top.catastropheText === "string" && isRecord(state.top.catastrophe)) {
        state.top.catastrophe.text = overrides.top.catastropheText;
      }
      if (isEnabled("topThreats") && Array.isArray(overrides.top.threatsLines) && isRecord(state.top.threats)) {
        state.top.threats.lines = overrides.top.threatsLines.slice(0, MAX_THREAT_LINES).map((v) => String(v ?? ""));
      }
    }

    const playersOverride = isRecord(overrides.players) ? overrides.players : {};
    if (!Array.isArray(state.players)) state.players = [];

    for (const player of state.players) {
      const current = isRecord(playersOverride[player.id]) ? playersOverride[player.id] : {};
      const currentEnabled = isRecord(current.enabled) ? current.enabled : {};
      const categoriesEnabledMap = isRecord(currentEnabled.categories) ? currentEnabled.categories : {};
      const visibilityMap = {};

      const namesEnabled = isEnabled("playerNames") && currentEnabled.name !== false;
      player.__overlayHideName = !namesEnabled;
      if (namesEnabled && typeof current.name === "string") player.nickname = current.name;
      else if (!namesEnabled) player.nickname = "";

      const traitsEnabled = isEnabled("playerTraits") && currentEnabled.traits !== false;
      player.__overlayHideTraits = !traitsEnabled;
      if (traitsEnabled && isRecord(current.traits) && isRecord(player.tags)) {
        if (typeof current.traits.sex === "string" && isRecord(player.tags.sex)) {
          player.tags.sex = { ...player.tags.sex, revealed: true, value: current.traits.sex };
        }
        if (typeof current.traits.age === "string" && isRecord(player.tags.age)) {
          player.tags.age = { ...player.tags.age, revealed: true, value: current.traits.age };
        }
        if (typeof current.traits.orient === "string" && isRecord(player.tags.orientation)) {
          player.tags.orientation = { ...player.tags.orientation, revealed: true, value: current.traits.orient };
        }
      } else if (!traitsEnabled && isRecord(player.tags)) {
        if (isRecord(player.tags.sex)) player.tags.sex = { ...player.tags.sex, revealed: false, value: "?" };
        if (isRecord(player.tags.age)) player.tags.age = { ...player.tags.age, revealed: false, value: "?" };
        if (isRecord(player.tags.orientation)) player.tags.orientation = { ...player.tags.orientation, revealed: false, value: "?" };
      }

      const categoriesEnabled = isEnabled("playerCategories");
      if (!Array.isArray(player.categories)) player.categories = [];

      for (const category of player.categories) {
        if (!category || !category.key) continue;
        const categoryOn = categoriesEnabled && getCategoryEnabledFlag(categoriesEnabledMap, category.key);
        visibilityMap[category.key] = categoryOn;
        category.__overlayEnabled = categoryOn;
        if (!categoryOn) {
          category.revealed = false;
          category.value = "";
        }
      }

      if (isRecord(current.categories)) {
        for (const [k, v] of Object.entries(current.categories)) {
          const categoryOn = categoriesEnabled && getCategoryEnabledFlag(categoriesEnabledMap, k);
          visibilityMap[k] = categoryOn;
          if (!categoryOn) continue;
          const value = String(v ?? "");
          const existing = player.categories.find((item) => item && item.key === k);
          if (existing) {
            existing.revealed = true;
            existing.value = value;
            existing.__overlayEnabled = true;
          } else {
            player.categories.push({ key: k, label: k, revealed: true, value, __overlayEnabled: true });
          }
        }
      }

      for (const [k, rawEnabled] of Object.entries(categoriesEnabledMap)) {
        if (typeof rawEnabled === "boolean") visibilityMap[k] = rawEnabled;
      }
      player.__overlayCategoryEnabled = visibilityMap;
      player.__overlayHideCategories = !player.categories.some((item) => item && item.__overlayEnabled !== false);
    }

    return state;
  }

  function setLatestOverlayState(state) {
    latestOverlayState = isRecord(state) ? clone(state) : null;
    const overrides = isRecord(latestOverlayState?.overrides) ? latestOverlayState.overrides : {};
    effectiveOverlayState = applyOverridesForControl(latestOverlayState, overrides);
  }

  function getSelectedPlayer() {
    return players.find((player) => player.playerId === selectedPlayerId) || null;
  }

  function getPlayerDraft(playerId, create = true) {
    ensureDraftShape();
    if (!isRecord(draftOverrides.players[playerId]) && create) {
      draftOverrides.players[playerId] = {};
    }
    return isRecord(draftOverrides.players[playerId]) ? draftOverrides.players[playerId] : null;
  }

  function getEffectiveTop() {
    const top = isRecord(effectiveOverlayState?.top) ? effectiveOverlayState.top : {};
    const bunker = Array.isArray(top.bunker?.lines) ? top.bunker.lines.map((line) => String(line || "")).filter(Boolean) : [];
    const catastrophe = typeof top.catastrophe?.text === "string" ? top.catastrophe.text : "";
    const threats = Array.isArray(top.threats?.lines) ? top.threats.lines.map((line) => String(line || "")).filter(Boolean) : [];
    const hiddenText = tr("overlay.hidden");
    return {
      bunker: bunker.length ? bunker : [hiddenText],
      catastrophe: catastrophe || hiddenText,
      threats: threats.length ? threats : [hiddenText],
    };
  }

  function getBaseTop() {
    const top = isRecord(latestOverlayState?.top) ? latestOverlayState.top : {};
    const catastrophe = typeof top.catastrophe?.text === "string" ? top.catastrophe.text : "";
    const hiddenText = tr("overlay.hidden");
    return {
      catastrophe: catastrophe || hiddenText,
    };
  }

  function getEffectivePlayer(playerId) {
    if (!Array.isArray(effectiveOverlayState?.players)) return null;
    return effectiveOverlayState.players.find((player) => player && player.id === playerId) || null;
  }

  function getEffectiveCategory(playerId, categoryKey) {
    const player = getEffectivePlayer(playerId);
    if (!player || !Array.isArray(player.categories)) {
      return { shown: false, value: "", label: categoryKey };
    }
    const visibilityMap = isRecord(player.__overlayCategoryEnabled) ? player.__overlayCategoryEnabled : {};
    const aliases = CATEGORY_KEY_ALIASES[categoryKey] || [];
    if (visibilityMap[categoryKey] === false || aliases.some((alias) => visibilityMap[alias] === false)) {
      return { shown: false, value: "", label: categoryKey };
    }
    const category = player.categories.find((item) => item && item.key === categoryKey);
    if (!category) return { shown: false, value: "", label: categoryKey };
    if (category.__overlayEnabled === false) return { shown: false, value: "", label: category.label || categoryKey };
    return {
      shown: Boolean(category.revealed),
      value: String(category.value || ""),
      label: String(category.label || categoryKey),
    };
  }

  function deriveCategoryDefs() {
    const map = new Map();
    for (const category of categoryDefsFromServer) {
      if (!category?.key) continue;
      map.set(category.key, category.label || category.key);
    }
    for (const category of DEFAULT_CATEGORIES) {
      if (!map.has(category.key)) map.set(category.key, category.label);
    }
    for (const player of players) {
      if (!Array.isArray(player.categories)) continue;
      for (const category of player.categories) {
        if (category?.key && !map.has(category.key)) map.set(category.key, category.label || category.key);
      }
    }
    for (const player of Array.isArray(effectiveOverlayState?.players) ? effectiveOverlayState.players : []) {
      if (!Array.isArray(player?.categories)) continue;
      for (const category of player.categories) {
        if (category?.key && !map.has(category.key)) map.set(category.key, category.label || category.key);
      }
    }
    categoryDefs = Array.from(map.entries()).map(([key, label]) => ({ key, label }));
    categoriesAllowedKeys.textContent = tr(
      "control.categories.allowedKeys",
      { keys: categoryDefs.map((item) => item.key).join(", ") || "-" },
      `Разрешённые ключи: ${categoryDefs.map((item) => item.key).join(", ") || "-"}`
    );
  }

  function renderPlayerSelect() {
    playerSelect.textContent = "";
    for (const player of players) {
      const option = document.createElement("option");
      option.value = player.playerId;
      option.textContent = player.name || player.nickname || player.playerId;
      playerSelect.append(option);
    }
    if (!players.some((player) => player.playerId === selectedPlayerId)) {
      selectedPlayerId = players[0]?.playerId || "";
    }
    if (selectedPlayerId) playerSelect.value = selectedPlayerId;
    const selected = getSelectedPlayer();
    const selectedName = selected
      ? fixMojibake(selected.name || selected.nickname || selected.playerId, "Игрок")
      : "-";
    kickSelectedLabel.textContent = tr("control.sidebar.selectedNamed", { name: selectedName });
  }

  function renderPlayersList() {
    playersList.textContent = "";
    for (const player of players) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "player-btn";
      button.dataset.playerId = player.playerId;
      if (player.playerId === selectedPlayerId) button.classList.add("is-active");

      const name = document.createElement("span");
      name.className = "player-btn__name";
      name.textContent = fixMojibake(player.name || player.nickname || player.playerId, "Игрок");

      const meta = document.createElement("span");
      meta.className = "player-btn__meta";
      if (player.connected === false) meta.classList.add("offline");
      const aliveText =
        player.alive === false
          ? tr("control.playerMeta.leftBunker", {})
          : tr("control.playerMeta.inGame");
      const onlineText =
        player.connected === false
          ? tr("control.playerMeta.offline", {})
          : tr("control.playerMeta.online");
      meta.textContent = `${aliveText} | ${onlineText}`;

      button.append(name, meta);
      playersList.append(button);
    }
  }

  function getTopValidation() {
    const bunker = parseLines(topBunkerLines.value, MAX_BUNKER_LINES, MAX_LINE_LEN);
    const threats = parseLines(topThreatsLines.value, MAX_THREAT_LINES, MAX_LINE_LEN);
    const cataRaw = sanitizeMultiRaw(topCatastropheText.value);
    const cataTooLong = cataRaw.length > MAX_CATA_LEN;
    const catastropheText = cataRaw.slice(0, MAX_CATA_LEN);

    topBunkerMeta.textContent = tr(
      "control.top.metaLines",
      { current: bunker.count, max: MAX_BUNKER_LINES },
      `${bunker.count}/${MAX_BUNKER_LINES} строк`
    );
    topThreatsMeta.textContent = tr(
      "control.top.metaLines",
      { current: threats.count, max: MAX_THREAT_LINES },
      `${threats.count}/${MAX_THREAT_LINES} строк`
    );
    topCatastropheMeta.textContent = tr(
      "control.top.metaChars",
      { current: cataRaw.length, max: MAX_CATA_LEN },
      `${cataRaw.length}/${MAX_CATA_LEN} символов`
    );

    topBunkerMeta.classList.toggle("error", bunker.tooMany || bunker.tooLong);
    topThreatsMeta.classList.toggle("error", threats.tooMany || threats.tooLong);
    topCatastropheMeta.classList.toggle("error", cataTooLong);

    const errors = [];
    if (bunker.tooMany) {
      errors.push(
        tr("control.top.error.bunkerLinesMax", { max: MAX_BUNKER_LINES })
      );
    }
    if (bunker.tooLong) {
      errors.push(
        tr("control.top.error.bunkerLineCharsMax", { max: MAX_LINE_LEN })
      );
    }
    if (threats.tooMany) {
      errors.push(
        tr("control.top.error.threatLinesMax", { max: MAX_THREAT_LINES })
      );
    }
    if (threats.tooLong) {
      errors.push(
        tr("control.top.error.threatLineCharsMax", { max: MAX_LINE_LEN })
      );
    }
    if (cataTooLong) {
      errors.push(
        tr("control.top.error.catastropheCharsMax", { max: MAX_CATA_LEN })
      );
    }

    return {
      bunkerLines: bunker.lines,
      threatsLines: threats.lines,
      catastropheText,
      errors,
    };
  }

  function renderTopEditor() {
    const enabled = isRecord(draftOverrides.enabled) ? draftOverrides.enabled : {};
    const top = isRecord(draftOverrides.top) ? draftOverrides.top : {};
    const currentTop = getEffectiveTop();
    const baseTop = getBaseTop();

    topCurrentBunker.textContent = currentTop.bunker.join("\n");
    topCurrentCatastrophe.textContent = currentTop.catastrophe;
    topCurrentThreats.textContent = currentTop.threats.join("\n");
    topBaseCatastrophe.textContent = baseTop.catastrophe;

    enabledTopBunker.checked = enabled.topBunker !== false;
    enabledTopCatastrophe.checked = enabled.topCatastrophe !== false;
    enabledTopThreats.checked = enabled.topThreats !== false;

    topBunkerLines.value = Array.isArray(top.bunkerLines) ? top.bunkerLines.join("\n") : "";
    topCatastropheText.value = typeof top.catastropheText === "string" ? top.catastropheText : "";
    topThreatsLines.value = Array.isArray(top.threatsLines) ? top.threatsLines.join("\n") : "";

    topBunkerLines.placeholder = currentTop.bunker.join("\n");
    topCatastropheText.placeholder = currentTop.catastrophe;
    topThreatsLines.placeholder = currentTop.threats.join("\n");

    const hasCatastropheOverride =
      typeof top.catastropheText === "string" && top.catastropheText.trim().length > 0;
    if (enabledTopCatastrophe.checked && hasCatastropheOverride) {
      topCatastropheSource.textContent = tr(
        "control.obs.catastropheSourceOverride",
        {},
        "Сейчас используется: override из Overlay Control"
      );
    } else {
      topCatastropheSource.textContent = tr(
        "control.obs.catastropheSourceData",
        {},
        "Сейчас используется: текст из данных катастрофы"
      );
    }
    getTopValidation();
  }

  function applyTopInputsToDraft() {
    ensureDraftShape();
    const validation = getTopValidation();

    if (enabledTopBunker.checked) delete draftOverrides.enabled.topBunker;
    else draftOverrides.enabled.topBunker = false;
    if (enabledTopCatastrophe.checked) delete draftOverrides.enabled.topCatastrophe;
    else draftOverrides.enabled.topCatastrophe = false;
    if (enabledTopThreats.checked) delete draftOverrides.enabled.topThreats;
    else draftOverrides.enabled.topThreats = false;

    if (validation.bunkerLines.length) draftOverrides.top.bunkerLines = validation.bunkerLines;
    else delete draftOverrides.top.bunkerLines;
    if (validation.threatsLines.length) draftOverrides.top.threatsLines = validation.threatsLines;
    else delete draftOverrides.top.threatsLines;
    if (validation.catastropheText) draftOverrides.top.catastropheText = validation.catastropheText;
    else delete draftOverrides.top.catastropheText;

    if (Object.keys(draftOverrides.top).length === 0) delete draftOverrides.top;
    if (Object.keys(draftOverrides.enabled).length === 0) delete draftOverrides.enabled;
    return validation;
  }

  function getCurrentPlayerDisplay(playerId) {
    const current = getEffectivePlayer(playerId);
    const hidden = {
      name: Boolean(current?.__overlayHideName),
      traits: Boolean(current?.__overlayHideTraits),
      categories: Boolean(current?.__overlayHideCategories),
    };
    const hiddenByToggleText = tr("control.playerEditor.hiddenByToggle");
    return {
      name: hidden.name ? hiddenByToggleText : String(current?.nickname || "-"),
      sex: hidden.traits ? hiddenByToggleText : String(current?.tags?.sex?.value || "?"),
      age: hidden.traits ? hiddenByToggleText : String(current?.tags?.age?.value || "?"),
      orient: hidden.traits ? hiddenByToggleText : String(current?.tags?.orientation?.value || "?"),
    };
  }

  function updateAdvancedCategoriesJson(entry) {
    const categories = isRecord(entry?.categories) ? entry.categories : {};
    playerCategoriesJson.value = JSON.stringify(categories, null, 2);
  }

  function getRandomCategoryValue(categoryKey) {
    const pool = [];
    for (const player of Array.isArray(effectiveOverlayState?.players) ? effectiveOverlayState.players : []) {
      if (!Array.isArray(player.categories)) continue;
      const category = player.categories.find((item) => item && item.key === categoryKey);
      if (!category || !category.revealed || category.__overlayEnabled === false) continue;
      const value = String(category.value || "").trim();
      if (value && value !== "?") pool.push(value);
    }
    if (!pool.length) return "";
    return pool[Math.floor(Math.random() * pool.length)] || "";
  }

  function renderPlayerEditor() {
    const player = getSelectedPlayer();
    if (!player) {
      playerEditorTitle.textContent = tr("control.playerEditor.title");
      playerNameInput.value = "";
      traitSexInput.value = "";
      traitAgeInput.value = "";
      traitOrientInput.value = "";
      currentPlayerName.textContent = tr("control.obs.currentWithValue", { value: "-" });
      currentTraitSex.textContent = tr("control.obs.currentWithValue", { value: "-" });
      currentTraitAge.textContent = tr("control.obs.currentWithValue", { value: "-" });
      currentTraitOrient.textContent = tr("control.obs.currentWithValue", { value: "-" });
      playerEnabledName.checked = true;
      playerEnabledTraits.checked = true;
      playerEnabledCategories.checked = true;
      categoriesGrid.textContent = "";
      playerCategoriesJson.value = "{}";
      return;
    }

    const entry = getPlayerDraft(player.playerId, true) || {};
    const traits = isRecord(entry.traits) ? entry.traits : {};
    const enabled = isRecord(entry.enabled) ? entry.enabled : {};
    const enabledCategories = isRecord(enabled.categories) ? enabled.categories : {};
    const hasEnabledCategory = categoryDefs.some((category) =>
      getCategoryEnabledFlag(enabledCategories, category.key)
    );
    const current = getCurrentPlayerDisplay(player.playerId);

    playerEditorTitle.textContent = tr(
      "control.playerEditor.titleWithName",
      { name: player.name || player.nickname || player.playerId },
      `Игрок: ${player.name || player.nickname || player.playerId}`
    );
    playerNameInput.value = String(entry.name || "");
    playerNameInput.placeholder = current.name;
    traitSexInput.value = String(traits.sex || "");
    traitSexInput.placeholder = current.sex;
    traitAgeInput.value = String(traits.age || "");
    traitAgeInput.placeholder = current.age;
    traitOrientInput.value = String(traits.orient || "");
    traitOrientInput.placeholder = current.orient;

    currentPlayerName.textContent = tr("control.obs.currentWithValue", { value: current.name });
    currentTraitSex.textContent = tr("control.obs.currentWithValue", { value: current.sex });
    currentTraitAge.textContent = tr("control.obs.currentWithValue", { value: current.age });
    currentTraitOrient.textContent = tr("control.obs.currentWithValue", { value: current.orient });

    playerEnabledName.checked = enabled.name !== false;
    playerEnabledTraits.checked = enabled.traits !== false;
    playerEnabledCategories.checked = hasEnabledCategory;

    categoriesGrid.textContent = "";
    for (const category of categoryDefs) {
      const card = document.createElement("article");
      card.className = "category-card";

      const head = document.createElement("div");
      head.className = "category-card__head";

      const left = document.createElement("div");
      const title = document.createElement("h4");
      title.className = "category-card__title";
      title.textContent = category.label;
      const keyMeta = document.createElement("div");
      keyMeta.className = "meta";
      keyMeta.textContent = tr("control.playerEditor.categoryKey", { key: category.key });
      left.append(title, keyMeta);
      head.append(left);

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "field";
      toggleLabel.title = tr(
        "control.playerEditor.categoryToggleTitle",
        {},
        "Включает/выключает показ этой категории на overlay для выбранного игрока."
      );
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.dataset.action = "category-toggle";
      toggle.dataset.categoryKey = category.key;
      toggle.checked = getCategoryEnabledFlag(enabledCategories, category.key);
      const toggleText = document.createElement("span");
      toggleText.textContent = tr("control.playerEditor.showCategory");
      toggleLabel.append(toggle, toggleText);
      head.append(toggleLabel);
      card.append(head);

      const currentCategory = getEffectiveCategory(player.playerId, category.key);
      const currentMeta = document.createElement("div");
      currentMeta.className = "meta";
      currentMeta.textContent = currentCategory.shown
        ? tr("control.obs.currentWithValue", { value: currentCategory.value || "-" })
        : tr("control.obs.currentHidden");
      card.append(currentMeta);

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = MAX_LINE_LEN;
      input.dataset.action = "category-input";
      input.dataset.categoryKey = category.key;
      input.value = isRecord(entry.categories) ? String(entry.categories[category.key] || "") : "";
      input.placeholder = currentCategory.value || tr("control.placeholder.categoryText");
      card.append(input);

      const actions = document.createElement("div");
      actions.className = "category-card__actions";
      const randomBtn = document.createElement("button");
      randomBtn.type = "button";
      randomBtn.className = "btn btn-small";
      randomBtn.dataset.action = "category-random";
      randomBtn.dataset.categoryKey = category.key;
      randomBtn.textContent = tr("control.button.random");
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "btn btn-small";
      clearBtn.dataset.action = "category-clear";
      clearBtn.dataset.categoryKey = category.key;
      clearBtn.textContent = tr("control.button.clear");
      actions.append(randomBtn, clearBtn);
      card.append(actions);

      categoriesGrid.append(card);
    }

    updateAdvancedCategoriesJson(entry);
  }

  function getDraftExtraTexts() {
    return Array.isArray(draftOverrides.extraTexts) ? draftOverrides.extraTexts : [];
  }

  function setDraftExtraTexts(items) {
    if (!Array.isArray(items) || items.length === 0) {
      delete draftOverrides.extraTexts;
      return;
    }
    draftOverrides.extraTexts = items;
  }

  function syncExtraTextsJson(force = false) {
    if (!force && document.activeElement === extraTextsJson) return;
    extraTextsJson.value = JSON.stringify(getDraftExtraTexts(), null, 2);
  }

  function renderExtraTextsEditor() {
    const items = getDraftExtraTexts();
    extraTextsList.textContent = "";

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = tr("control.extraTexts.empty");
      extraTextsList.append(empty);
      syncExtraTextsJson();
      return;
    }

    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "extra-card";

      const head = document.createElement("div");
      head.className = "extra-card__head";
      const title = document.createElement("span");
      title.className = "extra-card__title";
      title.textContent = tr("control.extraTexts.blockTitle", { index: index + 1, id: item.id });
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-small btn--danger";
      removeBtn.dataset.action = "extra-remove";
      removeBtn.dataset.index = String(index);
      removeBtn.textContent = tr("control.button.delete");
      head.append(title, removeBtn);
      card.append(head);

      const textField = document.createElement("label");
      textField.className = "field";
      textField.innerHTML = `<span>${tr("control.extraTexts.textLabel")}</span>`;
      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.maxLength = MAX_LINE_LEN;
      textInput.dataset.action = "extra-field";
      textInput.dataset.field = "text";
      textInput.dataset.index = String(index);
      textInput.value = item.text || "";
      textField.append(textInput);
      card.append(textField);

      const grid = document.createElement("div");
      grid.className = "extra-card__grid";
      const fields = [
        { label: tr("control.extraTexts.field.id"), field: "id", type: "text", value: item.id, attrs: {} },
        { label: tr("control.extraTexts.field.x"), field: "x", type: "number", value: String(item.x), attrs: { step: "0.01", min: "0", max: "1" } },
        { label: tr("control.extraTexts.field.y"), field: "y", type: "number", value: String(item.y), attrs: { step: "0.01", min: "0", max: "1" } },
        { label: tr("control.extraTexts.field.size"), field: "size", type: "number", value: String(item.size ?? 20), attrs: { step: "1", min: "8", max: "96" } },
        { label: tr("control.extraTexts.field.color"), field: "color", type: "text", value: item.color || "", attrs: {} },
      ];
      for (const def of fields) {
        const label = document.createElement("label");
        label.className = "field";
        const span = document.createElement("span");
        span.textContent = def.label;
        const input = document.createElement("input");
        input.type = def.type;
        input.dataset.action = "extra-field";
        input.dataset.field = def.field;
        input.dataset.index = String(index);
        input.value = def.value;
        for (const [k, v] of Object.entries(def.attrs)) input.setAttribute(k, v);
        label.append(span, input);
        grid.append(label);
      }

      const alignLabel = document.createElement("label");
      alignLabel.className = "field";
      const alignSpan = document.createElement("span");
      alignSpan.textContent = tr("control.extraTexts.field.align");
      const alignSelect = document.createElement("select");
      alignSelect.dataset.action = "extra-field";
      alignSelect.dataset.field = "align";
      alignSelect.dataset.index = String(index);
      for (const optionDef of [
        ["left", tr("control.align.left")],
        ["center", tr("control.align.center")],
        ["right", tr("control.align.right")],
      ]) {
        const option = document.createElement("option");
        option.value = optionDef[0];
        option.textContent = optionDef[1];
        option.selected = item.align === optionDef[0];
        alignSelect.append(option);
      }
      alignLabel.append(alignSpan, alignSelect);
      grid.append(alignLabel);
      card.append(grid);

      const checks = document.createElement("div");
      checks.className = "extra-card__checks";
      const visibleLabel = document.createElement("label");
      const visibleInput = document.createElement("input");
      visibleInput.type = "checkbox";
      visibleInput.dataset.action = "extra-field";
      visibleInput.dataset.field = "visible";
      visibleInput.dataset.index = String(index);
      visibleInput.checked = item.visible !== false;
      visibleLabel.append(visibleInput, document.createTextNode(tr("control.playerEditor.showCategory")));

      const shadowLabel = document.createElement("label");
      const shadowInput = document.createElement("input");
      shadowInput.type = "checkbox";
      shadowInput.dataset.action = "extra-field";
      shadowInput.dataset.field = "shadow";
      shadowInput.dataset.index = String(index);
      shadowInput.checked = item.shadow !== false;
      shadowLabel.append(shadowInput, document.createTextNode(tr("control.extraTexts.shadow")));
      checks.append(visibleLabel, shadowLabel);
      card.append(checks);

      const help = document.createElement("p");
      help.className = "hint";
      help.textContent = tr(
        "control.extraTexts.positionHelp",
        {},
        "X/Y: 0 — левый/верхний край, 1 — правый/нижний край."
      );
      card.append(help);
      extraTextsList.append(card);
    });

    syncExtraTextsJson();
  }

  function getPresenterControlPlayers() {
    const presenter = isRecord(presenterState) ? presenterState : null;
    if (!presenter) return [];
    const control = isRecord(presenter.control) ? presenter.control : {};
    const playersDetailed = Array.isArray(control.players) ? control.players : [];
    if (playersDetailed.length > 0) return playersDetailed;
    const playersFallback = Array.isArray(presenter.players) ? presenter.players : [];
    return playersFallback.map((player) => ({
      playerId: String(player.playerId || ""),
      name: String(player.name || player.playerId || tr("control.player.fallback")),
      status: String(player.status || "alive"),
      hand: [],
      specialConditions: [],
    }));
  }

  function getPresenterControlWorld() {
    const presenter = isRecord(presenterState) ? presenterState : null;
    if (!presenter) return null;
    const control = isRecord(presenter.control) ? presenter.control : {};
    return isRecord(control.world) ? control.world : null;
  }

  function getDeckCards(deckName) {
    const key = String(deckName || "").trim();
    if (!key || !isRecord(controlDeckCatalog) || !Array.isArray(controlDeckCatalog[key])) return [];
    return controlDeckCatalog[key]
      .filter((entry) => isRecord(entry) && String(entry.id || "").trim())
      .map((entry) => ({
        id: String(entry.id),
        labelShort: String(entry.labelShort || entry.id),
        text: String(entry.text || entry.description || ""),
      }));
  }

  function getPresenterSpecialCatalog() {
    const presenter = isRecord(presenterState) ? presenterState : null;
    const control = presenter && isRecord(presenter.control) ? presenter.control : null;
    const rawCatalog = control && Array.isArray(control.specialCatalog) ? control.specialCatalog : [];
    return rawCatalog
      .filter((entry) => isRecord(entry))
      .map((entry) => ({
        id: String(entry.id || "").trim(),
        title: String(entry.title || entry.id || "").trim(),
        text: String(entry.text || "").trim(),
        implemented: entry.implemented !== false,
        choiceKind: String(entry.choiceKind || "").trim(),
        targetScope: String(entry.targetScope || "").trim(),
        allowSelfTarget: Boolean(entry.allowSelfTarget),
        effectType: String(entry.effectType || "").trim(),
        requires: Array.isArray(entry.requires)
          ? entry.requires.map((item) => String(item || "").trim()).filter(Boolean)
          : [],
      }))
      .filter((entry) => entry.id && entry.title);
  }

  function findDeckNameByCardId(cardId) {
    const requested = String(cardId || "").trim();
    if (!requested || !isRecord(controlDeckCatalog)) return "";
    for (const [deckName, cards] of Object.entries(controlDeckCatalog)) {
      if (!Array.isArray(cards)) continue;
      if (cards.some((card) => isRecord(card) && String(card.id || "") === requested)) {
        return deckName;
      }
    }
    return "";
  }

  function detectWorldDeckName(kind, world) {
    if (!isRecord(world)) return "";
    if (kind === "disaster") {
      return findDeckNameByCardId(String(world.disaster?.imageId || ""));
    }
    const list = kind === "bunker" ? world.bunker : world.threats;
    if (!Array.isArray(list) || list.length === 0) return "";
    for (const card of list) {
      const found = findDeckNameByCardId(String(card?.imageId || ""));
      if (found) return found;
    }
    return "";
  }

  function getCommandsReady() {
    return isRealtimeConnected && wsRoomReady && controlRole === "CONTROL";
  }

  function renderCardReplaceBlock() {
    const players = getPresenterControlPlayers();
    const options = players.map((player) => ({
      value: String(player.playerId),
      label: fixMojibake(String(player.name || player.playerId || "Игрок"), "Игрок"),
    }));
    const preferredPlayer = String(replaceTargetPlayerSelect.value || selectedPlayerId || options[0]?.value || "");
    fillSelectOptions(replaceTargetPlayerSelect, options, preferredPlayer);
    const targetPlayerId = String(replaceTargetPlayerSelect.value || "");
    const target = players.find((player) => String(player.playerId) === targetPlayerId) || null;
    const hand = Array.isArray(target?.hand) ? target.hand : [];
    const specials = Array.isArray(target?.specialConditions) ? target.specialConditions : [];
    const combinedCards = [
      ...hand.map((card) => ({
        area: "hand",
        instanceId: String(card.instanceId || ""),
        label: `${String(card.deck || "-")} • ${String(card.labelShort || card.instanceId || tr("control.card.fallback"))} ${
          card.revealed
            ? tr("control.card.revealedShort", {})
            : tr("control.card.hiddenShort", {})
        }`,
        deck: String(card.deck || ""),
      })),
      ...specials.map((special) => ({
        area: "special",
        instanceId: String(special.instanceId || ""),
        label: `${tr("control.special.prefix")} • ${String(
          tr("control.special.fallback", {})
        )}${special.used ? ` ${tr("control.special.usedShort")}` : ""}`,
        deck: tr("control.special.deckName"),
      })),
    ].filter((entry) => entry.instanceId);

    fillSelectOptions(
      replaceCardSelect,
      combinedCards.map((entry) => ({
        value: `${entry.area}:${entry.instanceId}`,
        label: entry.label,
      })),
      String(replaceCardSelect.value || "")
    );

    const selectedRaw = String(replaceCardSelect.value || "");
    const splitIndex = selectedRaw.indexOf(":");
    const selectedArea =
      splitIndex > 0 ? String(selectedRaw.slice(0, splitIndex)).trim().toLowerCase() : "hand";
    const selectedInstanceId =
      splitIndex > 0 ? String(selectedRaw.slice(splitIndex + 1)).trim() : selectedRaw.trim();
    const selectedCard = hand.find((card) => String(card.instanceId) === selectedInstanceId) || null;
    const selectedSpecial =
      selectedArea === "special"
        ? specials.find((special) => String(special.instanceId) === selectedInstanceId) || null
        : null;
    const presenterSpecialCatalog = getPresenterSpecialCatalog();
    const deckCards =
      selectedArea === "special"
        ? presenterSpecialCatalog
            .filter((entry) => entry.implemented)
            .map((entry) => ({ id: entry.id, labelShort: entry.title }))
        : getDeckCards(selectedCard?.deck || "");
    fillSelectOptions(
      replaceSpecificCardSelect,
      deckCards.map((card) => ({
        value: card.id,
        label: card.labelShort,
      })),
      String(replaceSpecificCardSelect.value || "")
    );
    const isSpecific = String(replaceModeSelect.value || "random") === "specific";
    replaceSpecificCardSelect.disabled = !isSpecific || deckCards.length === 0;
    const commandsReady = getCommandsReady();
    const hasSelection = selectedArea === "special" ? Boolean(selectedSpecial) : Boolean(selectedCard);
    replaceExecuteBtn.disabled = !commandsReady || !hasSelection;
    const modeText = isSpecific ? "конкретная карта" : "случайная карта";
    const modeLabel = isSpecific
      ? tr("control.replace.mode.specific", {})
      : tr("control.replace.mode.random");
    replaceHint.textContent = hasSelection
      ? tr(
          "control.replace.hint.selected",
          {
            player: fixMojibake(String(target?.name || targetPlayerId), "Игрок"),
            source:
              selectedArea === "special"
                ? tr("control.replace.source.special", {})
                : tr("control.replace.source.card", { deck: String(selectedCard?.deck || "-") }),
            mode: modeLabel,
          },
          `Игрок: ${fixMojibake(String(target?.name || targetPlayerId), "Игрок")} • Источник: ${
          selectedArea === "special"
            ? "особое условие"
            : `карта (${String(selectedCard?.deck || "-")})`
        } • Режим: ${modeText}.`
        )
      : tr("control.replace.hint.selectFirst");
  }

  function renderVotingBlock() {
    const state = presenterActionState;
    voteOutcomeRow.hidden = !state.postGameActive;
    voteOutcomeState.textContent =
      state.postGameOutcome === "survived"
        ? tr("control.vote.outcome.survived", {})
        : state.postGameOutcome === "failed"
          ? tr("control.vote.outcome.failed", {})
          : tr("control.vote.outcomeNone");
    voteStartGameBtn.disabled = !state.commandsReady || !state.canStartGame;
    voteNextStepBtn.disabled = !state.commandsReady || !state.canNextStep;
    voteSkipStepBtn.disabled = !state.commandsReady || !state.canSkipStep;
    voteStartBtn.disabled = !state.commandsReady || !state.canStartVote;
    voteEndBtn.disabled = !state.commandsReady || !state.canEndVote;
    voteSkipRoundBtn.disabled = !state.commandsReady || !state.canSkipRound;
    voteOutcomeSurvivedBtn.disabled = !state.commandsReady || !state.canSetOutcome;
    voteOutcomeFailedBtn.disabled = !state.commandsReady || !state.canSetOutcome;
  }

  function renderHostTransferBlock() {
    const presenter = isRecord(presenterState) ? presenterState : null;
    const players = Array.isArray(presenter?.players) ? presenter.players : [];
    const hostId = String(presenter?.hostId || "").trim();
    const candidates = players.filter(
      (player) => String(player.playerId || "") !== hostId && player.connected !== false
    );
    fillSelectOptions(
      hostTransferTargetSelect,
      candidates.map((player) => ({
        value: String(player.playerId || ""),
        label: fixMojibake(String(player.name || player.playerId || "Игрок"), "Игрок"),
      })),
      String(hostTransferTargetSelect.value || "")
    );
    const hostPlayer = players.find((player) => String(player.playerId || "") === hostId) || null;
    const hostName = hostPlayer
      ? fixMojibake(String(hostPlayer.name || hostPlayer.playerId || "Игрок"), "Игрок")
      : "-";
    const commandsReady = getCommandsReady();
    const hasCandidates = candidates.length > 0;
    hostTransferBtn.disabled = !commandsReady || !hasCandidates;
    hostTransferBtn.title = hasCandidates
      ? ""
      : tr("control.transfer.noCandidates");
    hostTransferHint.textContent = hasCandidates
      ? tr("control.transfer.currentHost", { host: hostName })
      : tr(
          "control.transfer.currentHostNoCandidates",
          { host: hostName },
          `Текущий ведущий: ${hostName}. Нет подключенных кандидатов для передачи.`
        );
  }

  function renderWorldBlock() {
    const world = getPresenterControlWorld();
    const kind = String(worldKindSelect.value || "threat");
    const list =
      kind === "disaster"
        ? [{ index: 0, title: String(world?.disaster?.title || tr("control.world.disasterFallback")), isRevealed: true, imageId: String(world?.disaster?.imageId || "") }]
        : Array.isArray(world?.[kind === "bunker" ? "bunker" : "threats"])
          ? world[kind === "bunker" ? "bunker" : "threats"]
          : [];
    fillSelectOptions(
      worldIndexSelect,
      list.map((card) => ({
        value: String(card.index ?? 0),
        label: `#${Number(card.index ?? 0) + 1} • ${String(card.title || tr("control.world.cardFallback"))}`,
      })),
      String(worldIndexSelect.value || "")
    );
    worldIndexSelect.disabled = kind === "disaster";

    const deckName = detectWorldDeckName(kind, world);
    const deckCards = getDeckCards(deckName);
    fillSelectOptions(
      worldReplaceCardSelect,
      deckCards.map((card) => ({ value: card.id, label: card.labelShort })),
      String(worldReplaceCardSelect.value || "")
    );
    const isSpecific = String(worldReplaceModeSelect.value || "random") === "specific";
    worldReplaceCardSelect.disabled = !isSpecific || deckCards.length === 0;
    const selectedIndex = Number(worldIndexSelect.value);
    const selectedCard =
      kind === "disaster"
        ? list[0] || null
        : list.find((card) => Number(card.index) === selectedIndex) || null;

    const maxCount =
      kind === "bunker"
        ? Array.isArray(world?.bunker) ? world.bunker.length : 0
        : kind === "threat"
          ? Array.isArray(world?.threats) ? world.threats.length : 0
          : 0;
    worldCountInput.disabled = kind === "disaster";
    if (kind !== "disaster") {
      worldCountInput.max = String(maxCount);
      const currentCount =
        kind === "bunker"
          ? Number(world?.counts?.bunker ?? world?.bunker?.length ?? 0)
          : Number(world?.counts?.threats ?? world?.threats?.length ?? 0);
      worldCountInput.value = String(currentCount);
    } else {
      worldCountInput.value = "";
    }

    const commandsReady = getCommandsReady();
    const isRevealAvailable = kind !== "disaster" && Boolean(selectedCard);
    worldToggleRevealBtn.disabled = !commandsReady || !isRevealAvailable;
    worldToggleRevealBtn.textContent =
      selectedCard && selectedCard.isRevealed
        ? tr("control.world.hideCard", {})
        : tr("control.world.revealCard");
    worldReplaceBtn.disabled = !commandsReady || list.length === 0;
    worldSetCountBtn.disabled = !commandsReady || kind === "disaster";
    const revealStateText =
      selectedCard && kind !== "disaster"
        ? selectedCard.isRevealed
          ? tr("control.world.currentRevealed", {})
          : tr("control.world.currentHidden", {})
        : tr("control.world.selectCard");
    worldHint.textContent = deckName
      ? tr("control.world.hint.deckKnown", { state: revealStateText, deck: deckName })
      : tr(
          "control.world.hint.deckAuto",
          { state: revealStateText },
          `${revealStateText} Колода мира определяется автоматически по текущим картам.`
        );
  }

  function buildSpecialCatalog(players) {
    const catalog = [];
    const seenOwned = new Set();
    for (const player of players) {
      const specials = Array.isArray(player.specialConditions) ? player.specialConditions : [];
      for (const special of specials) {
        const instanceId = String(special.instanceId || "").trim();
        if (!instanceId || seenOwned.has(instanceId)) continue;
        seenOwned.add(instanceId);
        const scope = String(special.targetScope || special.choiceKind || "");
        const text = String(special.text || "").trim();
        catalog.push({
          mode: "owned",
          value: instanceId,
          actorPlayerId: String(player.playerId || ""),
          title: String(special.title || instanceId),
          text: text || tr("control.special.descriptionMissing"),
          scope,
          choiceKind: String(special.choiceKind || "").trim(),
          targetScope: String(special.targetScope || "").trim(),
          allowSelfTarget: Boolean(special.allowSelfTarget),
          effectType: String(special.effectType || "").trim(),
          requires: Array.isArray(special.requires)
            ? special.requires.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
          used: Boolean(special.used),
          implemented: Boolean(special.implemented),
        });
      }
    }
    const fromScenarioCatalog = getPresenterSpecialCatalog().map((entry) => ({
      mode: "catalog",
      value: entry.id,
      actorPlayerId: "",
      title: entry.title,
      text: entry.text || tr("control.special.descriptionMissing"),
      scope: String(entry.targetScope || entry.choiceKind || "").trim(),
      choiceKind: String(entry.choiceKind || "").trim(),
      targetScope: String(entry.targetScope || "").trim(),
      allowSelfTarget: Boolean(entry.allowSelfTarget),
      effectType: String(entry.effectType || "").trim(),
      requires: Array.isArray(entry.requires) ? entry.requires : [],
      used: false,
      implemented: entry.implemented !== false,
    }));
    catalog.push(...fromScenarioCatalog);
    if (fromScenarioCatalog.length === 0) {
      const fallbackDeck = getDeckCards(tr("control.special.deckName")).map((card) => ({
        mode: "catalog",
        value: card.labelShort,
        actorPlayerId: "",
        title: card.labelShort,
        text: String(card.text || "").trim() || tr("control.special.descriptionUnavailable"),
        scope: "",
        choiceKind: "",
        targetScope: "",
        allowSelfTarget: false,
        effectType: "",
        requires: [],
        used: false,
        implemented: true,
      }));
      catalog.push(...fallbackDeck);
    }
    return catalog;
  }

  function getSpecialFieldRequirements(entry) {
    const mode = String(specialSourceModeSelect.value || "owned");
    if (!entry) {
      return {
        showActor: mode !== "catalog",
        needTargetPlayer: false,
        needBaggageCard: false,
        needBunkerIndex: false,
        needCategory: false,
        needUseSelf: false,
      };
    }
    const choiceKind = String(entry.choiceKind || "").trim().toLowerCase();
    const targetScope = String(entry.targetScope || "").trim().toLowerCase();
    const effectType = String(entry.effectType || "").trim().toLowerCase();
    const requires = Array.isArray(entry.requires)
      ? entry.requires.map((item) => String(item || "").trim().toLowerCase())
      : [];
    const requiresText = requires.join(" ");

    const needTargetPlayer =
      choiceKind === "player" ||
      targetScope === "player" ||
      targetScope === "others" ||
      targetScope === "alive_others" ||
      targetScope === "neighbors" ||
      requiresText.includes("target") ||
      requiresText.includes("neighbor");

    const needBaggageCard =
      effectType.includes("baggage") || requires.includes("targethasbaggage");
    const needBunkerIndex =
      choiceKind === "bunker" ||
      effectType.includes("bunker") ||
      effectType.includes("revealedcard");
    const needCategory =
      choiceKind === "category" ||
      effectType.includes("category") ||
      effectType.includes("revealedcategory");
    const needUseSelf =
      Boolean(entry.allowSelfTarget) ||
      targetScope === "player" ||
      choiceKind === "player";

    return {
      showActor: mode !== "catalog",
      needTargetPlayer,
      needBaggageCard,
      needBunkerIndex,
      needCategory,
      needUseSelf,
    };
  }

  function applySpecialFieldVisibility({
    showActor,
    needTargetPlayer,
    needBaggageCard,
    needBunkerIndex,
    needCategory,
    needUseSelf,
  }) {
    const actorField = specialActorPlayerSelect.closest("label.field");
    const targetPlayerField = specialTargetPlayerSelect.closest("label.field");
    const targetCardField = specialTargetCardSelect.closest("label.field");
    const bunkerIndexField = specialThreatIndexSelect.closest("label.field");
    const categoryField = specialCategorySelect.closest("label.field");
    const useSelfField = specialUseSelfSelect.closest("label.field");

    if (actorField) actorField.hidden = !showActor;
    if (targetPlayerField) targetPlayerField.hidden = !needTargetPlayer;
    if (targetCardField) targetCardField.hidden = !needBaggageCard;
    if (bunkerIndexField) bunkerIndexField.hidden = !needBunkerIndex;
    if (categoryField) categoryField.hidden = !needCategory;
    if (useSelfField) useSelfField.hidden = !needUseSelf;

    specialActorPlayerSelect.disabled = !showActor;
    specialTargetPlayerSelect.disabled = !needTargetPlayer;
    specialTargetCardSelect.disabled = !needBaggageCard;
    specialThreatIndexSelect.disabled = !needBunkerIndex;
    specialCategorySelect.disabled = !needCategory;
    specialUseSelfSelect.disabled = !needUseSelf;
  }

  function renderSpecialBlock() {
    const players = getPresenterControlPlayers();
    const mode = String(specialSourceModeSelect.value || "owned");
    const hostId = String(presenterState?.hostId || "");
    const preferredActor =
      mode === "catalog"
        ? String(hostId || specialActorPlayerSelect.value || selectedPlayerId || "")
        : String(specialActorPlayerSelect.value || selectedPlayerId || "");
    fillSelectOptions(
      specialActorPlayerSelect,
      players.map((player) => ({
        value: String(player.playerId),
        label: fixMojibake(String(player.name || player.playerId || "Игрок"), "Игрок"),
      })),
      preferredActor
    );
    if (mode === "catalog" && hostId) {
      specialActorPlayerSelect.value = hostId;
    }
    fillSelectOptions(
      specialTargetPlayerSelect,
      players.map((player) => ({
        value: String(player.playerId),
        label: fixMojibake(String(player.name || player.playerId || "Игрок"), "Игрок"),
      })),
      String(specialTargetPlayerSelect.value || selectedPlayerId || "")
    );

    const targetPlayerId = String(specialTargetPlayerSelect.value || "");
    const targetPlayer = players.find((player) => String(player.playerId) === targetPlayerId) || null;
    const targetCards = Array.isArray(targetPlayer?.hand)
      ? targetPlayer.hand.filter((card) => {
          const deck = String(card.deck || "").trim().toLowerCase();
          return deck === "багаж" || deck === "baggage";
        })
      : [];
    fillSelectOptions(
      specialTargetCardSelect,
      targetCards.map((card) => ({
        value: String(card.instanceId || ""),
        label: `${String(card.labelShort || card.instanceId || tr("control.baggage.fallback"))} ${
          card.revealed
            ? tr("control.card.revealedMascShort", {})
            : tr("control.card.hiddenShort", {})
        }`,
      })),
      String(specialTargetCardSelect.value || "")
    );

    const world = getPresenterControlWorld();
    fillSelectOptions(
      specialThreatIndexSelect,
      Array.isArray(world?.bunker)
        ? world.bunker.map((card) => ({
            value: String(card.index),
            label: `#${Number(card.index) + 1} • ${String(card.title || tr("control.world.bunkerCardFallback"))}`,
          }))
        : [],
      String(specialThreatIndexSelect.value || "")
    );

    specialCatalogCache = buildSpecialCatalog(players);
    const actorPlayerId = String(specialActorPlayerSelect.value || "");
    const availableSpecials = specialCatalogCache.filter((entry) =>
      mode === "owned" ? entry.mode === "owned" && entry.actorPlayerId === actorPlayerId : entry.mode === "catalog"
    );
    fillSelectOptions(
      specialPickerSelect,
      availableSpecials.map((entry) => ({
        value: String(entry.value),
        label:
          mode === "owned"
            ? `${String(entry.title)}${entry.used ? ` ${tr("control.special.usedShort")}` : ""}`
            : String(entry.title),
      })),
      String(specialPickerSelect.value || "")
    );
    const picked = availableSpecials.find((entry) => String(entry.value) === String(specialPickerSelect.value || ""));
    const requirements = getSpecialFieldRequirements(picked);
    applySpecialFieldVisibility(requirements);
    specialDescriptionText.value = String(picked?.text || tr("control.special.descriptionUnavailable"));
    const commandsReady = getCommandsReady();
    specialApplyBtn.disabled = !commandsReady || !picked;
    const sourceHint =
      mode === "owned"
        ? tr("control.special.source.owned", {})
        : tr("control.special.source.catalog");
    const fieldsHint = [];
    if (requirements.needTargetPlayer) fieldsHint.push(tr("control.special.field.target"));
    if (requirements.needBaggageCard) fieldsHint.push(tr("control.special.field.baggage"));
    if (requirements.needBunkerIndex) fieldsHint.push(tr("control.special.field.bunkerIndex"));
    if (requirements.needCategory) fieldsHint.push(tr("control.special.field.category"));
    const scopePart = picked?.scope
      ? tr("control.special.hint.scopePart", { scope: picked.scope })
      : "";
    const paramsPart = fieldsHint.length
      ? tr(
          "control.special.hint.paramsPart",
          { params: fieldsHint.join(", ") },
          ` • Параметры: ${fieldsHint.join(", ")}`
        )
      : "";
    specialHint.textContent = picked
      ? tr(
          "control.special.hint.selected",
          {
            source: sourceHint,
            scopePart,
            paramsPart,
          },
          `Источник: ${sourceHint}${scopePart}${paramsPart}.`
        )
      : tr("control.special.hint.select");
  }

  function renderDevBlock() {
    const players = getPresenterControlPlayers();
    const controlId = String(presenterState?.controlId || "");
    const preferredTarget = String(devTargetPlayerSelect.value || selectedPlayerId || "");
    fillSelectOptions(
      devTargetPlayerSelect,
      players.map((player) => ({
        value: String(player.playerId),
        label: fixMojibake(String(player.name || player.playerId || "Игрок"), "Игрок"),
      })),
      preferredTarget
    );
    if (String(devTargetPlayerSelect.value || "") === controlId) {
      const fallback = players.find((player) => String(player.playerId) !== controlId);
      if (fallback) {
        devTargetPlayerSelect.value = String(fallback.playerId);
      }
    }
    const commandsReady = getCommandsReady();
    devAddBotBtn.disabled = !commandsReady;
    devRemoveBotBtn.disabled = !commandsReady;
    devKickBtn.disabled = !commandsReady;
    devMarkLeftBtn.disabled = !commandsReady;
    devSkipRoundBtn.disabled = !commandsReady;
    const selected = String(devTargetPlayerSelect.value || "").trim();
    devHint.textContent = selected
      ? tr("control.dev.selectedPlayer", { player: selected })
      : tr("control.dev.selectHint");
  }

  function renderHostBlocks() {
    renderCardReplaceBlock();
    renderVotingBlock();
    renderHostTransferBlock();
    renderWorldBlock();
    renderSpecialBlock();
    renderDevBlock();
  }

  function fillSelectOptions(select, entries, keepValue = "") {
    const current = keepValue || String(select.value || "");
    select.textContent = "";
    if (!entries || entries.length === 0) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = tr("control.option.noneAvailable");
      select.append(emptyOption);
      select.selectedIndex = 0;
      return;
    }
    let hasCurrent = false;
    for (const entry of entries) {
      const option = document.createElement("option");
      option.value = String(entry.value ?? "");
      option.textContent = String(entry.label ?? entry.value ?? "");
      if (option.value === current) {
        option.selected = true;
        hasCurrent = true;
      }
      select.append(option);
    }
    if (!hasCurrent && select.options.length > 0) {
      select.selectedIndex = 0;
    }
  }

  function getScenarioActionConfig(actionType) {
    const config = {
      revealCard: { needsTarget: false, needsCard: true, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: false, actorMode: "actor", picker: "card" },
      applySpecial: { needsTarget: true, needsCard: true, needsSpecial: true, needsThreat: true, needsOutcome: false, needsDevName: false, actorMode: "actor", picker: "special" },
      vote: { needsTarget: true, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: false, actorMode: "actor", picker: null },
      continueRound: { needsTarget: false, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: false, actorMode: "actor", picker: null },
      finalizeVoting: { needsTarget: false, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: false, actorMode: "host", picker: null },
      revealWorldThreat: { needsTarget: false, needsCard: false, needsSpecial: false, needsThreat: true, needsOutcome: false, needsDevName: false, actorMode: "host", picker: "threat" },
      setBunkerOutcome: { needsTarget: false, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: true, needsDevName: false, actorMode: "host", picker: null },
      markLeftBunker: { needsTarget: true, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: false, actorMode: "host", picker: null },
      devKickPlayer: { needsTarget: true, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: false, actorMode: "host", picker: null },
      devSkipRound: { needsTarget: false, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: false, actorMode: "host", picker: null },
      devAddPlayer: { needsTarget: false, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: true, actorMode: "host", picker: null },
      devRemovePlayer: { needsTarget: true, needsCard: false, needsSpecial: false, needsThreat: false, needsOutcome: false, needsDevName: false, actorMode: "host", picker: null },
    };
    return config[actionType] || config.revealCard;
  }

  function resolveAssetPreviewUrl(rawId, fallbackImgUrl = "") {
    const id = String(rawId || "").trim();
    if (id) {
      if (id.startsWith("http://") || id.startsWith("https://")) return id;
      if (id.startsWith("/")) return id;
      return `/assets/${id}`;
    }
    const imgUrl = String(fallbackImgUrl || "").trim();
    if (!imgUrl) return "";
    if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://") || imgUrl.startsWith("/")) return imgUrl;
    return `/assets/${imgUrl}`;
  }

  function resolveControlActionMeta(actionType, fallbackTitle = "") {
    const raw = CONTROL_ACTION_META[actionType];
    if (!raw) {
      return {
        title: fallbackTitle || actionType,
        hint: "",
        guide: "",
      };
    }
    return {
      title: tr(raw.titleKey, {}, raw.titleFallback || fallbackTitle || actionType),
      hint: tr(raw.hintKey, {}, raw.hintFallback || ""),
      guide: tr(raw.guideKey, {}, raw.guideFallback || ""),
    };
  }

  function renderQuickActions(activeActionType) {
    const options = Array.from(controlScenarioAction.options || []);
    controlQuickActions.textContent = "";
    for (const option of options) {
      const actionType = String(option.value || "");
      if (!actionType) continue;
      const meta = resolveControlActionMeta(actionType, String(option.textContent || actionType));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `control-quick-btn${actionType === activeActionType ? " is-active" : ""}`;
      btn.dataset.actionType = actionType;

      const title = document.createElement("span");
      title.className = "control-quick-btn__title";
      title.textContent = meta.title;
      const hint = document.createElement("span");
      hint.className = "control-quick-btn__hint";
      hint.textContent = meta.hint;
      btn.append(title, hint);
      controlQuickActions.append(btn);
    }
  }

  function buildPickerCard(title, metaText, imageUrl, isActive) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `picker-card${isActive ? " is-active" : ""}`;
    const img = document.createElement("div");
    img.className = "picker-card__img";
    if (imageUrl) img.style.backgroundImage = `url("${imageUrl}")`;
    const body = document.createElement("div");
    body.className = "picker-card__body";
    const titleEl = document.createElement("div");
    titleEl.className = "picker-card__title";
    titleEl.textContent = title;
    const metaEl = document.createElement("div");
    metaEl.className = "picker-card__meta";
    metaEl.textContent = metaText;
    body.append(titleEl, metaEl);
    btn.append(img, body);
    return btn;
  }

  function renderCardPicker(actorCards, selectedCardId, isVisible) {
    controlCardPicker.hidden = !isVisible;
    controlCardPicker.textContent = "";
    if (!isVisible) return;
    const title = document.createElement("div");
    title.className = "control-pickers__title";
    title.textContent = tr("control.quickPicker.card.title");
    controlCardPicker.append(title);
    const grid = document.createElement("div");
    grid.className = "control-pickers__grid";
    for (const card of actorCards) {
      const cardId = String(card.instanceId || "");
      const imageUrl = resolveAssetPreviewUrl(card.id);
      const btn = buildPickerCard(
        `${String(card.deck || "-")} • ${String(
          tr("control.world.cardFallback", {})
        )}`,
        card.revealed
          ? tr("control.card.revealedShort", {})
          : tr("control.card.hiddenShort"),
        imageUrl,
        cardId === selectedCardId
      );
      btn.dataset.cardId = cardId;
      grid.append(btn);
    }
    if (grid.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = tr("control.quickPicker.card.empty");
      controlCardPicker.append(empty);
      return;
    }
    controlCardPicker.append(grid);
  }

  function renderSpecialPicker(actorSpecials, selectedSpecialId, isVisible) {
    controlSpecialPicker.hidden = !isVisible;
    controlSpecialPicker.textContent = "";
    if (!isVisible) return;
    const title = document.createElement("div");
    title.className = "control-pickers__title";
    title.textContent = tr("control.quickPicker.special.title");
    controlSpecialPicker.append(title);
    const grid = document.createElement("div");
    grid.className = "control-pickers__grid";
    for (const special of actorSpecials) {
      const specialId = String(special.instanceId || "");
      const imageUrl = resolveAssetPreviewUrl("", special.imgUrl);
      const metaText = special.used
        ? tr("control.quickPicker.special.used", {})
        : tr("control.quickPicker.special.ready");
      const btn = buildPickerCard(
        String(special.title || specialId || tr("control.special.fallback")),
        metaText,
        imageUrl,
        specialId === selectedSpecialId
      );
      btn.dataset.specialId = specialId;
      grid.append(btn);
    }
    if (grid.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = tr(
        "control.quickPicker.special.empty",
        {},
        "У выбранного игрока нет спецусловий."
      );
      controlSpecialPicker.append(empty);
      return;
    }
    controlSpecialPicker.append(grid);
  }

  function renderThreatPicker(world, selectedThreatIndex, isVisible, actionType = "") {
    controlThreatPicker.hidden = !isVisible;
    controlThreatPicker.textContent = "";
    if (!isVisible) return;
    const title = document.createElement("div");
    title.className = "control-pickers__title";
    title.textContent =
      actionType === "applySpecial"
        ? tr("control.quickPicker.bunker.title", {})
        : tr("control.quickPicker.threat.title");
    controlThreatPicker.append(title);
    const sourceCards =
      actionType === "applySpecial"
        ? (Array.isArray(world?.bunker) ? world.bunker : [])
        : (Array.isArray(world?.threats) ? world.threats : []);
    const grid = document.createElement("div");
    grid.className = "control-pickers__grid";
    for (const worldCard of sourceCards) {
      const indexText = String(worldCard.index);
      const imageUrl = resolveAssetPreviewUrl(worldCard.imageId);
      const btn = buildPickerCard(
        `#${Number(worldCard.index) + 1} • ${String(
          tr("control.world.cardFallback", {})
        )}`,
        worldCard.isRevealed
          ? tr("control.card.revealedShort", {})
          : tr("control.card.hiddenShort"),
        imageUrl,
        indexText === selectedThreatIndex
      );
      btn.dataset.threatIndex = indexText;
      grid.append(btn);
    }
    if (grid.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = tr(
        "control.quickPicker.threat.empty",
        {},
        "Угрозы недоступны в текущем состоянии."
      );
      controlThreatPicker.append(empty);
      return;
    }
    controlThreatPicker.append(grid);
  }

  function renderScenarioActionEditor() {
    const presenter = isRecord(presenterState) ? presenterState : null;
    const players = getPresenterControlPlayers();
    const world = getPresenterControlWorld();
    const hostId = String(presenter?.hostId || "");

    if (!controlActorPlayerId || !players.some((player) => String(player.playerId) === controlActorPlayerId)) {
      controlActorPlayerId =
        selectedPlayerId && players.some((player) => String(player.playerId) === selectedPlayerId)
          ? selectedPlayerId
          : String(players[0]?.playerId || hostId || "");
    }

    fillSelectOptions(
      controlActorSelect,
      players.map((player) => ({
        value: String(player.playerId),
        label: fixMojibake(String(player.name || player.playerId || "Игрок"), "Игрок"),
      })),
      controlActorPlayerId
    );
    controlActorPlayerId = String(controlActorSelect.value || controlActorPlayerId || "");

    const actor = players.find((player) => String(player.playerId) === controlActorPlayerId) || null;
    const actorCards = Array.isArray(actor?.hand) ? actor.hand : [];
    const actorSpecials = Array.isArray(actor?.specialConditions) ? actor.specialConditions : [];

    fillSelectOptions(
      controlTargetSelect,
      players.map((player) => ({
        value: String(player.playerId),
        label: fixMojibake(String(player.name || player.playerId || "Игрок"), "Игрок"),
      })),
      String(controlTargetSelect.value || selectedPlayerId || "")
    );
    fillSelectOptions(
      controlCardSelect,
      actorCards.map((card) => ({
        value: String(card.instanceId || ""),
        label: `${String(card.deck || "-")} • ${String(
          tr("control.card.fallback", {})
        )} ${
          card.revealed
            ? tr("control.card.revealedShort", {})
            : tr("control.card.hiddenShort", {})
        }`,
      })),
      String(controlCardSelect.value || "")
    );
    fillSelectOptions(
      controlSpecialSelect,
      actorSpecials.map((special) => ({
        value: String(special.instanceId || ""),
        label: `${String(
          tr("control.special.fallback", {})
        )} ${special.used ? tr("control.special.usedShort") : ""}`,
      })),
      String(controlSpecialSelect.value || "")
    );
    fillSelectOptions(
      controlThreatIndex,
      Array.isArray(world?.threats)
        ? world.threats.map((threat) => ({
            value: String(threat.index),
            label: `#${threat.index + 1} • ${String(
              tr("control.world.kind.threat", {})
            )} ${
          threat.isRevealed
            ? tr("control.card.revealedShort", {})
            : tr("control.card.hiddenShort", {})
            }`,
          }))
        : [],
      String(controlThreatIndex.value || "")
    );

    const actionType = String(controlScenarioAction.value || "revealCard");
    const config = getScenarioActionConfig(actionType);
    const meta = resolveControlActionMeta(actionType, String(controlScenarioAction.selectedOptions?.[0]?.textContent || actionType));
    renderQuickActions(actionType);
    controlTargetRow.hidden = !config.needsTarget;
    controlCardRow.hidden = !config.needsCard;
    controlSpecialRow.hidden = !config.needsSpecial;
    controlThreatRow.hidden = !config.needsThreat;
    controlOutcomeRow.hidden = !config.needsOutcome;
    controlDevNameRow.hidden = !config.needsDevName;

    renderCardPicker(actorCards, String(controlCardSelect.value || ""), Boolean(config.needsCard));
    renderSpecialPicker(actorSpecials, String(controlSpecialSelect.value || ""), Boolean(config.needsSpecial));
    renderThreatPicker(world, String(controlThreatIndex.value || ""), Boolean(config.needsThreat), actionType);

    const actorName = actor ? fixMojibake(String(actor.name || actor.playerId || "Игрок"), "Игрок") : "-";
    const actorLabel =
      config.actorMode === "host"
        ? tr("control.quick.actor.host", {})
        : actorName;
    const shortHint = meta?.hint ? ` ${meta.hint}` : "";
    controlActionHint.textContent = tr(
      "control.quick.actorHint",
      { actor: actorLabel, hint: shortHint.trim() },
      `Действие будет отправлено как: ${actorLabel}.${shortHint}`
    );
    controlGuide.textContent = meta?.guide || tr("control.quick.guideFallback");
  }

  function buildScenarioControlRequest() {
    const actionType = String(controlScenarioAction.value || "").trim();
    if (!actionType) throw new Error(tr("control.error.actionRequired"));
    const config = getScenarioActionConfig(actionType);
    const presenter = isRecord(presenterState) ? presenterState : null;
    const hostId = String(presenter?.hostId || "");
    const actorPlayerId =
      config.actorMode === "host"
        ? hostId
        : String(controlActorSelect.value || controlActorPlayerId || hostId || "");
    if (!actorPlayerId) {
      throw new Error(tr("control.error.actorResolve"));
    }

    const payload = {};
    if (actionType === "revealCard") {
      const cardId = String(controlCardSelect.value || "").trim();
      if (!cardId) throw new Error(tr("control.error.revealNeedCard"));
      payload.cardId = cardId;
    } else if (actionType === "applySpecial") {
      const specialInstanceId = String(controlSpecialSelect.value || "").trim();
      if (!specialInstanceId) throw new Error(tr("control.error.specialNeedCard"));
      payload.specialInstanceId = specialInstanceId;
      const specialPayload = {};
      const targetPlayerId = String(controlTargetSelect.value || "").trim();
      if (targetPlayerId) specialPayload.targetPlayerId = targetPlayerId;
      const cardId = String(controlCardSelect.value || "").trim();
      if (cardId) specialPayload.baggageCardId = cardId;
      const threatOrBunkerIndex = Number(controlThreatIndex.value);
      if (Number.isInteger(threatOrBunkerIndex) && threatOrBunkerIndex >= 0) {
        specialPayload.bunkerIndex = threatOrBunkerIndex;
      }
      payload.payload = specialPayload;
    } else if (actionType === "vote") {
      const targetPlayerId = String(controlTargetSelect.value || "").trim();
      if (!targetPlayerId) throw new Error(tr("control.error.voteNeedTarget"));
      payload.targetPlayerId = targetPlayerId;
    } else if (actionType === "revealWorldThreat") {
      const index = Number(controlThreatIndex.value);
      if (!Number.isInteger(index) || index < 0) {
        throw new Error(tr("control.error.worldNeedIndex"));
      }
      payload.index = index;
    } else if (actionType === "setBunkerOutcome") {
      payload.outcome = String(controlOutcomeSelect.value || "survived");
    } else if (actionType === "markLeftBunker" || actionType === "devKickPlayer" || actionType === "devRemovePlayer") {
      const targetPlayerId = String(controlTargetSelect.value || "").trim();
      if (!targetPlayerId) throw new Error(tr("control.error.targetRequired"));
      payload.targetPlayerId = targetPlayerId;
    } else if (actionType === "devAddPlayer") {
      const name = String(controlDevNameInput.value || "").trim();
      if (name) payload.name = name;
    }

    const rawJson = String(controlPayloadJson.value || "").trim();
    if (rawJson) {
      let parsed = null;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        throw new Error(tr("control.error.payloadJsonInvalid"));
      }
      if (!isRecord(parsed)) {
        throw new Error(tr("control.error.payloadJsonObject"));
      }
      Object.assign(payload, parsed);
    }

    return {
      actorPlayerId,
      scenarioActionType: actionType,
      scenarioPayload: payload,
    };
  }

  function renderPresenter() {
    const presenter = isRecord(presenterState) ? presenterState : null;
    const enabled = presenterModeFromState == null ? Boolean(presenter?.enabled) : Boolean(presenterModeFromState);
    const modeRaw = presenterModeFromState == null ? "unknown" : String(presenterModeFromState);
    presenterModeState.textContent = tr(
      "control.presenter.stateLabel",
      {
        mode: enabled ? tr("control.presenter.stateOn") : tr("control.presenter.stateOff"),
        raw: modeRaw,
      },
      `Presenter mode: ${enabled ? "on" : "off"} (из state) = ${modeRaw}`
    );
    presenterDisabled.hidden = enabled;
    presenterContent.hidden = !enabled;
    if (!enabled) {
      presenterActionState = {
        commandsReady: false,
        canStartGame: false,
        canNextStep: false,
        canSkipStep: false,
        canStartVote: false,
        canEndVote: false,
        canSkipRound: false,
        canSetOutcome: false,
        postGameActive: false,
        postGameOutcome: "",
      };
      presenterKickPlayerBtn.disabled = true;
      presenterKickPlayerBtn.title = tr("control.presenter.disabledShort");
      renderScenarioActionEditor();
      renderHostBlocks();
      controlExecuteBtn.disabled = true;
      controlActionHint.textContent = tr("control.presenter.disabledShort");
      return;
    }

    presenterRoomPhase.textContent = formatRoomPhase(presenter.roomPhase);
    presenterGamePhase.textContent = formatGamePhase(presenter.gamePhase, presenter);
    presenterRound.textContent = presenter.round == null ? "-" : String(presenter.round);
    presenterVotePhase.textContent = formatVotePhase(presenter.votePhase);

    const actions = isRecord(presenter.actions) ? presenter.actions : {};
    const commandsReady = isRealtimeConnected && wsRoomReady && controlRole === "CONTROL";
    const canSetOutcome = actions.canSetOutcome === true;
    const postGameOutcome = String(presenter.postGameOutcome || "");
    presenterActionState = {
      commandsReady,
      canStartGame: actions.canStartGame === true,
      canNextStep: actions.canNextStep === true,
      canSkipStep: actions.canSkipStep === true,
      canStartVote: actions.canStartVote === true,
      canEndVote: actions.canEndVote === true,
      canSkipRound: actions.canSkipRound === true,
      canSetOutcome,
      postGameActive: presenter.postGameActive === true,
      postGameOutcome,
    };

    presenterPlayersBody.textContent = "";
    const players = Array.isArray(presenter.players) ? presenter.players : [];
    const selectedPlayer = players.find((player) => player.playerId === selectedPlayerId) || null;
    const canKickSelected =
      commandsReady &&
      actions.canKickPlayer === true &&
      Boolean(selectedPlayer) &&
      selectedPlayer.playerId !== presenter.controlId &&
      selectedPlayer.status !== "eliminated" &&
      selectedPlayer.status !== "left_bunker";
    presenterKickPlayerBtn.disabled = !canKickSelected;
    presenterKickPlayerBtn.title = canKickSelected
      ? ""
      : !selectedPlayer
        ? tr("control.presenter.kickNeedPlayer", {})
        : selectedPlayer.playerId === presenter.controlId
          ? tr("control.presenter.kickCreatorDenied", {})
          : tr("control.presenter.kickDenied");
    controlExecuteBtn.disabled = !commandsReady;
    for (const player of players) {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = fixMojibake(String(player.name || player.playerId || "-"), "Игрок");
      row.append(nameCell);

      const statusCell = document.createElement("td");
      const baseStatus = formatPlayerStatus(player.status);
      const connectedSuffix =
        player.connected === false ? ` ${tr("control.playerMeta.offlineShort")}` : "";
      statusCell.textContent = `${baseStatus}${connectedSuffix}`;
      row.append(statusCell);

      const votedCell = document.createElement("td");
      votedCell.textContent = player.voted
        ? tr("control.bool.yes", {})
        : tr("control.bool.no");
      row.append(votedCell);

      const voteTargetCell = document.createElement("td");
      voteTargetCell.textContent = fixMojibake(String(player.votedTargetName || "-"), "-");
      row.append(voteTargetCell);

      const votesAgainstCell = document.createElement("td");
      votesAgainstCell.textContent = String(player.votesAgainst ?? 0);
      row.append(votesAgainstCell);

      const revealedCell = document.createElement("td");
      revealedCell.textContent = player.revealedThisRound
        ? tr("control.bool.yes", {})
        : tr("control.bool.no");
      row.append(revealedCell);

      presenterPlayersBody.append(row);
    }
    renderScenarioActionEditor();
    renderHostBlocks();
  }

  function mapControlActionToWs(action) {
    if (action === "START_GAME") return { type: "startGame", payload: {} };
    if (action === "NEXT_STEP") return { type: "continueRound", payload: {} };
    if (action === "START_VOTE") return { type: "continueRound", payload: {} };
    if (action === "END_VOTE") return { type: "finalizeVoting", payload: {} };
    if (action === "SET_OUTCOME_SURVIVED") {
      return { type: "setBunkerOutcome", payload: { outcome: "survived" } };
    }
    if (action === "SET_OUTCOME_FAILED") {
      return { type: "setBunkerOutcome", payload: { outcome: "failed" } };
    }
    if (action === "SKIP_STEP") {
      const presenter = isRecord(presenterState) ? presenterState : null;
      if (presenter?.gamePhase === "reveal_discussion") {
        return { type: "continueRound", payload: {} };
      }
      if (presenter?.gamePhase === "voting" && presenter?.votePhase === "voteSpecialWindow") {
        return { type: "finalizeVoting", payload: {} };
      }
      return null;
    }
    return null;
  }

  function sendWsCommand(type, payload = {}) {
    if (!wsSocket || wsSocket.readyState !== WebSocket.OPEN) {
      throw new Error(tr("control.error.wsNotConnected"));
    }
    wsSocket.send(JSON.stringify({ type, payload }));
  }

  async function sendControlAction(action, extraPayload = {}) {
    if (!action) return;
    const hasToken = Boolean(token);
    console.log("[overlay-control] sendControlAction", { action, roomCode, hasToken, extraPayload });
    if (!(isRealtimeConnected && wsRoomReady && controlRole === "CONTROL")) {
      throw new Error(
        tr("control.error.notControlConnected", {})
      );
    }
    const wsMapped = mapControlActionToWs(action);
    const actionLabel =
      action === "SCENARIO_ACTION" && extraPayload && extraPayload.scenarioActionType
        ? tr(
            "control.command.scenarioPrefix",
            { type: String(extraPayload.scenarioActionType) },
            `Сценарное действие: ${String(extraPayload.scenarioActionType)}`
          )
        : commandLabel(action);
    if (wsMapped) {
      sendWsCommand(wsMapped.type, wsMapped.payload);
      setStatus(
        tr("control.status.commandSent", { command: actionLabel })
      );
      return;
    }

    setStatus(
      tr("control.status.commandRunning", { command: actionLabel })
    );
    const res = await fetch("/overlay-control/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, token, action, ...extraPayload }),
    });
    const data = await res.json().catch(() => ({}));
    console.log("[overlay-control] sendControlAction response", { action, status: res.status, ok: data?.ok === true, data });
    if (!res.ok || !data.ok) {
      if (res.status === 403) {
        throw new Error(tr("control.error.controlDenied"));
      }
      throw new Error(
        data.message ||
          tr(
            "control.error.commandRejectedHttp",
            { status: String(res.status) },
            `Команда отклонена (HTTP ${res.status}).`
          )
      );
    }
    if (data.role) {
      controlRole = String(data.role).toUpperCase();
      renderConnectionStatus();
    }
    if (typeof data.presenterModeEnabled === "boolean") {
      presenterModeFromState = data.presenterModeEnabled;
    }
    if (isRecord(data.presenter)) {
      presenterState = data.presenter;
    }
    renderPresenter();
    setStatus(
      tr("control.status.commandDone", { command: actionLabel })
    );
  }

  async function sendScenarioActionAsHost(actionType, payload = {}) {
    const presenter = isRecord(presenterState) ? presenterState : null;
    const actorPlayerId = String(presenter?.hostId || "");
    if (!actorPlayerId) {
      throw new Error(tr("control.error.hostResolve"));
    }
    await sendControlAction("SCENARIO_ACTION", {
      actorPlayerId,
      scenarioActionType: String(actionType || ""),
      scenarioPayload: isRecord(payload) ? payload : {},
    });
  }

  function renderAll() {
    deriveCategoryDefs();
    renderPresenter();
    renderPlayerSelect();
    renderPlayersList();
    renderTopEditor();
    renderBackgroundPresetEditor();
    renderOverlayUrlPresets();
    renderPlayerEditor();
    renderExtraTextsEditor();
    syncDirtyBadge();
  }

  function applyControlLocale({ refreshUi = false } = {}) {
    controlLang = normalizeLocale(controlLang);
    document.documentElement.lang = controlLang;
    applyStaticLocale();
    const topTitle = document.querySelector(".topbar__meta h1");
    if (topTitle) {
      topTitle.textContent = tr("control.title");
    }
    controlLocaleSelect.value = controlLang;
    controlLocaleLabel.textContent = tr("control.locale.label");
    saveBtn.textContent = tr("control.button.save");
    reloadBtn.textContent = tr("control.button.reload");
    resetPlayerBtn.textContent = tr("control.button.resetPlayer");
    gameControlTabBtn.textContent = tr("control.tab.game");
    obsControlTabBtn.textContent = tr("control.tab.obs");
    
    // Update locale select options
    const localeOptions = controlLocaleSelect.querySelectorAll("option");
    localeOptions.forEach((opt) => {
      if (opt.value === "ru") opt.textContent = tr("control.locale.ru");
      else if (opt.value === "en") opt.textContent = tr("control.locale.en");
    });
    
    roomLabel.textContent = tr(
      "control.room.label",
      { room: connectedRoomCode || roomCode || "-" },
      `Комната: ${connectedRoomCode || roomCode || "-"}`
    );
    renderConnectionStatus();
    syncDirtyBadge();
    if (refreshUi) {
      renderPresenter();
      renderPlayersList();
      renderPlayerEditor();
      renderOverlayUrlPresets();
    }
  }

  function setSelectedPlayerField(field, value) {
    const player = getSelectedPlayer();
    if (!player) return;
    const entry = getPlayerDraft(player.playerId, true);
    if (!entry) return;

    if (field === "name") {
      const safe = sanitizeLine(value, MAX_NAME_LEN);
      if (safe) entry.name = safe;
      else delete entry.name;
    } else {
      if (!isRecord(entry.traits)) entry.traits = {};
      const safe = sanitizeLine(value, MAX_LINE_LEN);
      if (field === "sex") {
        if (safe) entry.traits.sex = safe;
        else delete entry.traits.sex;
      }
      if (field === "age") {
        if (safe) entry.traits.age = safe;
        else delete entry.traits.age;
      }
      if (field === "orient") {
        if (safe) entry.traits.orient = safe;
        else delete entry.traits.orient;
      }
      if (Object.keys(entry.traits).length === 0) delete entry.traits;
    }
    updateAdvancedCategoriesJson(entry);
    syncDirtyBadge();
  }

  function setSelectedToggle(key, checked) {
    const player = getSelectedPlayer();
    if (!player) return;
    const entry = getPlayerDraft(player.playerId, true);
    if (!entry) return;
    if (!isRecord(entry.enabled)) entry.enabled = {};
    if (checked) delete entry.enabled[key];
    else entry.enabled[key] = false;
    if (Object.keys(entry.enabled).length === 0) delete entry.enabled;
    syncDirtyBadge();
  }

  function setSelectedCategoryEnabled(categoryKey, checked) {
    const player = getSelectedPlayer();
    if (!player) return;
    const entry = getPlayerDraft(player.playerId, true);
    if (!entry) return;
    if (!isRecord(entry.enabled)) entry.enabled = {};
    if (!isRecord(entry.enabled.categories)) entry.enabled.categories = {};
    const defaultEnabled = defaultCategoryEnabled(categoryKey);
    if (checked === defaultEnabled) delete entry.enabled.categories[categoryKey];
    else entry.enabled.categories[categoryKey] = checked;
    if (Object.keys(entry.enabled.categories).length === 0) delete entry.enabled.categories;
    if (Object.keys(entry.enabled).length === 0) delete entry.enabled;
    const flags = isRecord(entry.enabled?.categories) ? entry.enabled.categories : {};
    playerEnabledCategories.checked = categoryDefs.some((item) => getCategoryEnabledFlag(flags, item.key));
    syncDirtyBadge();
  }

  function setSelectedCategoryValue(categoryKey, value) {
    const player = getSelectedPlayer();
    if (!player) return;
    const entry = getPlayerDraft(player.playerId, true);
    if (!entry) return;
    if (!isRecord(entry.categories)) entry.categories = {};
    const safe = sanitizeLine(value, MAX_LINE_LEN);
    if (safe) entry.categories[categoryKey] = safe;
    else delete entry.categories[categoryKey];
    if (Object.keys(entry.categories).length === 0) delete entry.categories;
    updateAdvancedCategoriesJson(entry);
    syncDirtyBadge();
  }

  function parseCategoriesJson(rawJson) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson || "{}");
      if (!isRecord(parsed)) throw new Error("Ожидается JSON object");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Невалидный JSON";
      throw new Error(`categories JSON: ${message}`);
    }

    const allowed = new Set(categoryDefs.map((item) => item.key));
    const unknownKeys = [];
    const categories = {};
    for (const [k, v] of Object.entries(parsed)) {
      const key = sanitizeLine(k, 40);
      if (!key) continue;
      if (!allowed.has(key)) {
        unknownKeys.push(key);
        continue;
      }
      const value = sanitizeLine(v, MAX_LINE_LEN);
      if (value) categories[key] = value;
    }
    return { categories, unknownKeys, allowedKeys: Array.from(allowed) };
  }

  function parseExtraTextsJson(rawJson) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson || "[]");
      if (!Array.isArray(parsed)) throw new Error("extraTexts должен быть массивом");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Невалидный JSON";
      throw new Error(`extraTexts JSON: ${message}`);
    }
    return parsed.map((item, index) => normalizeExtraText(item, index)).filter(Boolean);
  }

  function updatePlayersFromControlState(controlPlayers, overlayPlayers) {
    const next = new Map();
    for (const player of Array.isArray(controlPlayers) ? controlPlayers : []) {
      if (!player?.playerId) continue;
      next.set(player.playerId, {
        playerId: player.playerId,
        name: String(player.name || player.nickname || player.playerId),
        nickname: String(player.nickname || player.name || player.playerId),
        connected: player.connected !== false,
        alive: player.alive !== false,
        categories: Array.isArray(player.categories) ? player.categories : [],
      });
    }
    for (const overlay of Array.isArray(overlayPlayers) ? overlayPlayers : []) {
      if (!overlay?.id) continue;
      const prev = next.get(overlay.id);
      next.set(overlay.id, {
        playerId: overlay.id,
        name: String(prev?.name || overlay.nickname || overlay.id),
        nickname: String(overlay.nickname || prev?.nickname || overlay.id),
        connected: typeof overlay.connected === "boolean" ? overlay.connected : prev ? prev.connected !== false : true,
        alive: overlay.alive !== false,
        categories: Array.isArray(overlay.categories) ? overlay.categories : prev?.categories || [],
      });
    }
    players = Array.from(next.values());
  }

  function updatePlayersFromRealtime(overlayPlayers) {
    const prev = new Map(players.map((player) => [player.playerId, player]));
    players = (Array.isArray(overlayPlayers) ? overlayPlayers : [])
      .filter((player) => player?.id)
      .map((player) => ({
        playerId: player.id,
        name: String(prev.get(player.id)?.name || player.nickname || player.id),
        nickname: String(player.nickname || prev.get(player.id)?.nickname || player.id),
        connected: typeof player.connected === "boolean" ? player.connected : prev.get(player.id) ? prev.get(player.id).connected !== false : true,
        alive: player.alive !== false,
        categories: Array.isArray(player.categories) ? player.categories : prev.get(player.id)?.categories || [],
      }));
    if (!players.some((player) => player.playerId === selectedPlayerId)) {
      selectedPlayerId = players[0]?.playerId || "";
    }
  }

  async function loadBackgroundCatalog() {
    try {
      const response = await fetch("/api/overlay-backgrounds");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      backgroundCatalog = normalizeBackgroundCatalog(payload);
    } catch (error) {
      console.warn("[overlay-control] failed to load background catalog", error);
      backgroundCatalog = { defaultPreset: "default", presets: [] };
    }
  }

  async function loadOverlayUrlPresets() {
    try {
      const response = await fetch("/api/overlay-url-presets");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      overlayUrlPresets = normalizeOverlayUrlPresets(payload);
    } catch (error) {
      console.warn("[overlay-control] failed to load overlay URL presets", error);
      overlayUrlPresets = [];
    }
  }

  async function loadState() {
    console.log("[overlay-control] loadState request", { roomCode, tokenPresent: Boolean(token) });
    const res = await fetch(`/overlay-control/state?room=${encodeURIComponent(roomCode)}&token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    console.log("[overlay-control] loadState response", {
      ok: data?.ok === true,
      roomCode: data?.roomCode,
      role: data?.role,
      presenterModeEnabled: data?.presenterModeEnabled,
    });
    controlRole = String(data.role || "CONTROL").toUpperCase();
    presenterModeFromState = typeof data.presenterModeEnabled === "boolean" ? data.presenterModeEnabled : null;
    renderConnectionStatus();

    if (Array.isArray(data.categories)) {
      categoryDefsFromServer = data.categories
        .filter((item) => item?.key)
        .map((item) => ({ key: String(item.key), label: String(item.label || item.key) }));
    }
    controlDeckCatalog = isRecord(data.deckCatalog) ? data.deckCatalog : {};
    presenterState = isRecord(data.presenter) ? data.presenter : null;
    setLatestOverlayState(data.overlayState);

    if (!hasLocaleFromUrl) {
      const stateLocale = normalizeLocale(
        data?.overlayState?.locale || data?.cardLocale || controlLang || "ru"
      );
      controlLang = stateLocale;
      controlLocaleSelect.value = controlLang;
    }
    applyControlLocale({ refreshUi: false });

    updatePlayersFromControlState(data.players, data.overlayState?.players);
    serverOverrides = cleanupOverrides(data.overrides || {});
    draftOverrides = clone(serverOverrides);
    ensureDraftShape();
    overlayUrlPresetTemplate.value = "";
    if (!players.some((player) => player.playerId === selectedPlayerId)) {
      selectedPlayerId = players[0]?.playerId || "";
    }
    await Promise.all([loadBackgroundCatalog(), loadOverlayUrlPresets()]);
    renderAll();
    setStatus(tr("control.status.stateLoaded"));
  }

  function buildOverridesForSave() {
    const validation = applyTopInputsToDraft();
    if (validation.errors.length) throw new Error(validation.errors.join(" "));
    applyBackgroundPresetInputToDraft();
    applyOverlayUrlPresetTemplateToDraft();
    setDraftExtraTexts(parseExtraTextsJson(extraTextsJson.value.trim() || "[]"));
    return cleanupOverrides(draftOverrides);
  }

  async function saveState() {
    const overrides = buildOverridesForSave();
    setStatus(tr("control.status.saving"));
    const res = await fetch("/overlay-control/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, token, overrides }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    serverOverrides = cleanupOverrides(data.overrides || overrides);
    draftOverrides = clone(serverOverrides);
    ensureDraftShape();
    if (latestOverlayState) {
      latestOverlayState.overrides = clone(serverOverrides);
      setLatestOverlayState(latestOverlayState);
    }
    renderAll();
    setStatus(tr("control.status.saved"));
  }

  async function reloadStateWithConfirm() {
    if (isDirty()) {
      return new Promise((resolve) => {
        showConfirmModal(
          tr("control.confirm.reloadDirty"),
          () => loadState().then(resolve).catch(resolve)
        );
      });
    }
    await loadState();
  }

  function onRealtimeState(payload) {
    if (!payload || payload.ok === false) {
      if (payload?.unauthorized) {
        controlRole = "UNAUTHORIZED";
        isRealtimeConnected = false;
        wsRoomReady = false;
        renderConnectionStatus();
        renderPresenter();
      }
      console.error("[overlay-control] overlayState error", payload);
      setStatus(payload?.message || "Не удалось подписаться на overlayState", true);
      return;
    }
    if (payload.role) {
      controlRole = String(payload.role).toUpperCase();
      renderConnectionStatus();
    }
    if (typeof payload.presenterModeEnabled === "boolean") {
      presenterModeFromState = payload.presenterModeEnabled;
      renderPresenter();
    }
    if (isRecord(payload.presenter)) {
      presenterState = payload.presenter;
      renderPresenter();
    }
    if (!payload.state) return;
    setLatestOverlayState(payload.state);
    updatePlayersFromRealtime(payload.state.players);
    deriveCategoryDefs();
    renderPlayerSelect();
    renderPlayersList();
    renderTopEditor();
    renderBackgroundPresetEditor();
    renderOverlayUrlPresets();
    renderPlayerEditor();
  }

  function connectRealtime() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    wsSocket = socket;
    socket.addEventListener("open", () => {
      const tabId = getOrCreateScopedId(TAB_ID_KEY, "overlay-tab");
      const sessionId = getOrCreateScopedId(SESSION_ID_KEY, "overlay-session");
      reconnectAttempt = 0;
      isRealtimeConnected = true;
      wsRoomReady = false;
      renderConnectionStatus();
      renderPresenter();
      setStatus(tr("control.status.connectingRoom"));
      console.log("[overlay-control] ws open", { roomCode, tokenPresent: Boolean(token) });
      console.log("[overlay-control] send hello", {
        roomCode,
        tabIdPresent: Boolean(tabId),
        sessionIdPresent: Boolean(sessionId),
        tokenMasked: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : null,
      });
      socket.send(
        JSON.stringify({
          type: "hello",
          payload: {
            name: "CONTROL",
            roomCode,
            playerToken: token,
            tabId,
            sessionId,
          },
        })
      );
    });
    socket.addEventListener("message", (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!parsed?.type) return;
      console.log("[overlay-control] ws message", parsed.type);
      if (parsed.type === "helloAck") {
        wsPlayerId = String(parsed.payload?.playerId || "");
        console.log("[overlay-control] helloAck", {
          playerId: wsPlayerId,
          tokenMasked: String(parsed.payload?.playerToken || "").slice(0, 4) + "…",
        });
        socket.send(JSON.stringify({ type: "overlaySubscribe", payload: { roomCode, token } }));
        return;
      }
      if (parsed.type === "roomState") {
        applyRoomStateSnapshot(parsed.payload);
        setStatus(tr("control.status.connected"));
        return;
      }
      if (parsed.type === "statePatch") {
        if (isRecord(parsed.payload?.roomState)) {
          latestRoomState = mergeTopLevel(latestRoomState, parsed.payload.roomState);
          applyRoomStateSnapshot(latestRoomState);
        }
        if (isRecord(parsed.payload?.gameView)) {
          latestGameView = mergeTopLevel(latestGameView, parsed.payload.gameView);
        }
        return;
      }
      if (parsed.type === "gameView") {
        latestGameView = parsed.payload;
        return;
      }
      if (parsed.type === "error") {
        const message = String(parsed.payload?.message || tr("control.status.errorFallback"));
        setStatus(message, true);
        return;
      }
      if (parsed.type === "overlayState") onRealtimeState(parsed.payload);
    });
    socket.addEventListener("close", () => {
      isRealtimeConnected = false;
      wsRoomReady = false;
      wsSocket = null;
      renderConnectionStatus();
      renderPresenter();
      setStatus(tr("control.status.connectionLost"), true);
      if (reconnectTimer) return;
      reconnectAttempt += 1;
      const delay = Math.min(500 * 2 ** (reconnectAttempt - 1), 10000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectRealtime();
      }, delay);
    });
    socket.addEventListener("error", () => {
      isRealtimeConnected = false;
      wsRoomReady = false;
      renderConnectionStatus();
      renderPresenter();
      console.error("[overlay-control] ws error");
      try {
        socket.close();
      } catch {
        // ignore
      }
    });
  }

  controlLocaleSelect.value = controlLang;
  controlLocaleSelect.addEventListener("change", () => {
    controlLang = normalizeLocale(controlLocaleSelect.value || "ru");
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, controlLang);
    } catch {
      // ignore storage errors
    }
    applyControlLocale({ refreshUi: true });
  });

  playerSelect.addEventListener("change", (event) => {
    const nextPlayerId = String(event.target.value || "");
    if (!nextPlayerId) return;
    if (nextPlayerId !== selectedPlayerId && isDirty()) {
      showConfirmModal(
        tr("control.confirm.switchPlayerDirty"),
        () => {
          selectedPlayerId = nextPlayerId;
          renderPlayerSelect();
          renderPlayersList();
          renderPresenter();
          renderPlayerEditor();
        }
      );
      playerSelect.value = selectedPlayerId;
      return;
    }
    selectedPlayerId = nextPlayerId;
    renderPlayerSelect();
    renderPlayersList();
    renderPresenter();
    renderPlayerEditor();
  });

  playersList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-player-id]");
    if (!button) return;
    const nextPlayerId = String(button.dataset.playerId || "");
    if (!nextPlayerId) return;
    if (nextPlayerId !== selectedPlayerId && isDirty()) {
      showConfirmModal(
        tr("control.confirm.switchPlayerDirty"),
        () => {
          selectedPlayerId = nextPlayerId;
          renderPlayerSelect();
          renderPlayersList();
          renderPresenter();
          renderPlayerEditor();
        }
      );
      return;
    }
    selectedPlayerId = nextPlayerId;
    renderPlayerSelect();
    renderPlayersList();
    renderPresenter();
    renderPlayerEditor();
  });

  // Confirm Modal helpers
  let confirmCallback = null;

  function showConfirmModal(message, callback) {
    confirmModalMessage.textContent = message;
    confirmModal.hidden = false;
    confirmCallback = callback;
  }

  function hideConfirmModal() {
    confirmModal.hidden = true;
    confirmCallback = null;
  }

  confirmModalCancel.addEventListener("click", () => {
    hideConfirmModal();
  });

  confirmModalConfirm.addEventListener("click", () => {
    hideConfirmModal();
    if (typeof confirmCallback === "function") {
      confirmCallback();
    }
  });

  saveBtn.addEventListener("click", () => {
    saveState().catch((error) =>
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.save"),
        true
      )
    );
  });

  gameControlTabBtn.addEventListener("click", () => switchControlTab("game"));
  obsControlTabBtn.addEventListener("click", () => switchControlTab("obs"));

  reloadBtn.addEventListener("click", () => {
    reloadStateWithConfirm().catch((error) =>
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.load"),
        true
      )
    );
  });

  presenterKickPlayerBtn.addEventListener("click", () => {
    const player = getSelectedPlayer();
    if (!player) {
      setStatus(tr("control.error.selectPlayerFirst"), true);
      return;
    }
    sendControlAction("KICK_PLAYER", { targetPlayerId: player.playerId }).catch((error) =>
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.command"),
        true
      )
    );
  });

  replaceTargetPlayerSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  replaceCardSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  replaceModeSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  replaceExecuteBtn.addEventListener("click", () => {
    const targetPlayerId = String(replaceTargetPlayerSelect.value || "").trim();
    const selectedRaw = String(replaceCardSelect.value || "").trim();
    const splitIndex = selectedRaw.indexOf(":");
    const targetArea =
      splitIndex > 0 ? String(selectedRaw.slice(0, splitIndex)).trim().toLowerCase() : "hand";
    const cardInstanceId =
      splitIndex > 0 ? String(selectedRaw.slice(splitIndex + 1)).trim() : selectedRaw;
    const replacementMode = String(replaceModeSelect.value || "random").trim().toLowerCase() === "specific" ? "specific" : "random";
    const replacementCardId = String(replaceSpecificCardSelect.value || "").trim();
    if (!targetPlayerId || !cardInstanceId) {
      setStatus(
        tr("control.error.replaceNeedPlayerCard"),
        true
      );
      return;
    }
    const payload = {
      targetPlayerId,
      cardInstanceId,
      targetArea: targetArea === "special" ? "special" : "hand",
      replacementMode,
      replacementCardId: replacementMode === "specific" ? replacementCardId || undefined : undefined,
    };
    sendScenarioActionAsHost("adminReplacePlayerCard", payload)
      tr("control.success.playerCardReplaced", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.replaceCard"),
          true
        )
      );
  });

  voteStartGameBtn.addEventListener("click", () => {
    sendControlAction("START_GAME").catch((error) =>
      tr("control.error.command", {})
    );
  });
  voteNextStepBtn.addEventListener("click", () => {
    sendControlAction("NEXT_STEP").catch((error) =>
      tr("control.error.command", {})
    );
  });
  voteSkipStepBtn.addEventListener("click", () => {
    sendControlAction("SKIP_STEP").catch((error) =>
      tr("control.error.command", {})
    );
  });
  voteStartBtn.addEventListener("click", () => {
    sendControlAction("START_VOTE").catch((error) =>
      tr("control.error.command", {})
    );
  });
  voteEndBtn.addEventListener("click", () => {
    sendControlAction("END_VOTE").catch((error) =>
      tr("control.error.command", {})
    );
  });
  voteSkipRoundBtn.addEventListener("click", () => {
    sendControlAction("SKIP_ROUND").catch((error) =>
      tr("control.error.command", {})
    );
  });
  voteOutcomeSurvivedBtn.addEventListener("click", () => {
    sendControlAction("SET_OUTCOME_SURVIVED").catch((error) =>
      tr("control.error.command", {})
    );
  });
  voteOutcomeFailedBtn.addEventListener("click", () => {
    sendControlAction("SET_OUTCOME_FAILED").catch((error) =>
      tr("control.error.command", {})
    );
  });
  hostTransferBtn.addEventListener("click", () => {
    const targetPlayerId = String(hostTransferTargetSelect.value || "").trim();
    if (!targetPlayerId) {
      setStatus(
        tr("control.error.transferNeedTarget"),
        true
      );
      return;
    }
    sendControlAction("TRANSFER_HOST", { targetPlayerId }).catch((error) =>
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.transferHost"),
        true
      )
    );
  });

  worldKindSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  worldIndexSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  worldReplaceModeSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  worldToggleRevealBtn.addEventListener("click", () => {
    const kind = String(worldKindSelect.value || "").trim().toLowerCase();
    if (kind !== "bunker" && kind !== "threat") {
      setStatus(
        tr(
          "control.error.worldToggleKind",
          {},
          "Раскрытие/скрытие доступно только для bunker/threat."
        ),
        true
      );
      return;
    }
    const index = Number(worldIndexSelect.value);
    if (!Number.isInteger(index) || index < 0) {
      setStatus(
        tr("control.error.worldNeedIndex"),
        true
      );
      return;
    }
    const world = getPresenterControlWorld();
    const list = kind === "bunker" ? world?.bunker : world?.threats;
    const card = Array.isArray(list) ? list.find((entry) => Number(entry.index) === index) : null;
    const revealed = !Boolean(card?.isRevealed);
    sendScenarioActionAsHost("adminSetWorldCardReveal", { kind, index, revealed })
      tr("control.success.worldStateUpdated", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.worldUpdate"),
          true
        )
      );
  });
  worldReplaceBtn.addEventListener("click", () => {
    const kind = String(worldKindSelect.value || "").trim().toLowerCase();
    if (kind !== "bunker" && kind !== "threat" && kind !== "disaster") {
      setStatus(tr("control.error.worldKind"), true);
      return;
    }
    const replacementMode = String(worldReplaceModeSelect.value || "random").trim().toLowerCase() === "specific" ? "specific" : "random";
    const payload = {
      kind,
      index: kind === "disaster" ? undefined : Number(worldIndexSelect.value),
      replacementMode,
      replacementCardId: replacementMode === "specific" ? String(worldReplaceCardSelect.value || "").trim() || undefined : undefined,
    };
    sendScenarioActionAsHost("adminReplaceWorldCard", payload)
      tr("control.success.worldReplaced", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.worldReplace"),
          true
        )
      );
  });
  worldSetCountBtn.addEventListener("click", () => {
    const kind = String(worldKindSelect.value || "").trim().toLowerCase();
    if (kind !== "bunker" && kind !== "threat") {
      setStatus(
        tr(
          "control.error.worldCountKind",
          {},
          "Количество можно менять только для bunker/threat."
        ),
        true
      );
      return;
    }
    const count = Number(worldCountInput.value);
    if (!Number.isInteger(count) || count < 0) {
      setStatus(
        tr("control.error.worldCountValue"),
        true
      );
      return;
    }
    sendScenarioActionAsHost("adminSetWorldCount", { kind, count })
      tr("control.success.worldCountUpdated", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.worldCountUpdate"),
          true
        )
      );
  });

  specialActorPlayerSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  specialSourceModeSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  specialPickerSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  specialTargetPlayerSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  specialApplyBtn.addEventListener("click", () => {
    const mode = String(specialSourceModeSelect.value || "owned");
    const hostId = String(presenterState?.hostId || "").trim();
    const actorPlayerId =
      mode === "catalog"
        ? String(hostId || specialActorPlayerSelect.value || "").trim()
        : String(specialActorPlayerSelect.value || "").trim();
    if (!actorPlayerId) {
      setStatus(
        tr("control.error.specialNeedActor"),
        true
      );
      return;
    }
    const specialValue = String(specialPickerSelect.value || "").trim();
    if (!specialValue) {
      setStatus(tr("control.error.specialNeedCard"), true);
      return;
    }
    const pickedEntry = specialCatalogCache.find(
      (entry) => entry.mode === mode && String(entry.value) === specialValue
    );
    const requirements = getSpecialFieldRequirements(pickedEntry);
    const payload = {};
    if (requirements.needTargetPlayer) {
      const targetPlayerId = String(specialTargetPlayerSelect.value || "").trim();
      if (targetPlayerId) payload.targetPlayerId = targetPlayerId;
    }
    if (requirements.needBaggageCard) {
      const baggageCardId = String(specialTargetCardSelect.value || "").trim();
      if (baggageCardId) payload.baggageCardId = baggageCardId;
    }
    if (requirements.needBunkerIndex) {
      const bunkerIndex = Number(specialThreatIndexSelect.value);
      if (Number.isInteger(bunkerIndex) && bunkerIndex >= 0) payload.bunkerIndex = bunkerIndex;
    }
    if (requirements.needCategory) {
      const category = String(specialCategorySelect.value || "").trim();
      if (category) payload.category = category;
    }
    if (requirements.needUseSelf) {
      const useSelfValue = String(specialUseSelfSelect.value || "").trim();
      if (useSelfValue === "true") payload.useSelf = true;
      if (useSelfValue === "false") payload.useSelf = false;
    }

    const scenarioPayload =
      mode === "owned"
        ? {
            actorPlayerId,
            specialInstanceId: specialValue,
            payload,
          }
        : {
            actorPlayerId,
            specialId: specialValue,
            payload,
          };
    sendScenarioActionAsHost("adminApplySpecial", scenarioPayload)
      .then(() =>
        setStatus(
          mode === "catalog"
            ? tr(
                "control.success.specialAppliedCatalog",
                {},
                "Спецусловие из каталога применено от лица ведущего."
              )
            : tr(
                "control.success.specialAppliedOwned",
                {},
                "Спецусловие игрока применено ведущим."
              )
        )
      )
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.specialApply"),
          true
        )
      );
  });

  devTargetPlayerSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  devAddBotBtn.addEventListener("click", () => {
    const name = String(devBotNameInput.value || "").trim();
    sendScenarioActionAsHost("devAddPlayer", name ? { name } : {})
      tr("control.success.devBotAdded", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.devBotAdd"),
          true
        )
      );
  });
  devRemoveBotBtn.addEventListener("click", () => {
    const targetPlayerId = String(devTargetPlayerSelect.value || "").trim();
    if (!targetPlayerId) {
      setStatus(tr("control.error.devNeedRemoveTarget"), true);
      return;
    }
    sendControlAction("KICK_PLAYER", { targetPlayerId })
      tr("control.success.devRemoved", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.devRemove"),
          true
        )
      );
  });
  devKickBtn.addEventListener("click", () => {
    const targetPlayerId = String(devTargetPlayerSelect.value || "").trim();
    if (!targetPlayerId) {
      setStatus(
        tr("control.error.devNeedKickTarget"),
        true
      );
      return;
    }
    sendControlAction("KICK_PLAYER", { targetPlayerId })
      tr("control.success.devKicked", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.devKick"),
          true
        )
      );
  });
  devMarkLeftBtn.addEventListener("click", () => {
    const targetPlayerId = String(devTargetPlayerSelect.value || "").trim();
    if (!targetPlayerId) {
      setStatus(
        tr(
          "control.error.devNeedMarkLeftTarget",
          {},
          "Выбери игрока для перевода вне бункера."
        ),
        true
      );
      return;
    }
    sendScenarioActionAsHost("markLeftBunker", { targetPlayerId })
      tr("control.success.devMarkedLeft", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.devMarkLeft"),
          true
        )
      );
  });
  devSkipRoundBtn.addEventListener("click", () => {
    sendScenarioActionAsHost("devSkipRound", {})
      tr("control.success.devSkipRound", {})
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : tr("control.error.devCommand"),
          true
        )
      );
  });

  controlActorSelect.addEventListener("change", () => {
    controlActorPlayerId = String(controlActorSelect.value || "");
    renderScenarioActionEditor();
  });
  controlScenarioAction.addEventListener("change", () => {
    renderScenarioActionEditor();
  });
  controlTargetSelect.addEventListener("change", () => {
    renderScenarioActionEditor();
  });
  controlCardSelect.addEventListener("change", () => {
    renderScenarioActionEditor();
  });
  controlSpecialSelect.addEventListener("change", () => {
    renderScenarioActionEditor();
  });
  controlThreatIndex.addEventListener("change", () => {
    renderScenarioActionEditor();
  });
  controlOutcomeSelect.addEventListener("change", () => {
    renderScenarioActionEditor();
  });
  controlQuickActions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action-type]");
    if (!button) return;
    const actionType = String(button.dataset.actionType || "").trim();
    if (!actionType) return;
    controlScenarioAction.value = actionType;
    renderScenarioActionEditor();
  });
  controlCardPicker.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-card-id]");
    if (!button) return;
    const cardId = String(button.dataset.cardId || "").trim();
    if (!cardId) return;
    controlCardSelect.value = cardId;
    renderScenarioActionEditor();
  });
  controlSpecialPicker.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-special-id]");
    if (!button) return;
    const specialId = String(button.dataset.specialId || "").trim();
    if (!specialId) return;
    controlSpecialSelect.value = specialId;
    renderScenarioActionEditor();
  });
  controlThreatPicker.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-threat-index]");
    if (!button) return;
    const threatIndex = String(button.dataset.threatIndex || "").trim();
    if (!threatIndex) return;
    controlThreatIndex.value = threatIndex;
    renderScenarioActionEditor();
  });

  controlExecuteBtn.addEventListener("click", () => {
    let request;
    try {
      request = buildScenarioControlRequest();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.invalidParams"),
        true
      );
      return;
    }
    sendControlAction("SCENARIO_ACTION", request).catch((error) =>
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.scenarioAction"),
        true
      )
    );
  });

  resetPlayerBtn.addEventListener("click", () => {
    const player = getSelectedPlayer();
    if (!player) return;
    const playerName = player.name || player.nickname || player.playerId;
    showConfirmModal(
      tr("control.confirm.resetPlayer", { player: playerName }),
      () => {
        ensureDraftShape();
        delete draftOverrides.players[player.playerId];
        renderPlayerEditor();
        syncDirtyBadge();
        setStatus(tr("control.success.playerResetLocal"));
      }
    );
  });

  const topInputChanged = () => {
    applyTopInputsToDraft();
    syncDirtyBadge();
  };
  topBunkerLines.addEventListener("input", topInputChanged);
  topCatastropheText.addEventListener("input", topInputChanged);
  topThreatsLines.addEventListener("input", topInputChanged);
  enabledTopBunker.addEventListener("change", topInputChanged);
  enabledTopCatastrophe.addEventListener("change", topInputChanged);
  enabledTopThreats.addEventListener("change", topInputChanged);
  backgroundPresetSelect.addEventListener("change", () => {
    applyBackgroundPresetInputToDraft();
    syncOverlayTemplateFromDraftParams();
    applyOverlayUrlPresetTemplateToDraft();
    renderBackgroundPresetEditor();
    renderOverlayUrlPresets();
    syncDirtyBadge();
  });
  overlayUrlPresetButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset-id]");
    if (!button) return;
    selectedOverlayUrlPresetId = normalizeBackgroundPresetId(button.dataset.presetId || "");
    const preset = overlayUrlPresets.find((item) => item.id === selectedOverlayUrlPresetId) || null;
    if (preset) {
      overlayUrlPresetTemplate.value = preset.urlTemplate;
    }
    applyOverlayUrlPresetTemplateToDraft();
    renderOverlayUrlPresets();
    syncDirtyBadge();
  });
  overlayUrlPresetTemplate.addEventListener("input", () => {
    applyOverlayUrlPresetTemplateToDraft();
    renderOverlayUrlPresets();
    syncDirtyBadge();
  });
  const onUrlParamInputChanged = () => {
    applyOverlayUrlParamInputsToDraft();
    syncOverlayTemplateFromDraftParams();
    applyOverlayUrlPresetTemplateToDraft();
    renderOverlayUrlPresets();
    syncDirtyBadge();
  };
  urlParamLang.addEventListener("change", onUrlParamInputChanged);
  urlParamTheme.addEventListener("change", onUrlParamInputChanged);
  urlParamScale.addEventListener("change", onUrlParamInputChanged);
  urlParamTop.addEventListener("change", onUrlParamInputChanged);
  urlParamTopBunkerAlign.addEventListener("change", onUrlParamInputChanged);
  urlParamTopCatastropheAlign.addEventListener("change", onUrlParamInputChanged);
  urlParamTopThreatsAlign.addEventListener("change", onUrlParamInputChanged);
  urlParamTopBunkerScale.addEventListener("change", onUrlParamInputChanged);
  urlParamTopCatastropheScale.addEventListener("change", onUrlParamInputChanged);
  urlParamTopThreatsScale.addEventListener("change", onUrlParamInputChanged);
  urlParamDebug.addEventListener("change", onUrlParamInputChanged);
  overlayUrlPresetOpenBtn.addEventListener("click", () => {
    const url = String(overlayUrlPresetValue.value || "").trim();
    if (!url) {
      setStatus(tr("control.error.selectUrlPresetFirst"), true);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  });
  overlayUrlPresetCopyBtn.addEventListener("click", async () => {
    const url = String(overlayUrlPresetValue.value || "").trim();
    if (!url) {
      setStatus(tr("control.error.selectUrlPresetFirst"), true);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus(tr("control.status.copyUrlOk"));
    } catch {
      overlayUrlPresetValue.focus();
      overlayUrlPresetValue.select();
      setStatus(
        tr(
          "control.status.copyUrlFail",
          {},
          "Не удалось скопировать автоматически. URL выделен для копирования."
        ),
        true
      );
    }
  });

  playerNameInput.addEventListener("input", () => setSelectedPlayerField("name", playerNameInput.value));
  traitSexInput.addEventListener("input", () => setSelectedPlayerField("sex", traitSexInput.value));
  traitAgeInput.addEventListener("input", () => setSelectedPlayerField("age", traitAgeInput.value));
  traitOrientInput.addEventListener("input", () => setSelectedPlayerField("orient", traitOrientInput.value));
  playerEnabledName.addEventListener("change", () => setSelectedToggle("name", playerEnabledName.checked));
  playerEnabledTraits.addEventListener("change", () => setSelectedToggle("traits", playerEnabledTraits.checked));

  playerEnabledCategories.addEventListener("change", () => {
    const player = getSelectedPlayer();
    if (!player) return;
    const entry = getPlayerDraft(player.playerId, true);
    if (!entry) return;
    if (!isRecord(entry.enabled)) entry.enabled = {};
    if (playerEnabledCategories.checked) delete entry.enabled.categories;
    else {
      const flags = {};
      for (const category of categoryDefs) flags[category.key] = false;
      entry.enabled.categories = flags;
    }
    if (Object.keys(entry.enabled).length === 0) delete entry.enabled;
    renderPlayerEditor();
    syncDirtyBadge();
  });

  categoriesGrid.addEventListener("input", (event) => {
    const input = event.target;
    if (!input || input.dataset.action !== "category-input") return;
    setSelectedCategoryValue(String(input.dataset.categoryKey || ""), String(input.value || ""));
  });
  categoriesGrid.addEventListener("change", (event) => {
    const toggle = event.target;
    if (!toggle || toggle.dataset.action !== "category-toggle") return;
    setSelectedCategoryEnabled(String(toggle.dataset.categoryKey || ""), Boolean(toggle.checked));
  });
  categoriesGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const categoryKey = String(button.dataset.categoryKey || "");
    if (!categoryKey) return;
    if (button.dataset.action === "category-clear") {
      setSelectedCategoryValue(categoryKey, "");
      renderPlayerEditor();
      return;
    }
    if (button.dataset.action === "category-random") {
      const value = getRandomCategoryValue(categoryKey);
      if (!value) {
        setStatus(
          tr(
            "control.error.categoryRandomNoData",
            { category: categoryKey },
            `Нет данных для случайного выбора в категории \"${categoryKey}\"`
          ),
          true
        );
        return;
      }
      setSelectedCategoryValue(categoryKey, value);
      renderPlayerEditor();
    }
  });

  insertCategoriesTemplateBtn.addEventListener("click", () => {
    const template = {};
    for (const category of categoryDefs) template[category.key] = "";
    playerCategoriesJson.value = JSON.stringify(template, null, 2);
    setStatus(tr("control.success.categoriesTemplateInserted"));
  });

  applyCategoriesJsonBtn.addEventListener("click", () => {
    const player = getSelectedPlayer();
    if (!player) return;
    let result;
    try {
      result = parseCategoriesJson(playerCategoriesJson.value || "{}");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.categoriesJson"),
        true
      );
      return;
    }
    const entry = getPlayerDraft(player.playerId, true);
    if (!entry) return;
    if (Object.keys(result.categories).length > 0) entry.categories = result.categories;
    else delete entry.categories;
    renderPlayerEditor();
    syncDirtyBadge();
    if (result.unknownKeys.length) {
      setStatus(
        tr(
          "control.warning.categoriesUnknownKeys",
          {
            unknown: result.unknownKeys.join(", "),
            allowed: result.allowedKeys.join(", "),
          },
          `categories JSON: неизвестные ключи проигнорированы (${result.unknownKeys.join(", ")}). Разрешённые: ${result.allowedKeys.join(", ")}`
        ),
        false
      );
      return;
    }
    setStatus(tr("control.success.categoriesApplied"));
  });

  addExtraTextBtn.addEventListener("click", () => {
    ensureDraftShape();
    const current = getDraftExtraTexts();
    const next = [...current, { id: `text-${current.length + 1}`, text: "Новый текст", x: 0.5, y: 0.5, align: "center", size: 20, color: "", shadow: true, visible: true }];
    setDraftExtraTexts(next);
    renderExtraTextsEditor();
    syncDirtyBadge();
  });

  extraTextsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='extra-remove']");
    if (!button) return;
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index)) return;
    setDraftExtraTexts(getDraftExtraTexts().filter((_, idx) => idx !== index));
    renderExtraTextsEditor();
    syncDirtyBadge();
  });

  extraTextsList.addEventListener("input", (event) => {
    const target = event.target;
    if (!target || target.dataset.action !== "extra-field") return;
    const index = Number(target.dataset.index);
    const field = String(target.dataset.field || "");
    if (!Number.isInteger(index) || !field) return;
    const current = [...getDraftExtraTexts()];
    const item = isRecord(current[index]) ? { ...current[index] } : null;
    if (!item) return;
    if (field === "id") item.id = sanitizeLine(target.value, 64) || `text-${index + 1}`;
    if (field === "text") item.text = sanitizeLine(target.value, MAX_LINE_LEN);
    if (field === "x") item.x = clamp(Number(target.value), 0, 1);
    if (field === "y") item.y = clamp(Number(target.value), 0, 1);
    if (field === "align") item.align = target.value === "left" || target.value === "center" || target.value === "right" ? target.value : "center";
    if (field === "size") item.size = clamp(Number(target.value), 8, 96);
    if (field === "color") item.color = sanitizeLine(target.value, 32);
    current[index] = item;
    setDraftExtraTexts(current);
    syncExtraTextsJson();
    syncDirtyBadge();
  });

  extraTextsList.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || target.dataset.action !== "extra-field") return;
    const index = Number(target.dataset.index);
    const field = String(target.dataset.field || "");
    if (!Number.isInteger(index) || !field) return;
    const current = [...getDraftExtraTexts()];
    const item = isRecord(current[index]) ? { ...current[index] } : null;
    if (!item) return;
    if (field === "visible") item.visible = Boolean(target.checked);
    if (field === "shadow") item.shadow = Boolean(target.checked);
    current[index] = item;
    setDraftExtraTexts(current);
    syncExtraTextsJson();
    syncDirtyBadge();
  });

  syncExtraTextsJsonBtn.addEventListener("click", () => {
    syncExtraTextsJson(true);
    setStatus(tr("control.success.extraTextsSynced"));
  });
  applyExtraTextsJsonBtn.addEventListener("click", () => {
    let parsed;
    try {
      parsed = parseExtraTextsJson(extraTextsJson.value.trim() || "[]");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.extraTextsJson"),
        true
      );
      return;
    }
    setDraftExtraTexts(parsed);
    renderExtraTextsEditor();
    syncDirtyBadge();
    setStatus(tr("control.success.extraTextsApplied"));
  });
  extraTextsJson.addEventListener("input", () => syncDirtyBadge());

  window.addEventListener("beforeunload", (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  applyControlLocale({ refreshUi: false });
  setStatus(tr("control.status.connectingRoom"));
  switchControlTab("game");
  loadState()
    .then(() => connectRealtime())
    .catch((error) => {
      setStatus(
        error instanceof Error
          ? error.message
          : tr("control.error.load"),
        true
      );
      connectRealtime();
    });
})();


