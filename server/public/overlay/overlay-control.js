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
  const presenterPanel = $("presenterPanel");
  const presenterModeState = $("presenterModeState");
  const presenterDisabled = $("presenterDisabled");
  const presenterContent = $("presenterContent");
  const presenterRoomPhase = $("presenterRoomPhase");
  const presenterGamePhase = $("presenterGamePhase");
  const presenterRound = $("presenterRound");
  const presenterVotePhase = $("presenterVotePhase");
  const presenterPlayersBody = $("presenterPlayersBody");
  const presenterStartGameBtn = $("presenterStartGameBtn");
  const presenterNextStepBtn = $("presenterNextStepBtn");
  const presenterSkipStepBtn = $("presenterSkipStepBtn");
  const presenterStartVoteBtn = $("presenterStartVoteBtn");
  const presenterEndVoteBtn = $("presenterEndVoteBtn");
  const presenterSkipRoundBtn = $("presenterSkipRoundBtn");
  const presenterOutcomeRow = $("presenterOutcomeRow");
  const presenterOutcomeSurvivedBtn = $("presenterOutcomeSurvivedBtn");
  const presenterOutcomeFailedBtn = $("presenterOutcomeFailedBtn");
  const presenterOutcomeState = $("presenterOutcomeState");
  const presenterKickPlayerBtn = $("presenterKickPlayerBtn");

  if (
    !roomLabel || !controlConnection || !urlParamsDebug || !statusEl || !dirtyBadge || !saveBtn || !reloadBtn || !resetPlayerBtn ||
    !playerSelect || !playersList || !kickSelectedLabel || !playerEditorTitle || !categoriesGrid || !categoriesAllowedKeys ||
    !playerCategoriesJson || !insertCategoriesTemplateBtn || !applyCategoriesJsonBtn ||
    !topCurrentBunker || !topCurrentCatastrophe || !topCurrentThreats || !topBaseCatastrophe || !topCatastropheSource || !topBunkerLines ||
    !topCatastropheText || !topThreatsLines || !topBunkerMeta || !topCatastropheMeta || !topThreatsMeta ||
    !enabledTopBunker || !enabledTopCatastrophe || !enabledTopThreats ||
    !playerEnabledName || !playerEnabledTraits || !playerEnabledCategories || !playerNameInput ||
    !traitSexInput || !traitAgeInput || !traitOrientInput || !currentPlayerName || !currentTraitSex ||
    !currentTraitAge || !currentTraitOrient || !extraTextsList || !addExtraTextBtn ||
    !syncExtraTextsJsonBtn || !applyExtraTextsJsonBtn || !extraTextsJson ||
    !presenterPanel || !presenterModeState || !presenterDisabled || !presenterContent || !presenterRoomPhase ||
    !presenterGamePhase || !presenterRound || !presenterVotePhase || !presenterPlayersBody ||
    !presenterStartGameBtn || !presenterNextStepBtn || !presenterSkipStepBtn ||
    !presenterStartVoteBtn || !presenterEndVoteBtn || !presenterSkipRoundBtn ||
    !presenterOutcomeRow || !presenterOutcomeSurvivedBtn || !presenterOutcomeFailedBtn || !presenterOutcomeState ||
    !presenterKickPlayerBtn
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
  let latestRoomState = null;
  let latestGameView = null;
  let wsSocket = null;
  let wsPlayerId = "";
  let wsRoomReady = false;
  let connectedRoomCode = roomCode || "-";
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let isRealtimeConnected = false;
  let controlRole = "";
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
    };
    return map[String(action)] || String(action || "команда");
  }

  function renderConnectionStatus() {
    const connectedText = isRealtimeConnected && wsRoomReady ? "да" : "нет";
    const roleText = controlRole || "-";
    controlConnection.textContent = `Подключено: ${connectedText} • Роль: ${roleText} • Комната: ${connectedRoomCode || roomCode || "-"}`;
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

  function renderPresenter() {
    const presenter = isRecord(presenterState) ? presenterState : null;
    const enabled = presenterModeFromState == null ? Boolean(presenter?.enabled) : Boolean(presenterModeFromState);
    const modeRaw = presenterModeFromState == null ? "unknown" : String(presenterModeFromState);
    presenterModeState.textContent = `Presenter mode: ${enabled ? "on" : "off"} (из state) = ${modeRaw}`;
    presenterDisabled.hidden = enabled;
    presenterContent.hidden = !enabled;
    if (!enabled) {
      presenterKickPlayerBtn.disabled = true;
      presenterKickPlayerBtn.title = "Режим «Ведущий» выключен.";
      presenterOutcomeRow.hidden = true;
      return;
    }

    presenterRoomPhase.textContent = formatRoomPhase(presenter.roomPhase);
    presenterGamePhase.textContent = formatGamePhase(presenter.gamePhase, presenter);
    presenterRound.textContent = presenter.round == null ? "-" : String(presenter.round);
    presenterVotePhase.textContent = formatVotePhase(presenter.votePhase);

    const actions = isRecord(presenter.actions) ? presenter.actions : {};
    const commandsReady = isRealtimeConnected && wsRoomReady && controlRole === "CONTROL";
    presenterStartGameBtn.disabled = !commandsReady || actions.canStartGame !== true;
    presenterNextStepBtn.disabled = !commandsReady || actions.canNextStep !== true;
    presenterSkipStepBtn.disabled = !commandsReady || actions.canSkipStep !== true;
    presenterSkipRoundBtn.disabled = !commandsReady || actions.canSkipRound !== true;
    presenterStartVoteBtn.disabled = !commandsReady || actions.canStartVote !== true;
    presenterEndVoteBtn.disabled = !commandsReady || actions.canEndVote !== true;
    const canSetOutcome = actions.canSetOutcome === true;
    presenterOutcomeSurvivedBtn.disabled = !commandsReady || !canSetOutcome;
    presenterOutcomeFailedBtn.disabled = !commandsReady || !canSetOutcome;
    presenterOutcomeRow.hidden = presenter.postGameActive !== true;
    const postGameOutcome = String(presenter.postGameOutcome || "");
    presenterOutcomeState.textContent =
      postGameOutcome === "survived"
        ? "Исход: Выжил в бункере."
        : postGameOutcome === "failed"
          ? "Исход: Не выжил."
          : "Исход не выбран.";

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

      const revealedCell = document.createElement("td");
      revealedCell.textContent = player.revealedThisRound ? "Да" : "Нет";
      row.append(revealedCell);

      presenterPlayersBody.append(row);
    }
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
    if (wsMapped) {
      sendWsCommand(wsMapped.type, wsMapped.payload);
      setStatus(`Команда отправлена: ${commandLabel(action)}.`);
      return;
    }

    setStatus(`Выполняю: ${commandLabel(action)}...`);
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
    setStatus(`Команда выполнена: ${commandLabel(action)}.`);
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

  reloadBtn.addEventListener("click", () => {
    reloadStateWithConfirm().catch((error) => setStatus(error instanceof Error ? error.message : "Ошибка загрузки", true));
  });

  presenterStartGameBtn.addEventListener("click", () => {
    sendControlAction("START_GAME").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  presenterNextStepBtn.addEventListener("click", () => {
    sendControlAction("NEXT_STEP").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  presenterSkipStepBtn.addEventListener("click", () => {
    sendControlAction("SKIP_STEP").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  presenterStartVoteBtn.addEventListener("click", () => {
    sendControlAction("START_VOTE").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  presenterEndVoteBtn.addEventListener("click", () => {
    sendControlAction("END_VOTE").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  presenterSkipRoundBtn.addEventListener("click", () => {
    sendControlAction("SKIP_ROUND").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  presenterOutcomeSurvivedBtn.addEventListener("click", () => {
    sendControlAction("SET_OUTCOME_SURVIVED").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
  });
  presenterOutcomeFailedBtn.addEventListener("click", () => {
    sendControlAction("SET_OUTCOME_FAILED").catch((error) =>
      setStatus(error instanceof Error ? error.message : "Ошибка команды управления.", true)
    );
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
  loadState()
    .then(() => connectRealtime())
    .catch((error) => {
      setStatus(error instanceof Error ? error.message : "Ошибка загрузки", true);
      connectRealtime();
    });
})();


