(() => {
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

    let roomCode = getFirst(["room", "roomCode", "roomId", "code", "r"]).toUpperCase();
    let token = getFirst(["token", "control", "controlToken", "editToken", "t"]);

    const path = window.location.pathname || "";
    const pathParts = path.split("/").filter(Boolean);
    const overlayIndex = pathParts.findIndex((part) => part.toLowerCase() === "overlay-control");
    if (overlayIndex >= 0) {
      if (!roomCode && pathParts[overlayIndex + 1]) {
        roomCode = String(pathParts[overlayIndex + 1]).trim().toUpperCase();
      }
      if (!token && pathParts[overlayIndex + 2]) {
        token = String(pathParts[overlayIndex + 2]).trim();
      }
    }

    return { roomCode, token };
  }

  const parsedParams = parseOverlayControlParams();
  const roomCode = parsedParams.roomCode;
  const token = parsedParams.token;
  const TAB_ID_KEY = "bunker.dev_tab_id";
  const SESSION_ID_KEY = "bunker.sessionId";

  const $ = (id) => document.getElementById(id);
  const roomLabel = $("roomLabel");
  const controlConnection = $("controlConnection");
  const urlParamsDebug = $("urlParamsDebug");
  const statusEl = $("status");
  const dirtyBadge = $("dirtyBadge");
  const saveBtn = $("saveBtn");
  const reloadBtn = $("reloadBtn");
  const resetPlayerBtn = $("resetPlayerBtn");

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
    !roomLabel || !controlConnection || !urlParamsDebug || !statusEl || !dirtyBadge || !saveBtn || !reloadBtn || !resetPlayerBtn ||
    !playerSelect || !playersList || !sidebarPlayerActions || !kickSelectedLabel || !playerEditorTitle || !categoriesGrid || !categoriesAllowedKeys ||
    !playerCategoriesJson || !insertCategoriesTemplateBtn || !applyCategoriesJsonBtn ||
    !topCurrentBunker || !topCurrentCatastrophe || !topCurrentThreats || !topBaseCatastrophe || !topCatastropheSource || !topBunkerLines ||
    !topCatastropheText || !topThreatsLines || !topBunkerMeta || !topCatastropheMeta || !topThreatsMeta ||
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
    console.error("[overlay-control] missing room/token in URL", {
      roomCodeFromUrl: roomCode || null,
      tokenPresent: Boolean(token),
    });
    urlParamsDebug.textContent = `roomCodeFromUrl: ${roomCode || "-"} • tokenPresent: ${token ? "yes" : "no"}`;
    controlConnection.textContent = `Подключено: нет • Роль: - • Комната: ${roomCode || "-"}`;
    setStatus("Нет roomCode/token в ссылке.", true);
    return;
  }

  urlParamsDebug.textContent = `roomCodeFromUrl: ${roomCode} • tokenPresent: yes`;
  roomLabel.textContent = `Комната: ${roomCode}`;
  console.log("[overlay-control] parsed URL params", {
    roomCodeFromUrl: roomCode,
    tokenPresent: Boolean(token),
  });

  const MAX_LINE_LEN = 120;
  const MAX_CATA_LEN = 600;
  const MAX_NAME_LEN = 24;
  const MAX_BUNKER_LINES = 5;
  const MAX_THREAT_LINES = 6;

  const DEFAULT_CATEGORIES = [
    { key: "profession", label: "Профессия" },
    { key: "health", label: "Здоровье" },
    { key: "hobby", label: "Хобби" },
    { key: "phobia", label: "Фобия" },
    { key: "baggage", label: "Багаж" },
    { key: "fact1", label: "Факт №1" },
    { key: "fact2", label: "Факт №2" },
    { key: "biology", label: "Биология" },
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

  const CONTROL_ACTION_META = {
    revealCard: {
      title: "Раскрыть карту",
      hint: "Выбери игрока и карту из его досье.",
      guide: "Используй для ручного контроля раскрытий вместо хода игрока.",
    },
    applySpecial: {
      title: "Применить спецусловие",
      hint: "Выбери спецусловие игрока и, при необходимости, цель.",
      guide: "Для сложных спецкарт можно дописать payload JSON в Advanced.",
    },
    vote: {
      title: "Проголосовать",
      hint: "Игрок-исполнитель голосует в выбранную цель.",
      guide: "Работает только в активной фазе голосования.",
    },
    continueRound: {
      title: "Следующий шаг",
      hint: "Эквивалент continueRound от имени игрока.",
      guide: "Переход между шагами раунда без кликов в основной UI.",
    },
    finalizeVoting: {
      title: "Завершить голосование",
      hint: "Принудительно закрывает окно голосования.",
      guide: "Выполняется от ведущего.",
    },
    revealWorldThreat: {
      title: "Раскрыть угрозу",
      hint: "Выбери индекс угрозы мира.",
      guide: "Удобно для ручного режима и стрим-контроля.",
    },
    setBunkerOutcome: {
      title: "Итог бункера",
      hint: "Выбери исход пост-игры.",
      guide: "Используется в фазе финального исхода.",
    },
    markLeftBunker: {
      title: "Во вне бункера",
      hint: "Переводит выбранного игрока в статус left_bunker.",
      guide: "Полезно для ручной модерации стола.",
    },
    devKickPlayer: {
      title: "DEV: выгнать игрока",
      hint: "DEV-команда исключения игрока.",
      guide: "Только для тестов и отладки сценариев.",
    },
    devSkipRound: {
      title: "DEV: пропустить раунд",
      hint: "Быстрый пропуск раунда.",
      guide: "Только для тестов.",
    },
    devAddPlayer: {
      title: "DEV: добавить бота",
      hint: "Добавляет бота в текущую комнату.",
      guide: "Имя можно задать ниже.",
    },
    devRemovePlayer: {
      title: "DEV: удалить бота",
      hint: "Удаляет выбранного бота/игрока (DEV).",
      guide: "Только для тестовых сценариев.",
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
    const map = {
      lobby: "Лобби",
      game: "Игра",
    };
    const key = String(value ?? "").trim();
    return map[key] || key || "-";
  }

  function formatGamePhase(value, presenter = null) {
    const map = {
      reveal: "Раскрытие",
      voting: "Голосование",
      resolution: "Итоги",
      ended: "Завершено",
    };
    const key = String(value ?? "").trim();
    if (key === "reveal_discussion") {
      const turnPlayerId = isRecord(presenter) ? String(presenter.currentTurnPlayerId ?? "") : "";
      const listedPlayers = isRecord(presenter) && Array.isArray(presenter.players) ? presenter.players : [];
      const discussionPlayer = listedPlayers.find((player) => player && player.playerId === turnPlayerId);
      const shortName = formatPlayerNameShort(discussionPlayer?.name || "");
      return shortName
        ? `Обсуждение карты игрока ${shortName}`
        : "Обсуждение карты игрока";
    }
    return map[key] || key || "-";
  }

  function formatVotePhase(value) {
    const map = {
      voting: "Сбор голосов",
      voteSpecialWindow: "Окно спецусловий",
      voteResolve: "Подведение итогов",
    };
    const key = String(value ?? "").trim();
    return map[key] || key || "-";
  }

  function formatPlayerStatus(value) {
    const map = {
      alive: "В игре",
      eliminated: "Изгнан",
      left_bunker: "Вне бункера",
    };
    const key = String(value ?? "").trim();
    return map[key] || key || "-";
  }

  function commandLabel(action) {
    const map = {
      START_GAME: "Начать игру",
      NEXT_STEP: "Следующий шаг",
      SKIP_STEP: "Пропустить шаг",
      START_VOTE: "Начать голосование",
      END_VOTE: "Завершить голосование",
      SET_OUTCOME_SURVIVED: "Выжил в бункере",
      SET_OUTCOME_FAILED: "Не выжил",
      SKIP_ROUND: "Пропустить раунд",
      KICK_PLAYER: "Выгнать игрока",
      SCENARIO_ACTION: "Сценарное действие",
    };
    return map[String(action)] || String(action || "команда");
  }

  function renderConnectionStatus() {
    const connectedText = isRealtimeConnected && wsRoomReady ? "да" : "нет";
    const roleText = controlRole || "-";
    controlConnection.textContent = `Подключено: ${connectedText} • Роль: ${roleText} • Комната: ${connectedRoomCode || roomCode || "-"}`;
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
    roomLabel.textContent = `Комната: ${connectedRoomCode}`;

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
      setStatus("Токен подключён, но роль не CONTROL.", true);
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
      dirtyBadge.textContent = "Есть несохраненные изменения";
      dirtyBadge.classList.add("is-dirty");
      return;
    }
    dirtyBadge.textContent = "Синхронизировано";
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
    return {
      bunker: bunker.length ? bunker : ["скрыто"],
      catastrophe: catastrophe || "скрыто",
      threats: threats.length ? threats : ["скрыто"],
    };
  }

  function getBaseTop() {
    const top = isRecord(latestOverlayState?.top) ? latestOverlayState.top : {};
    const catastrophe = typeof top.catastrophe?.text === "string" ? top.catastrophe.text : "";
    return {
      catastrophe: catastrophe || "скрыто",
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
    categoriesAllowedKeys.textContent = `Разрешённые ключи: ${categoryDefs.map((item) => item.key).join(", ") || "-"}`;
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
    kickSelectedLabel.textContent = `Выбран: ${selectedName}`;
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
      const aliveText = player.alive === false ? "вне бункера" : "в игре";
      const onlineText = player.connected === false ? "оффлайн" : "онлайн";
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

    topBunkerMeta.textContent = `${bunker.count}/${MAX_BUNKER_LINES} строк`;
    topThreatsMeta.textContent = `${threats.count}/${MAX_THREAT_LINES} строк`;
    topCatastropheMeta.textContent = `${cataRaw.length}/${MAX_CATA_LEN} символов`;

    topBunkerMeta.classList.toggle("error", bunker.tooMany || bunker.tooLong);
    topThreatsMeta.classList.toggle("error", threats.tooMany || threats.tooLong);
    topCatastropheMeta.classList.toggle("error", cataTooLong);

    const errors = [];
    if (bunker.tooMany) errors.push(`Бункер: максимум ${MAX_BUNKER_LINES} строк.`);
    if (bunker.tooLong) errors.push(`Бункер: максимум ${MAX_LINE_LEN} символов в строке.`);
    if (threats.tooMany) errors.push(`Угрозы: максимум ${MAX_THREAT_LINES} строк.`);
    if (threats.tooLong) errors.push(`Угрозы: максимум ${MAX_LINE_LEN} символов в строке.`);
    if (cataTooLong) errors.push(`Катастрофа: максимум ${MAX_CATA_LEN} символов.`);

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
      topCatastropheSource.textContent = "Сейчас используется: override из Overlay Control";
    } else {
      topCatastropheSource.textContent = "Сейчас используется: текст из данных катастрофы";
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
    return {
      name: hidden.name ? "(скрыто переключателем)" : String(current?.nickname || "-"),
      sex: hidden.traits ? "(скрыто переключателем)" : String(current?.tags?.sex?.value || "?"),
      age: hidden.traits ? "(скрыто переключателем)" : String(current?.tags?.age?.value || "?"),
      orient: hidden.traits ? "(скрыто переключателем)" : String(current?.tags?.orientation?.value || "?"),
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
      playerEditorTitle.textContent = "Игрок";
      playerNameInput.value = "";
      traitSexInput.value = "";
      traitAgeInput.value = "";
      traitOrientInput.value = "";
      currentPlayerName.textContent = "Сейчас в OBS: -";
      currentTraitSex.textContent = "Сейчас в OBS: -";
      currentTraitAge.textContent = "Сейчас в OBS: -";
      currentTraitOrient.textContent = "Сейчас в OBS: -";
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

    playerEditorTitle.textContent = `Игрок: ${player.name || player.nickname || player.playerId}`;
    playerNameInput.value = String(entry.name || "");
    playerNameInput.placeholder = current.name;
    traitSexInput.value = String(traits.sex || "");
    traitSexInput.placeholder = current.sex;
    traitAgeInput.value = String(traits.age || "");
    traitAgeInput.placeholder = current.age;
    traitOrientInput.value = String(traits.orient || "");
    traitOrientInput.placeholder = current.orient;

    currentPlayerName.textContent = `Сейчас в OBS: ${current.name}`;
    currentTraitSex.textContent = `Сейчас в OBS: ${current.sex}`;
    currentTraitAge.textContent = `Сейчас в OBS: ${current.age}`;
    currentTraitOrient.textContent = `Сейчас в OBS: ${current.orient}`;

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
      keyMeta.textContent = `Ключ: ${category.key}`;
      left.append(title, keyMeta);
      head.append(left);

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "field";
      toggleLabel.title = "Включает/выключает показ этой категории на overlay для выбранного игрока.";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.dataset.action = "category-toggle";
      toggle.dataset.categoryKey = category.key;
      toggle.checked = getCategoryEnabledFlag(enabledCategories, category.key);
      const toggleText = document.createElement("span");
      toggleText.textContent = "Показывать";
      toggleLabel.append(toggle, toggleText);
      head.append(toggleLabel);
      card.append(head);

      const currentCategory = getEffectiveCategory(player.playerId, category.key);
      const currentMeta = document.createElement("div");
      currentMeta.className = "meta";
      currentMeta.textContent = currentCategory.shown ? `Сейчас в OBS: ${currentCategory.value || "-"}` : "Сейчас в OBS: скрыто";
      card.append(currentMeta);

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = MAX_LINE_LEN;
      input.dataset.action = "category-input";
      input.dataset.categoryKey = category.key;
      input.value = isRecord(entry.categories) ? String(entry.categories[category.key] || "") : "";
      input.placeholder = currentCategory.value || "Текст категории";
      card.append(input);

      const actions = document.createElement("div");
      actions.className = "category-card__actions";
      const randomBtn = document.createElement("button");
      randomBtn.type = "button";
      randomBtn.className = "btn btn-small";
      randomBtn.dataset.action = "category-random";
      randomBtn.dataset.categoryKey = category.key;
      randomBtn.textContent = "Случайно";
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "btn btn-small";
      clearBtn.dataset.action = "category-clear";
      clearBtn.dataset.categoryKey = category.key;
      clearBtn.textContent = "Очистить";
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
      empty.textContent = "Нет дополнительных текстовых блоков.";
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
      title.textContent = `Блок #${index + 1} (id: ${item.id})`;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-small btn--danger";
      removeBtn.dataset.action = "extra-remove";
      removeBtn.dataset.index = String(index);
      removeBtn.textContent = "Удалить";
      head.append(title, removeBtn);
      card.append(head);

      const textField = document.createElement("label");
      textField.className = "field";
      textField.innerHTML = "<span>Текст (видно в overlay поверх карточек)</span>";
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
        { label: "Служебный id", field: "id", type: "text", value: item.id, attrs: {} },
        { label: "X (0..1)", field: "x", type: "number", value: String(item.x), attrs: { step: "0.01", min: "0", max: "1" } },
        { label: "Y (0..1)", field: "y", type: "number", value: String(item.y), attrs: { step: "0.01", min: "0", max: "1" } },
        { label: "Размер (8..96)", field: "size", type: "number", value: String(item.size ?? 20), attrs: { step: "1", min: "8", max: "96" } },
        { label: "Цвет (CSS)", field: "color", type: "text", value: item.color || "", attrs: {} },
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
      alignSpan.textContent = "Выравнивание";
      const alignSelect = document.createElement("select");
      alignSelect.dataset.action = "extra-field";
      alignSelect.dataset.field = "align";
      alignSelect.dataset.index = String(index);
      for (const optionDef of [["left", "Слева"], ["center", "По центру"], ["right", "Справа"]]) {
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
      visibleLabel.append(visibleInput, document.createTextNode("Показывать"));

      const shadowLabel = document.createElement("label");
      const shadowInput = document.createElement("input");
      shadowInput.type = "checkbox";
      shadowInput.dataset.action = "extra-field";
      shadowInput.dataset.field = "shadow";
      shadowInput.dataset.index = String(index);
      shadowInput.checked = item.shadow !== false;
      shadowLabel.append(shadowInput, document.createTextNode("Тень текста"));
      checks.append(visibleLabel, shadowLabel);
      card.append(checks);

      const help = document.createElement("p");
      help.className = "hint";
      help.textContent = "X/Y: 0 — левый/верхний край, 1 — правый/нижний край.";
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
      name: String(player.name || player.playerId || "Игрок"),
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
        label: `${String(card.deck || "-")} • ${String(card.labelShort || card.instanceId || "карта")} ${card.revealed ? "(открыта)" : "(скрыта)"}`,
        deck: String(card.deck || ""),
      })),
      ...specials.map((special) => ({
        area: "special",
        instanceId: String(special.instanceId || ""),
        label: `Особое • ${String(special.title || special.instanceId || "спецусловие")}${special.used ? " (исп.)" : ""}`,
        deck: "Особые условия",
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
    replaceHint.textContent = hasSelection
      ? `Игрок: ${fixMojibake(String(target?.name || targetPlayerId), "Игрок")} • Источник: ${
          selectedArea === "special"
            ? "особое условие"
            : `карта (${String(selectedCard?.deck || "-")})`
        } • Режим: ${modeText}.`
      : "Сначала выбери карту игрока для замены.";
  }

  function renderVotingBlock() {
    const state = presenterActionState;
    voteOutcomeRow.hidden = !state.postGameActive;
    voteOutcomeState.textContent =
      state.postGameOutcome === "survived"
        ? "Исход: Выжил в бункере."
        : state.postGameOutcome === "failed"
          ? "Исход: Не выжил."
          : "Исход не выбран.";
    voteStartGameBtn.disabled = !state.commandsReady || !state.canStartGame;
    voteNextStepBtn.disabled = !state.commandsReady || !state.canNextStep;
    voteSkipStepBtn.disabled = !state.commandsReady || !state.canSkipStep;
    voteStartBtn.disabled = !state.commandsReady || !state.canStartVote;
    voteEndBtn.disabled = !state.commandsReady || !state.canEndVote;
    voteSkipRoundBtn.disabled = !state.commandsReady || !state.canSkipRound;
    voteOutcomeSurvivedBtn.disabled = !state.commandsReady || !state.canSetOutcome;
    voteOutcomeFailedBtn.disabled = !state.commandsReady || !state.canSetOutcome;
  }

  function renderWorldBlock() {
    const world = getPresenterControlWorld();
    const kind = String(worldKindSelect.value || "threat");
    const list =
      kind === "disaster"
        ? [{ index: 0, title: String(world?.disaster?.title || "Катастрофа"), isRevealed: true, imageId: String(world?.disaster?.imageId || "") }]
        : Array.isArray(world?.[kind === "bunker" ? "bunker" : "threats"])
          ? world[kind === "bunker" ? "bunker" : "threats"]
          : [];
    fillSelectOptions(
      worldIndexSelect,
      list.map((card) => ({
        value: String(card.index ?? 0),
        label: `#${Number(card.index ?? 0) + 1} • ${String(card.title || "Карта")}`,
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
      selectedCard && selectedCard.isRevealed ? "Скрыть карту" : "Раскрыть карту";
    worldReplaceBtn.disabled = !commandsReady || list.length === 0;
    worldSetCountBtn.disabled = !commandsReady || kind === "disaster";
    const revealStateText =
      selectedCard && kind !== "disaster"
        ? selectedCard.isRevealed
          ? "Карта сейчас раскрыта."
          : "Карта сейчас скрыта."
        : "Выбери карту мира.";
    worldHint.textContent = deckName
      ? `${revealStateText} Колода мира: ${deckName}.`
      : `${revealStateText} Колода мира определяется автоматически по текущим картам.`;
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
          text: text || "Описание отсутствует.",
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
      text: entry.text || "Описание отсутствует.",
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
      const fallbackDeck = getDeckCards("Особые условия").map((card) => ({
        mode: "catalog",
        value: card.labelShort,
        actorPlayerId: "",
        title: card.labelShort,
        text: String(card.text || "").trim() || "Описание карты недоступно для текущего сценария.",
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
      ? targetPlayer.hand.filter((card) => String(card.deck || "") === "Багаж")
      : [];
    fillSelectOptions(
      specialTargetCardSelect,
      targetCards.map((card) => ({
        value: String(card.instanceId || ""),
        label: `${String(card.labelShort || card.instanceId || "багаж")} ${card.revealed ? "(открыт)" : "(скрыт)"}`,
      })),
      String(specialTargetCardSelect.value || "")
    );

    const world = getPresenterControlWorld();
    fillSelectOptions(
      specialThreatIndexSelect,
      Array.isArray(world?.bunker)
        ? world.bunker.map((card) => ({
            value: String(card.index),
            label: `#${Number(card.index) + 1} • ${String(card.title || "Карта бункера")}`,
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
            ? `${String(entry.title)}${entry.used ? " (исп.)" : ""}`
            : String(entry.title),
      })),
      String(specialPickerSelect.value || "")
    );
    const picked = availableSpecials.find((entry) => String(entry.value) === String(specialPickerSelect.value || ""));
    const requirements = getSpecialFieldRequirements(picked);
    applySpecialFieldVisibility(requirements);
    specialDescriptionText.value = String(picked?.text || "Описание карты недоступно.");
    const commandsReady = getCommandsReady();
    specialApplyBtn.disabled = !commandsReady || !picked;
    const sourceHint =
      mode === "owned"
        ? "карта выбранного игрока"
        : "каталог (от лица ведущего)";
    const fieldsHint = [];
    if (requirements.needTargetPlayer) fieldsHint.push("цель");
    if (requirements.needBaggageCard) fieldsHint.push("багаж цели");
    if (requirements.needBunkerIndex) fieldsHint.push("индекс карты бункера");
    if (requirements.needCategory) fieldsHint.push("категория");
    specialHint.textContent = picked
      ? `Источник: ${sourceHint}${picked.scope ? ` • Цель: ${picked.scope}` : ""}${
          fieldsHint.length ? ` • Параметры: ${fieldsHint.join(", ")}` : ""
        }.`
      : "Выбери спецусловие для применения.";
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
    devHint.textContent = selected ? `Выбранный игрок: ${selected}` : "Выбери игрока для dev-команд.";
  }

  function renderHostBlocks() {
    renderCardReplaceBlock();
    renderVotingBlock();
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
      emptyOption.textContent = "Нет доступных вариантов";
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

  function renderQuickActions(activeActionType) {
    const options = Array.from(controlScenarioAction.options || []);
    controlQuickActions.textContent = "";
    for (const option of options) {
      const actionType = String(option.value || "");
      if (!actionType) continue;
      const meta = CONTROL_ACTION_META[actionType] || {
        title: String(option.textContent || actionType),
        hint: "",
        guide: "",
      };
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
    title.textContent = "Быстрый выбор карты";
    controlCardPicker.append(title);
    const grid = document.createElement("div");
    grid.className = "control-pickers__grid";
    for (const card of actorCards) {
      const cardId = String(card.instanceId || "");
      const imageUrl = resolveAssetPreviewUrl(card.id);
      const btn = buildPickerCard(
        `${String(card.deck || "-")} • ${String(card.labelShort || cardId || "Карта")}`,
        card.revealed ? "Открыта" : "Скрыта",
        imageUrl,
        cardId === selectedCardId
      );
      btn.dataset.cardId = cardId;
      grid.append(btn);
    }
    if (grid.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "У выбранного игрока нет доступных карт.";
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
    title.textContent = "Быстрый выбор спецусловия";
    controlSpecialPicker.append(title);
    const grid = document.createElement("div");
    grid.className = "control-pickers__grid";
    for (const special of actorSpecials) {
      const specialId = String(special.instanceId || "");
      const imageUrl = resolveAssetPreviewUrl("", special.imgUrl);
      const metaText = special.used ? "Уже использовано" : "Готово к применению";
      const btn = buildPickerCard(
        String(special.title || specialId || "Спецусловие"),
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
      empty.textContent = "У выбранного игрока нет спецусловий.";
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
        ? "Быстрый выбор карты бункера (индекс)"
        : "Быстрый выбор угрозы";
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
        `#${Number(worldCard.index) + 1} • ${String(worldCard.title || "Карта")}`,
        worldCard.isRevealed ? "Открыта" : "Скрыта",
        imageUrl,
        indexText === selectedThreatIndex
      );
      btn.dataset.threatIndex = indexText;
      grid.append(btn);
    }
    if (grid.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "Угрозы недоступны в текущем состоянии.";
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
        label: `${String(card.deck || "-")} • ${String(card.labelShort || card.instanceId || "карта")} ${card.revealed ? "(открыта)" : "(скрыта)"}`,
      })),
      String(controlCardSelect.value || "")
    );
    fillSelectOptions(
      controlSpecialSelect,
      actorSpecials.map((special) => ({
        value: String(special.instanceId || ""),
        label: `${String(special.title || special.instanceId || "спецусловие")} ${special.used ? "(исп.)" : ""}`,
      })),
      String(controlSpecialSelect.value || "")
    );
    fillSelectOptions(
      controlThreatIndex,
      Array.isArray(world?.threats)
        ? world.threats.map((threat) => ({
            value: String(threat.index),
            label: `#${threat.index + 1} • ${String(threat.title || "Угроза")} ${threat.isRevealed ? "(открыта)" : "(скрыта)"}`,
          }))
        : [],
      String(controlThreatIndex.value || "")
    );

    const actionType = String(controlScenarioAction.value || "revealCard");
    const config = getScenarioActionConfig(actionType);
    const meta = CONTROL_ACTION_META[actionType];
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
    const actorLabel = config.actorMode === "host" ? "ведущий (host)" : actorName;
    const shortHint = meta?.hint ? ` ${meta.hint}` : "";
    controlActionHint.textContent = `Действие будет отправлено как: ${actorLabel}.${shortHint}`;
    controlGuide.textContent = meta?.guide || "Выбери действие, затем параметры ниже.";
  }

  function buildScenarioControlRequest() {
    const actionType = String(controlScenarioAction.value || "").trim();
    if (!actionType) throw new Error("Выберите сценарное действие.");
    const config = getScenarioActionConfig(actionType);
    const presenter = isRecord(presenterState) ? presenterState : null;
    const hostId = String(presenter?.hostId || "");
    const actorPlayerId =
      config.actorMode === "host"
        ? hostId
        : String(controlActorSelect.value || controlActorPlayerId || hostId || "");
    if (!actorPlayerId) throw new Error("Не удалось определить игрока-исполнителя.");

    const payload = {};
    if (actionType === "revealCard") {
      const cardId = String(controlCardSelect.value || "").trim();
      if (!cardId) throw new Error("Выберите карту для раскрытия.");
      payload.cardId = cardId;
    } else if (actionType === "applySpecial") {
      const specialInstanceId = String(controlSpecialSelect.value || "").trim();
      if (!specialInstanceId) throw new Error("Выберите спецусловие.");
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
      if (!targetPlayerId) throw new Error("Выберите цель голосования.");
      payload.targetPlayerId = targetPlayerId;
    } else if (actionType === "revealWorldThreat") {
      const index = Number(controlThreatIndex.value);
      if (!Number.isInteger(index) || index < 0) throw new Error("Выберите корректный индекс угрозы.");
      payload.index = index;
    } else if (actionType === "setBunkerOutcome") {
      payload.outcome = String(controlOutcomeSelect.value || "survived");
    } else if (actionType === "markLeftBunker" || actionType === "devKickPlayer" || actionType === "devRemovePlayer") {
      const targetPlayerId = String(controlTargetSelect.value || "").trim();
      if (!targetPlayerId) throw new Error("Выберите целевого игрока.");
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
        throw new Error("payload JSON: неверный формат.");
      }
      if (!isRecord(parsed)) {
        throw new Error("payload JSON должен быть объектом.");
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
    presenterModeState.textContent = `Presenter mode: ${enabled ? "on" : "off"} (из state) = ${modeRaw}`;
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
      presenterKickPlayerBtn.title = "Режим «Ведущий» выключен.";
      renderScenarioActionEditor();
      renderHostBlocks();
      controlExecuteBtn.disabled = true;
      controlActionHint.textContent = "Режим «Ведущий» выключен.";
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
        ? "Выберите игрока слева."
        : selectedPlayer.playerId === presenter.controlId
          ? "Нельзя выгнать создателя комнаты."
          : "Выбранного игрока сейчас нельзя выгнать.";
    controlExecuteBtn.disabled = !commandsReady;
    for (const player of players) {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = fixMojibake(String(player.name || player.playerId || "-"), "Игрок");
      row.append(nameCell);

      const statusCell = document.createElement("td");
      const baseStatus = formatPlayerStatus(player.status);
      const connectedSuffix = player.connected === false ? " (оффлайн)" : "";
      statusCell.textContent = `${baseStatus}${connectedSuffix}`;
      row.append(statusCell);

      const votedCell = document.createElement("td");
      votedCell.textContent = player.voted ? "Да" : "Нет";
      row.append(votedCell);

      const voteTargetCell = document.createElement("td");
      voteTargetCell.textContent = fixMojibake(String(player.votedTargetName || "-"), "-");
      row.append(voteTargetCell);

      const votesAgainstCell = document.createElement("td");
      votesAgainstCell.textContent = String(player.votesAgainst ?? 0);
      row.append(votesAgainstCell);

      const revealedCell = document.createElement("td");
      revealedCell.textContent = player.revealedThisRound ? "Да" : "Нет";
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
      throw new Error("Нет активного подключения к комнате.");
    }
    wsSocket.send(JSON.stringify({ type, payload }));
  }

  async function sendControlAction(action, extraPayload = {}) {
    if (!action) return;
    const hasToken = Boolean(token);
    console.log("[overlay-control] sendControlAction", { action, roomCode, hasToken, extraPayload });
    if (!(isRealtimeConnected && wsRoomReady && controlRole === "CONTROL")) {
      throw new Error("Панель не подключена к комнате как CONTROL.");
    }
    const wsMapped = mapControlActionToWs(action);
    const actionLabel =
      action === "SCENARIO_ACTION" && extraPayload && extraPayload.scenarioActionType
        ? `Сценарное действие: ${String(extraPayload.scenarioActionType)}`
        : commandLabel(action);
    if (wsMapped) {
      sendWsCommand(wsMapped.type, wsMapped.payload);
      setStatus(`Команда отправлена: ${actionLabel}.`);
      return;
    }

    setStatus(`Выполняю: ${actionLabel}...`);
    const res = await fetch("/overlay-control/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, token, action, ...extraPayload }),
    });
    const data = await res.json().catch(() => ({}));
    console.log("[overlay-control] sendControlAction response", { action, status: res.status, ok: data?.ok === true, data });
    if (!res.ok || !data.ok) {
      if (res.status === 403) {
        throw new Error("Нет прав CONTROL для этой команды.");
      }
      throw new Error(data.message || `Команда отклонена (HTTP ${res.status}).`);
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
    setStatus(`Команда выполнена: ${actionLabel}.`);
  }

  async function sendScenarioActionAsHost(actionType, payload = {}) {
    const presenter = isRecord(presenterState) ? presenterState : null;
    const actorPlayerId = String(presenter?.hostId || "");
    if (!actorPlayerId) {
      throw new Error("Не удалось определить ведущего для действия.");
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
    renderPlayerEditor();
    renderExtraTextsEditor();
    syncDirtyBadge();
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
    updatePlayersFromControlState(data.players, data.overlayState?.players);
    serverOverrides = cleanupOverrides(data.overrides || {});
    draftOverrides = clone(serverOverrides);
    ensureDraftShape();
    if (!players.some((player) => player.playerId === selectedPlayerId)) {
      selectedPlayerId = players[0]?.playerId || "";
    }
    renderAll();
    setStatus("Состояние загружено.");
  }

  function buildOverridesForSave() {
    const validation = applyTopInputsToDraft();
    if (validation.errors.length) throw new Error(validation.errors.join(" "));
    setDraftExtraTexts(parseExtraTextsJson(extraTextsJson.value.trim() || "[]"));
    return cleanupOverrides(draftOverrides);
  }

  async function saveState() {
    const overrides = buildOverridesForSave();
    setStatus("Сохранение...");
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
    setStatus("Сохранено. Изменения отправлены в overlay output.");
  }

  async function reloadStateWithConfirm() {
    if (isDirty() && !window.confirm("Есть несохраненные изменения. Перезагрузить состояние с сервера?")) return;
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
      setStatus("Подключение к комнате...");
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
        setStatus("Подключено.");
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
        const message = String(parsed.payload?.message || "Ошибка сервера");
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
      setStatus("Соединение потеряно. Переподключение...", true);
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

  playerSelect.addEventListener("change", (event) => {
    const nextPlayerId = String(event.target.value || "");
    if (!nextPlayerId) return;
    if (nextPlayerId !== selectedPlayerId && isDirty() && !window.confirm("Есть несохраненные изменения. Переключить игрока без сохранения?")) {
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
    if (nextPlayerId !== selectedPlayerId && isDirty() && !window.confirm("Есть несохраненные изменения. Переключить игрока без сохранения?")) return;
    selectedPlayerId = nextPlayerId;
    renderPlayerSelect();
    renderPlayersList();
    renderPresenter();
    renderPlayerEditor();
  });

  saveBtn.addEventListener("click", () => {
    saveState().catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка сохранения", true));
  });

  gameControlTabBtn.addEventListener("click", () => switchControlTab("game"));
  obsControlTabBtn.addEventListener("click", () => switchControlTab("obs"));

  reloadBtn.addEventListener("click", () => {
    reloadStateWithConfirm().catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка загрузки", true));
  });

  presenterKickPlayerBtn.addEventListener("click", () => {
    const player = getSelectedPlayer();
    if (!player) {
      setStatus("Сначала выберите игрока слева.", true);
      return;
    }
    sendControlAction("KICK_PLAYER", { targetPlayerId: player.playerId }).catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
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
      setStatus("Для замены нужно выбрать игрока и карту.", true);
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
      .then(() => setStatus("Карта игрока заменена."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка замены карты.", true));
  });

  voteStartGameBtn.addEventListener("click", () => {
    sendControlAction("START_GAME").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  voteNextStepBtn.addEventListener("click", () => {
    sendControlAction("NEXT_STEP").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  voteSkipStepBtn.addEventListener("click", () => {
    sendControlAction("SKIP_STEP").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  voteStartBtn.addEventListener("click", () => {
    sendControlAction("START_VOTE").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  voteEndBtn.addEventListener("click", () => {
    sendControlAction("END_VOTE").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  voteSkipRoundBtn.addEventListener("click", () => {
    sendControlAction("SKIP_ROUND").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  voteOutcomeSurvivedBtn.addEventListener("click", () => {
    sendControlAction("SET_OUTCOME_SURVIVED").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  voteOutcomeFailedBtn.addEventListener("click", () => {
    sendControlAction("SET_OUTCOME_FAILED").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
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
      setStatus("Раскрытие/скрытие доступно только для bunker/threat.", true);
      return;
    }
    const index = Number(worldIndexSelect.value);
    if (!Number.isInteger(index) || index < 0) {
      setStatus("Выбери корректный индекс карты мира.", true);
      return;
    }
    const world = getPresenterControlWorld();
    const list = kind === "bunker" ? world?.bunker : world?.threats;
    const card = Array.isArray(list) ? list.find((entry) => Number(entry.index) === index) : null;
    const revealed = !Boolean(card?.isRevealed);
    sendScenarioActionAsHost("adminSetWorldCardReveal", { kind, index, revealed })
      .then(() => setStatus("Состояние карты мира обновлено."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка изменения карты мира.", true));
  });
  worldReplaceBtn.addEventListener("click", () => {
    const kind = String(worldKindSelect.value || "").trim().toLowerCase();
    if (kind !== "bunker" && kind !== "threat" && kind !== "disaster") {
      setStatus("Некорректный тип карты мира.", true);
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
      .then(() => setStatus("Карта мира заменена."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка замены карты мира.", true));
  });
  worldSetCountBtn.addEventListener("click", () => {
    const kind = String(worldKindSelect.value || "").trim().toLowerCase();
    if (kind !== "bunker" && kind !== "threat") {
      setStatus("Количество можно менять только для bunker/threat.", true);
      return;
    }
    const count = Number(worldCountInput.value);
    if (!Number.isInteger(count) || count < 0) {
      setStatus("Введите корректное целое количество карт.", true);
      return;
    }
    sendScenarioActionAsHost("adminSetWorldCount", { kind, count })
      .then(() => setStatus("Количество карт мира обновлено."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка изменения количества карт.", true));
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
      setStatus("Выбери игрока-источник для спецусловия.", true);
      return;
    }
    const specialValue = String(specialPickerSelect.value || "").trim();
    if (!specialValue) {
      setStatus("Выбери спецусловие.", true);
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
            ? "Спецусловие из каталога применено от лица ведущего."
            : "Спецусловие игрока применено ведущим."
        )
      )
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка применения спецусловия.", true));
  });

  devTargetPlayerSelect.addEventListener("change", () => {
    renderHostBlocks();
  });
  devAddBotBtn.addEventListener("click", () => {
    const name = String(devBotNameInput.value || "").trim();
    sendScenarioActionAsHost("devAddPlayer", name ? { name } : {})
      .then(() => setStatus("Бот добавлен."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка добавления бота.", true));
  });
  devRemoveBotBtn.addEventListener("click", () => {
    const targetPlayerId = String(devTargetPlayerSelect.value || "").trim();
    if (!targetPlayerId) {
      setStatus("Выбери игрока для удаления.", true);
      return;
    }
    sendControlAction("KICK_PLAYER", { targetPlayerId })
      .then(() => setStatus("Игрок удалён (dev)."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка удаления игрока.", true));
  });
  devKickBtn.addEventListener("click", () => {
    const targetPlayerId = String(devTargetPlayerSelect.value || "").trim();
    if (!targetPlayerId) {
      setStatus("Выбери игрока для исключения.", true);
      return;
    }
    sendControlAction("KICK_PLAYER", { targetPlayerId })
      .then(() => setStatus("Игрок исключён (dev)."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка исключения игрока.", true));
  });
  devMarkLeftBtn.addEventListener("click", () => {
    const targetPlayerId = String(devTargetPlayerSelect.value || "").trim();
    if (!targetPlayerId) {
      setStatus("Выбери игрока для перевода вне бункера.", true);
      return;
    }
    sendScenarioActionAsHost("markLeftBunker", { targetPlayerId })
      .then(() => setStatus("Игрок переведён во вне бункера."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка изменения статуса игрока.", true));
  });
  devSkipRoundBtn.addEventListener("click", () => {
    sendScenarioActionAsHost("devSkipRound", {})
      .then(() => setStatus("Раунд пропущен (dev)."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка dev-команды.", true));
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
      setStatus(error instanceof Error ? error.message : "Неверные параметры действия.", true);
      return;
    }
    sendControlAction("SCENARIO_ACTION", request).catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка сценарного действия.", true)
    );
  });

  resetPlayerBtn.addEventListener("click", () => {
    const player = getSelectedPlayer();
    if (!player) return;
    if (!window.confirm(`Сбросить overrides игрока \"${player.name || player.nickname || player.playerId}\"?`)) return;
    ensureDraftShape();
    delete draftOverrides.players[player.playerId];
    renderPlayerEditor();
    syncDirtyBadge();
    setStatus("Игрок сброшен локально. Нажмите Save.");
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
        setStatus(`Нет данных для случайного выбора в категории \"${categoryKey}\"`, true);
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
    setStatus("Вставлен шаблон categories JSON.");
  });

  applyCategoriesJsonBtn.addEventListener("click", () => {
    const player = getSelectedPlayer();
    if (!player) return;
    let result;
    try {
      result = parseCategoriesJson(playerCategoriesJson.value || "{}");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка categories JSON", true);
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
        `categories JSON: неизвестные ключи проигнорированы (${result.unknownKeys.join(", ")}). Разрешённые: ${result.allowedKeys.join(", ")}`,
        false
      );
      return;
    }
    setStatus("categories JSON применен.");
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
    setStatus("extraTexts JSON обновлён из формы.");
  });
  applyExtraTextsJsonBtn.addEventListener("click", () => {
    let parsed;
    try {
      parsed = parseExtraTextsJson(extraTextsJson.value.trim() || "[]");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка extraTexts JSON", true);
      return;
    }
    setDraftExtraTexts(parsed);
    renderExtraTextsEditor();
    syncDirtyBadge();
    setStatus("extraTexts JSON применен.");
  });
  extraTextsJson.addEventListener("input", () => syncDirtyBadge());

  window.addEventListener("beforeunload", (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  setStatus("Подключение к комнате...");
  switchControlTab("game");
  loadState()
    .then(() => connectRealtime())
    .catch((error) => {
      setStatus(error instanceof Error ? error.message : "Ошибка загрузки", true);
      connectRealtime();
    });
})();


