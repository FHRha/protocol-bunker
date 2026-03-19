(() => {
  const localeApi = window.BUNKER_OVERLAY_LOCALE || null;
  const normalizeLang = (value) =>
    localeApi && typeof localeApi.normalizeLang === "function"
      ? localeApi.normalizeLang(value)
      : "ru";
  const t = (lang, key, params) =>
    localeApi && typeof localeApi.t === "function"
      ? localeApi.t(lang, key, params)
      : key;

  const params = new URLSearchParams(window.location.search);
  const roomCode = (params.get("room") || params.get("roomCode") || "").trim().toUpperCase();
  const token = (params.get("token") || "").trim();
  const langParamRaw = params.get("lang");
  const langFromUrl = normalizeLang(langParamRaw);
  const hasLangFromUrl = langParamRaw !== null;
  const debugParamRaw = params.get("debug");
  const debugFromUrl = debugParamRaw === "1";
  const hasDebugFromUrl = debugParamRaw !== null;
  const scaleParamRaw = params.get("scale");
  const scaleParam = Number.parseFloat(scaleParamRaw || "1.3");
  const scaleFromUrl = Number.isFinite(scaleParam) ? Math.min(1.6, Math.max(0.8, scaleParam)) : 1.3;
  const hasScaleFromUrl = scaleParamRaw !== null;
  const topParamRaw = params.get("top");
  const topParam = Number.parseFloat(topParamRaw || "200");
  const topFromUrl = Number.isFinite(topParam) ? Math.min(320, Math.max(160, topParam)) : 200;
  const hasTopFromUrl = topParamRaw !== null;
  const themeParamRaw = params.get("theme");
  const themeParam = (themeParamRaw || "mint").trim().toLowerCase();
  const themeFromUrl = ["mint", "warm", "dark"].includes(themeParam) ? themeParam : "mint";
  const hasThemeFromUrl = themeParamRaw !== null;
  const previewBg = params.get("previewBg") === "1";
  const requestedBgPresetRaw = params.get("bgPreset") || params.get("bg") || "";
  const requestedBgPreset = requestedBgPresetRaw.trim().toLowerCase();
  const hasRequestedBgPresetFromUrl = Boolean(requestedBgPreset);

  const app = document.getElementById("overlay-app");
  const grid = document.getElementById("overlay-grid");
  const statusEl = document.getElementById("overlay-status");
  const topBunkerLabel = document.getElementById("top-bunker-label");
  const topBunker = document.getElementById("top-bunker");
  const topCatastropheLabel = document.getElementById("top-catastrophe-label");
  const topCatastrophe = document.getElementById("top-catastrophe");
  const topThreatLabel = document.getElementById("top-threat-label");
  const topThreat = document.getElementById("top-threat");

  if (
    !app ||
    !grid ||
    !statusEl ||
    !topBunkerLabel ||
    !topBunker ||
    !topCatastropheLabel ||
    !topCatastrophe ||
    !topThreatLabel ||
    !topThreat
  ) {
    return;
  }

  let currentLang = langFromUrl;
  let debug = debugFromUrl;
  let currentScale = scaleFromUrl;
  let currentTop = topFromUrl;
  let currentTheme = themeFromUrl;
  let requestedBgPresetFromState = "";

  function applyVisualSettings() {
    document.documentElement.style.setProperty("--scale", String(currentScale));
    document.documentElement.style.setProperty("--topbar-h", `${currentTop}px`);
    document.documentElement.setAttribute("lang", currentLang);
    document.documentElement.setAttribute("data-theme", currentTheme);
    topBunkerLabel.textContent = t(currentLang, "overlay.top.bunker");
    topThreatLabel.textContent = t(currentLang, "overlay.top.threats");
    topCatastropheLabel.textContent = t(currentLang, "overlay.top.catastrophe");
    if (debug) {
      app.classList.add("is-debug");
    } else {
      app.classList.remove("is-debug");
    }
  }

  applyVisualSettings();
  topBunker.textContent = t(currentLang, "overlay.hidden");
  topCatastrophe.textContent = t(currentLang, "overlay.hidden");
  topThreat.textContent = t(currentLang, "overlay.hidden");
  document.documentElement.setAttribute("data-preview-bg", previewBg ? "1" : "0");
  const debugInfo = document.createElement("div");
  debugInfo.className = "overlay-debug";
  app.append(debugInfo);
  const extraTextLayer = document.createElement("div");
  extraTextLayer.className = "overlay-extra-texts";
  app.append(extraTextLayer);

  const setDebugInfo = (status) => {
    if (!debug) return;
    debugInfo.textContent = `previewBg=${previewBg ? "1" : "0"} | ${status}`;
  };

  setDebugInfo("overlay-bg=transparent");

  const CATEGORY_LAYOUT_KEYS = {
    left: ["phobia", "hobby", "health", "profession"],
    right: ["baggage", "fact1", "fact2"],
  };

  const SLOT_COUNT = { l4: 4, l8: 8, l12: 12 };
  const EMPTY_BG_CATALOG = { defaultPreset: "default", presets: [] };
  const NO_BG_PRESET_IDS = new Set(["none", "off", "transparent", "__none__", "__transparent__"]);
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
    if (categoryEnabledMap && typeof categoryEnabledMap === "object" && typeof categoryEnabledMap[key] === "boolean") {
      return categoryEnabledMap[key];
    }
    return defaultCategoryEnabled(key);
  }

  function getCategoryLayout() {
    const buildColumn = (keys) =>
      keys.map((key) => ({
        key,
        label: t(currentLang, `overlay.category.${key}`),
      }));
    return {
      left: buildColumn(CATEGORY_LAYOUT_KEYS.left),
      right: buildColumn(CATEGORY_LAYOUT_KEYS.right),
    };
  }

  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let bgCatalog = EMPTY_BG_CATALOG;
  let bgCatalogLoadPromise = null;
  let lastBackgroundSignature = "";

  function setStatus(message, visible = true) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-visible", visible);
  }

  setStatus(t(currentLang, "overlay.status.connectingGame"), true);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function selectLayout(playerCount) {
    if (playerCount <= 4) return "l4";
    if (playerCount <= 8) return "l8";
    return "l12";
  }

  function normalizeBgPresetId(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "");
  }

  function isNoBackgroundPresetId(value) {
    const normalized = normalizeBgPresetId(value);
    return normalized ? NO_BG_PRESET_IDS.has(normalized) : false;
  }

  function pickStringParamFromOverrides(overrides, key) {
    const map =
      overrides && typeof overrides.overlayUrlParams === "object" && overrides.overlayUrlParams
        ? overrides.overlayUrlParams
        : null;
    if (!map) return "";
    const value = map[key];
    if (value == null) return "";
    return String(value).trim();
  }

  function applyVisualSettingsFromOverrides(overrides) {
    const langOverrideRaw = pickStringParamFromOverrides(overrides, "lang");
    const hasLangOverride = Boolean(String(langOverrideRaw || "").trim());
    const langOverride = normalizeLang(langOverrideRaw);
    const stateLocale = normalizeLang(overrides?.__roomLocale || "ru");
    const themeOverride = pickStringParamFromOverrides(overrides, "theme").toLowerCase();
    const scaleOverrideRaw = pickStringParamFromOverrides(overrides, "scale");
    const topOverrideRaw = pickStringParamFromOverrides(overrides, "top");
    const debugOverrideRaw = pickStringParamFromOverrides(overrides, "debug");
    const bgPresetOverrideRaw =
      pickStringParamFromOverrides(overrides, "bgPreset") || pickStringParamFromOverrides(overrides, "bg");

    if (hasLangFromUrl) {
      currentLang = langFromUrl;
    } else if (hasLangOverride) {
      currentLang = langOverride;
    } else {
      currentLang = stateLocale;
    }

    if (hasThemeFromUrl) {
      currentTheme = themeFromUrl;
    } else if (["mint", "warm", "dark"].includes(themeOverride)) {
      currentTheme = themeOverride;
    } else {
      currentTheme = "mint";
    }

    const scaleOverride = Number.parseFloat(scaleOverrideRaw);
    if (hasScaleFromUrl) {
      currentScale = scaleFromUrl;
    } else if (Number.isFinite(scaleOverride)) {
      currentScale = Math.min(1.6, Math.max(0.8, scaleOverride));
    } else {
      currentScale = 1.3;
    }

    const topOverride = Number.parseFloat(topOverrideRaw);
    if (hasTopFromUrl) {
      currentTop = topFromUrl;
    } else if (Number.isFinite(topOverride)) {
      currentTop = Math.min(320, Math.max(160, topOverride));
    } else {
      currentTop = 200;
    }

    if (hasDebugFromUrl) {
      debug = debugFromUrl;
    } else {
      debug = debugOverrideRaw === "1";
    }

    if (hasRequestedBgPresetFromUrl) {
      requestedBgPresetFromState = "";
    } else {
      requestedBgPresetFromState = String(bgPresetOverrideRaw || "").trim().toLowerCase();
    }

    applyVisualSettings();
  }

  function applyAutoScaleForLayout(layout, overrides) {
    const overrideScaleRaw = pickStringParamFromOverrides(overrides, "scale");
    const overrideScaleNum = Number.parseFloat(overrideScaleRaw);
    const hasExplicitScale = hasScaleFromUrl || Number.isFinite(overrideScaleNum);
    if (hasExplicitScale) return;

    const autoScale = layout === "l8" || layout === "l12" ? 1.1 : 1.3;
    if (Math.abs(currentScale - autoScale) < 0.0001) return;
    currentScale = autoScale;
    applyVisualSettings();
  }

  function normalizeBgCatalog(raw) {
    if (!raw || typeof raw !== "object") return EMPTY_BG_CATALOG;
    const presets = Array.isArray(raw.presets)
      ? raw.presets
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const id = normalizeBgPresetId(entry.id);
            if (!id) return null;
            const layouts = entry.layouts && typeof entry.layouts === "object" ? entry.layouts : {};
            const normalizedLayouts = {};
            if (typeof layouts.l4 === "string" && layouts.l4.trim()) normalizedLayouts.l4 = layouts.l4.trim();
            if (typeof layouts.l8 === "string" && layouts.l8.trim()) normalizedLayouts.l8 = layouts.l8.trim();
            if (typeof layouts.l12 === "string" && layouts.l12.trim()) normalizedLayouts.l12 = layouts.l12.trim();
            if (!Object.keys(normalizedLayouts).length) return null;
            return {
              id,
              label: String(entry.label || id),
              layouts: normalizedLayouts,
            };
          })
          .filter(Boolean)
      : [];
    const defaultPresetRaw = normalizeBgPresetId(raw.defaultPreset || "");
    const defaultPreset =
      defaultPresetRaw && presets.some((preset) => preset.id === defaultPresetRaw)
        ? defaultPresetRaw
        : presets[0]?.id || "default";
    return { defaultPreset, presets };
  }

  async function loadBgCatalog() {
    if (bgCatalogLoadPromise) {
      return bgCatalogLoadPromise;
    }
    bgCatalogLoadPromise = fetch("/api/overlay-backgrounds")
      .then((response) => response.json().catch(() => ({})).then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!response.ok || payload?.ok !== true) {
          throw new Error(payload?.message || `HTTP ${response.status}`);
        }
        bgCatalog = normalizeBgCatalog(payload);
        return bgCatalog;
      })
      .catch((error) => {
        console.warn("[overlay] failed to load background catalog:", error);
        bgCatalog = EMPTY_BG_CATALOG;
        return bgCatalog;
      });
    return bgCatalogLoadPromise;
  }

  function findBgPresetById(presetId) {
    const id = normalizeBgPresetId(presetId);
    if (!id) return null;
    return bgCatalog.presets.find((preset) => preset.id === id) || null;
  }

  function resolveBgUrl(layout, overrides) {
    const overridePresetRaw = String(overrides?.backgroundPreset || "").trim();
    if (isNoBackgroundPresetId(overridePresetRaw)) return "";
    const overridePreset = normalizeBgPresetId(overridePresetRaw);
    const forcedPreset = normalizeBgPresetId(requestedBgPreset || requestedBgPresetFromState);
    const selectedPresetId = overridePreset || forcedPreset || bgCatalog.defaultPreset;
    if (!selectedPresetId) return "";

    const selectedPreset = findBgPresetById(selectedPresetId) || findBgPresetById(bgCatalog.defaultPreset);
    if (!selectedPreset) return "";
    const direct = String(selectedPreset.layouts?.[layout] || "").trim();
    if (direct) return direct;

    const fallbackPreset = findBgPresetById(bgCatalog.defaultPreset);
    const fallbackLayout = String(fallbackPreset?.layouts?.[layout] || "").trim();
    if (fallbackLayout) return fallbackLayout;

    return String(selectedPreset.layouts?.l4 || selectedPreset.layouts?.l8 || selectedPreset.layouts?.l12 || "").trim();
  }

  function applyGridBackground(layout, overrides) {
    const applyResolvedBackground = () => {
      const bgUrl = resolveBgUrl(layout, overrides);
      const signature = `${layout}:${bgUrl || "none"}`;
      if (signature === lastBackgroundSignature) {
        return;
      }
      lastBackgroundSignature = signature;

      if (!bgUrl) {
        app.style.backgroundImage = "";
        app.style.backgroundSize = "";
        app.style.backgroundPosition = "";
        app.style.backgroundRepeat = "";
        app.classList.remove("has-custom-bg");
        setDebugInfo("overlay-bg=transparent");
        return;
      }

      app.style.backgroundImage = `url("${bgUrl}")`;
      // Full-frame overlay backgrounds are authored for exact canvas composition.
      app.style.backgroundSize = "100% 100%";
      app.style.backgroundPosition = "left top";
      app.style.backgroundRepeat = "no-repeat";
      app.classList.add("has-custom-bg");
      setDebugInfo(`overlay-bg=${bgUrl}`);
    };

    if (bgCatalog.presets.length > 0) {
      applyResolvedBackground();
      return;
    }
    loadBgCatalog().finally(applyResolvedBackground);
  }

  function normalizeCategory(player, key, label) {
    const source = Array.isArray(player.categories)
      ? player.categories.find((item) => item && item.key === key)
      : null;

    if (!source) {
      return { key, label, revealed: false, value: "" };
    }

    return {
      key,
      label,
      revealed: Boolean(source.revealed),
      value: source.value ? String(source.value) : "",
    };
  }

  function isCategoryVisibleForPlayer(player, category) {
    if (!player || !category || !category.key) return true;
    const visibilityMap =
      player.__overlayCategoryEnabled && typeof player.__overlayCategoryEnabled === "object"
        ? player.__overlayCategoryEnabled
        : null;
    const key = String(category.key);
    const aliases = CATEGORY_KEY_ALIASES[key] || [];
    const baseEnabled = category.__overlayEnabled !== false;
    if (!visibilityMap) {
      return baseEnabled && defaultCategoryEnabled(key);
    }

    if (visibilityMap[key] === true) return baseEnabled;
    if (visibilityMap[key] === false) return false;
    for (const alias of aliases) {
      if (visibilityMap[alias] === true) return baseEnabled;
      if (visibilityMap[alias] === false) return false;
    }
    return baseEnabled && defaultCategoryEnabled(key);
  }

  function parseTraitsFromLabel(label) {
    const norm = String(label || "").trim().replace(/\s+/g, " ");
    if (!norm) {
      return { sex: "?", age: "?", orient: "?" };
    }

    const AGE_UNIT_TOKENS = new Set(["л", "г", "лет", "год", "года"]);
    const normalizeAgeUnitToken = (token) =>
      String(token || "")
        .toLowerCase()
        .replace(/\.+$/g, "")
        .trim();

    const tokens = norm.split(" ");
    const sexValid = /^(М|Ж)$/i.test(tokens[0] || "");
    const ageValid = /^\d{1,3}$/.test(tokens[1] || "");
    const sex = sexValid ? (tokens[0] || "").toUpperCase() : "?";
    const age = ageValid ? tokens[1] : "?";
    const rest = tokens.slice(2);

    if (rest[0] && AGE_UNIT_TOKENS.has(normalizeAgeUnitToken(rest[0]))) {
      rest.shift();
    }

    const orientRaw = rest.join(" ").replace(/\s+/g, " ").trim();
    if (!orientRaw) {
      if (sexValid && ageValid) {
        return { sex, age, orient: "-" };
      }
      return { sex, age, orient: "?" };
    }

    return {
      sex,
      age,
      orient: orientRaw,
    };
  }

  function pickTraits(player) {
    const biology = Array.isArray(player?.categories)
      ? player.categories.find((item) => item && item.key === "biology")
      : null;

    if (biology && biology.revealed && biology.value && biology.value !== "?") {
      return parseTraitsFromLabel(String(biology.value));
    }

    const sexFallback =
      player?.tags?.sex?.revealed && player?.tags?.sex?.value ? String(player.tags.sex.value) : "?";
    const ageFallback =
      player?.tags?.age?.revealed && player?.tags?.age?.value ? String(player.tags.age.value) : "?";
    const orientFallback =
      player?.tags?.orientation?.revealed && player?.tags?.orientation?.value
        ? String(player.tags.orientation.value).replace(/\s+/g, " ").trim()
        : "?";

    return {
      sex: sexFallback || "?",
      age: ageFallback || "?",
      orient: orientFallback || "?",
    };
  }

  function getRevealedBiologyName(player) {
    const biology = Array.isArray(player?.categories)
      ? player.categories.find(
          (item) =>
            item &&
            (item.key === "biology" ||
              (typeof item.label === "string" && item.label.toLowerCase().includes("биолог")))
        )
      : null;
    if (!biology || !biology.revealed || !biology.value) return null;
    const value = String(biology.value).trim();
    return value.length > 0 ? value : null;
  }

  function renderTrait(value, title) {
    const trait = document.createElement("span");
    trait.className = "traitBox";
    trait.title = title;
    trait.textContent = value || "?";
    return trait;
  }

  function renderCategoryColumn(player, entries) {
    const col = document.createElement("div");
    col.className = "catsCol";

    for (const entry of entries) {
      const category = normalizeCategory(player, entry.key, entry.label);
      const item = document.createElement("div");
      item.className = "catItem";
      const categoryEnabled = isCategoryVisibleForPlayer(player, category);
      if (!categoryEnabled) continue;
      item.dataset.enabled = "1";
      item.dataset.revealed = category.revealed && category.value ? "1" : "0";
      item.textContent = item.dataset.revealed === "1" ? category.value : entry.label;
      item.title = item.textContent;
      col.append(item);
    }

    return col;
  }

  function renderPlayerSlot(player, index) {
    const slot = document.createElement("section");
    slot.className = "playerSlot";

    const frame = document.createElement("div");
    frame.className = "camFrame";
    slot.append(frame);

    const debugLabel = document.createElement("div");
    debugLabel.className = "playerSlot__debug";
    debugLabel.textContent = `SLOT ${index + 1}`;
    slot.append(debugLabel);

    if (!player) {
      slot.classList.add("is-empty");
      return slot;
    }

    if (player.alive === false) {
      slot.classList.add("is-dead");
    }

    const hud = document.createElement("div");
    hud.className = "slotHud";

    const name = document.createElement("div");
    name.className = "nameBadge";
    const slotNo = document.createElement("span");
    slotNo.className = "slotNo";
    slotNo.textContent = `${index + 1})`;
    const slotNick = document.createElement("span");
    slotNick.className = "slotNick";
    const hideName = player.__overlayHideName === true;
    if (hideName) {
      name.classList.add("is-hidden");
      slotNick.textContent = "";
    } else if (typeof player.nickname === "string") {
      slotNick.textContent = player.nickname;
    } else {
      slotNick.textContent = t(currentLang, "overlay.player.defaultName", { index: index + 1 });
    }
    name.append(slotNo, slotNick);
    hud.append(name);

    const traits = document.createElement("div");
    traits.className = "traitsRow";
    const hideTraits = player.__overlayHideTraits === true;
    if (hideTraits) {
      traits.classList.add("is-hidden");
    }
    const bioName = getRevealedBiologyName(player);
    const bioNorm = bioName ? bioName.trim().toLowerCase() : "";
    const isSpecialBio =
      bioNorm === "андроид" ||
      bioNorm === "котгендер" ||
      bioNorm === "android" ||
      bioNorm === "catgender";
    if (!hideTraits && isSpecialBio && bioName) {
      const merged = document.createElement("span");
      merged.className = "traitMerged";
      merged.title = bioName;
      merged.textContent = bioName.toUpperCase();
      traits.append(merged);
    } else if (!hideTraits) {
      const parsedTraits = pickTraits(player);
      traits.append(renderTrait(parsedTraits.sex, t(currentLang, "overlay.trait.sex")));
      traits.append(renderTrait(parsedTraits.age, t(currentLang, "overlay.trait.age")));
      traits.append(renderTrait(parsedTraits.orient, t(currentLang, "overlay.trait.orientation")));
    }
    hud.append(traits);

    const categoriesHud = document.createElement("div");
    categoriesHud.className = "categoriesHud";
    if (player.__overlayHideCategories === true) {
      categoriesHud.classList.add("is-hidden");
    }
    const categoryLayout = getCategoryLayout();
    categoriesHud.append(renderCategoryColumn(player, categoryLayout.left));
    categoriesHud.append(renderCategoryColumn(player, categoryLayout.right));
    hud.append(categoriesHud);

    slot.append(hud);
    return slot;
  }

  function renderTopLines(target, lines, fallback = t(currentLang, "overlay.hidden")) {
    const safeLines = Array.isArray(lines)
      ? lines.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const localizedLines = safeLines.map((line) => (isHiddenPlaceholder(line) ? fallback : line));
    const baseLines = localizedLines.length > 0 ? localizedLines : [fallback];
    target.textContent = "";
    const list = document.createElement("div");
    list.className = "topList";
    for (const line of baseLines) {
      const item = document.createElement("span");
      item.className = "topItem topLine";
      item.textContent = line;
      list.append(item);
    }
    target.append(list);
    target.title = baseLines.join("\n");
  }


  function isHiddenPlaceholder(value) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalized) return false;
    const hiddenRu = t("ru", "overlay.hidden").replace(/\s+/g, " ").trim().toLowerCase();
    const hiddenEn = t("en", "overlay.hidden").replace(/\s+/g, " ").trim().toLowerCase();
    return normalized === hiddenRu || normalized === hiddenEn;
  }

  function cleanInline(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeTopItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const title = cleanInline(item.title) || "?";
        const subtitle = cleanInline(item.subtitle || "");
        const subtitleSameAsTitle =
          subtitle &&
          subtitle.toLocaleLowerCase("ru-RU") === title.toLocaleLowerCase("ru-RU");
        return {
          title,
          subtitle: subtitle && !subtitleSameAsTitle ? subtitle : "",
        };
      })
      .filter((item) => item.title);
  }

  function renderTopCards(target, items, fallbackLines, fallback = t(currentLang, "overlay.hidden")) {
    const normalizedItems = normalizeTopItems(items);
    if (normalizedItems.length === 0) {
      renderTopLines(target, fallbackLines, fallback);
      return;
    }
    const isBunker = target.id === "top-bunker";
    const compactMode = isBunker && normalizedItems.length >= 5;
    target.textContent = "";
    const list = document.createElement("div");
    list.className = compactMode ? "topList topList--compact" : "topList";
    list.style.webkitLineClamp = compactMode ? "5" : "6";
    list.style.lineClamp = compactMode ? "5" : "6";
    for (const entry of normalizedItems) {
      const row = document.createElement("span");
      row.className = compactMode ? "topItem topCardLine topItem--compact" : "topItem topCardLine";
      row.textContent = compactMode
        ? entry.title
        : entry.subtitle
          ? `${entry.title} — ${entry.subtitle}`
          : entry.title;
      list.append(row);
    }
    target.append(list);
    target.title = normalizedItems
      .map((entry) => (entry.subtitle ? `${entry.title} — ${entry.subtitle}` : entry.title))
      .join("\n");
  }

  function renderTopText(target, text, fallback = t(currentLang, "overlay.hidden")) {
    const rawContent = String(text || "").replace(/\s+/g, " ").trim();
    const content = !rawContent || isHiddenPlaceholder(rawContent) ? fallback : rawContent;
    target.textContent = "";
    const paragraph = document.createElement("span");
    paragraph.className = "catText";
    paragraph.textContent = content;
    target.append(paragraph);
    target.title = content;
  }

  function renderCatastropheLabel(target, title) {
    const suffix = String(title || "").trim();
    const label = suffix
      ? t(currentLang, "overlay.top.catastropheLabel", { title: suffix })
      : t(currentLang, "overlay.top.catastrophe");
    target.textContent = label;
    target.title = label;
  }

  function normalizeExtraTexts(overrides) {
    if (!overrides || !Array.isArray(overrides.extraTexts)) return [];
    return overrides.extraTexts
      .filter((entry) => entry && typeof entry === "object")
      .map((entry, index) => {
        const align = entry.align === "left" || entry.align === "center" || entry.align === "right" ? entry.align : "center";
        const size = Number.isFinite(Number(entry.size)) ? clamp(Number(entry.size), 8, 96) : 20;
        return {
          id: String(entry.id || `text-${index + 1}`),
          text: String(entry.text || ""),
          x: clamp(Number(entry.x), 0, 1),
          y: clamp(Number(entry.y), 0, 1),
          align,
          size,
          color: typeof entry.color === "string" ? entry.color : "",
          shadow: entry.shadow !== false,
          visible: entry.visible !== false,
        };
      });
  }

  function renderExtraTexts(extraTexts) {
    extraTextLayer.textContent = "";
    for (const entry of extraTexts) {
      if (!entry.visible) continue;
      const node = document.createElement("div");
      node.className = "overlay-extra-text";
      if (entry.shadow) {
        node.classList.add("with-shadow");
      }
      node.dataset.id = entry.id;
      node.textContent = entry.text;
      node.style.left = `${entry.x * 100}%`;
      node.style.top = `${entry.y * 100}%`;
      node.style.textAlign = entry.align;
      node.style.fontSize = `${entry.size}px`;
      if (entry.color) {
        node.style.color = entry.color;
      }
      if (entry.align === "left") {
        node.style.transform = "translate(0, -50%)";
      } else if (entry.align === "right") {
        node.style.transform = "translate(-100%, -50%)";
      } else {
        node.style.transform = "translate(-50%, -50%)";
      }
      extraTextLayer.append(node);
    }
  }

  function applyOverrides(baseState, overrides) {
    if (!overrides || typeof overrides !== "object") {
      return baseState;
    }

    const enabled = overrides.enabled && typeof overrides.enabled === "object" ? overrides.enabled : {};
    const isEnabled = (key) => enabled[key] !== false;
    const state = JSON.parse(JSON.stringify(baseState));

    if (overrides.top && typeof overrides.top === "object") {
      if (isEnabled("topBunker") && Array.isArray(overrides.top.bunkerLines)) {
        state.top.bunker.lines = overrides.top.bunkerLines.slice(0, 5).map((line) => String(line ?? ""));
        state.top.bunker.items = [];
      }
      if (isEnabled("topCatastrophe") && typeof overrides.top.catastropheText === "string") {
        state.top.catastrophe.text = overrides.top.catastropheText;
      }
      if (isEnabled("topThreats") && Array.isArray(overrides.top.threatsLines)) {
        state.top.threats.lines = overrides.top.threatsLines.slice(0, 6).map((line) => String(line ?? ""));
        state.top.threats.items = [];
      }
    }

    const playerOverrides = overrides.players && typeof overrides.players === "object" ? overrides.players : {};
    for (const player of state.players || []) {
      const current =
        playerOverrides[player.id] && typeof playerOverrides[player.id] === "object"
          ? playerOverrides[player.id]
          : {};
      const currentEnabled =
        current.enabled && typeof current.enabled === "object" ? current.enabled : {};
      const categoryEnabledMap =
        currentEnabled.categories && typeof currentEnabled.categories === "object"
          ? currentEnabled.categories
          : {};
      const visibilityMap = {};

      const namesEnabled = isEnabled("playerNames") && currentEnabled.name !== false;
      player.__overlayHideName = !namesEnabled;
      if (namesEnabled && typeof current.name === "string") {
        player.nickname = current.name;
      } else if (!namesEnabled) {
        player.nickname = "";
      }

      const traitsEnabled = isEnabled("playerTraits") && currentEnabled.traits !== false;
      player.__overlayHideTraits = !traitsEnabled;
      if (traitsEnabled) {
        if (current.traits && typeof current.traits === "object") {
          if (typeof current.traits.sex === "string") {
            player.tags.sex = { ...player.tags.sex, revealed: true, value: current.traits.sex };
          }
          if (typeof current.traits.age === "string") {
            player.tags.age = { ...player.tags.age, revealed: true, value: current.traits.age };
          }
          if (typeof current.traits.orient === "string") {
            player.tags.orientation = {
              ...player.tags.orientation,
              revealed: true,
              value: current.traits.orient,
            };
          }
        }
      } else {
        player.tags.sex = { ...player.tags.sex, revealed: false, value: "?" };
        player.tags.age = { ...player.tags.age, revealed: false, value: "?" };
        player.tags.orientation = { ...player.tags.orientation, revealed: false, value: "?" };
      }

      const categoriesEnabled = isEnabled("playerCategories");
      if (!Array.isArray(player.categories)) {
        player.categories = [];
      }
      for (const category of player.categories) {
        if (!category || !category.key) continue;
        const categoryOn = categoriesEnabled && getCategoryEnabledFlag(categoryEnabledMap, category.key);
        visibilityMap[category.key] = categoryOn;
        category.__overlayEnabled = categoryOn;
        if (!categoryOn) {
          category.revealed = false;
          category.value = "";
        }
      }

      if (current.categories && typeof current.categories === "object") {
        for (const [categoryKey, categoryValue] of Object.entries(current.categories)) {
          const categoryOn = categoriesEnabled && getCategoryEnabledFlag(categoryEnabledMap, categoryKey);
          visibilityMap[categoryKey] = categoryOn;
          if (!categoryOn) continue;
          const value = String(categoryValue ?? "");
          const existing = player.categories.find((item) => item && item.key === categoryKey);
          if (existing) {
            existing.revealed = true;
            existing.value = value;
            existing.__overlayEnabled = true;
            continue;
          }
          player.categories.push({
            key: categoryKey,
            label: categoryKey,
            revealed: true,
            value,
            __overlayEnabled: true,
          });
        }
      }

      for (const [categoryKey, rawEnabled] of Object.entries(categoryEnabledMap)) {
        if (typeof rawEnabled === "boolean") visibilityMap[categoryKey] = rawEnabled;
      }
      player.__overlayCategoryEnabled = visibilityMap;

      const hasEnabledByMap = Object.values(visibilityMap).some((value) => value !== false);
      const hasEnabledCategories = hasEnabledByMap || player.categories.some(
        (category) => category && category.__overlayEnabled !== false
      );
      player.__overlayHideCategories = !hasEnabledCategories;
    }

    return state;
  }

  function renderState(state, extraTexts = []) {
    const playerCount = Number(state.playerCount) || 0;
    const layout = selectLayout(playerCount);
    applyAutoScaleForLayout(layout, state?.overrides);
    app.setAttribute("data-layout", layout);
    const slotAr = "16 / 9";
    app.style.setProperty("--slot-ar", slotAr);
    applyGridBackground(layout, state?.overrides);

    renderTopCards(topBunker, state.top?.bunker?.items, state.top?.bunker?.lines);
    renderTopCards(topThreat, state.top?.threats?.items, state.top?.threats?.lines);
    renderCatastropheLabel(topCatastropheLabel, state.top?.catastrophe?.title);
    renderTopText(topCatastrophe, state.top?.catastrophe?.text);

    grid.innerHTML = "";
    const totalSlots = SLOT_COUNT[layout];
    const players = Array.isArray(state.players) ? state.players : [];
    for (let i = 0; i < totalSlots; i += 1) {
      grid.append(renderPlayerSlot(players[i] || null, i));
    }
    renderExtraTexts(extraTexts);
  }

  function handleOverlayState(payload) {
    if (!payload || payload.ok === false) {
      const message =
        payload?.message ||
        (payload?.unauthorized
          ? "Unauthorized"
          : t(currentLang, "overlay.status.noData"));
      setStatus(message, true);
      grid.innerHTML = "";
      extraTextLayer.textContent = "";
      return;
    }

    if (!payload.state) {
      setStatus(t(currentLang, "overlay.status.stateNotReady"), true);
      return;
    }

    setStatus("", false);
    const rawOverrides = payload.state.overrides;
    const visualOverrides =
      rawOverrides && typeof rawOverrides === "object"
        ? { ...rawOverrides, __roomLocale: payload.state.locale || "ru" }
        : { __roomLocale: payload.state.locale || "ru" };
    applyVisualSettingsFromOverrides(visualOverrides);
    const effectiveState = applyOverrides(payload.state, payload.state.overrides);
    const extraTexts = normalizeExtraTexts(payload.state.overrides);
    renderState(effectiveState, extraTexts);
  }

  function connect() {
    if (!roomCode || !token) {
      setStatus(t(currentLang, "overlay.status.needRoomToken"), true);
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}`);
    setStatus(t(currentLang, "overlay.status.connectingServer"), true);

    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      setStatus(t(currentLang, "overlay.status.subscribing"), true);
      socket.send(JSON.stringify({ type: "overlaySubscribe", payload: { roomCode, token } }));
    });

    socket.addEventListener("message", (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!parsed || parsed.type !== "overlayState") return;
      handleOverlayState(parsed.payload);
    });

    socket.addEventListener("close", () => {
      if (reconnectTimer) return;
      reconnectAttempt += 1;
      const timeout = Math.min(500 * 2 ** (reconnectAttempt - 1), 10000);
      setStatus(
        t(currentLang, "overlay.status.connectionLost", {
          seconds: Math.round(timeout / 1000),
        }),
        true
      );
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, timeout);
    });

    socket.addEventListener("error", () => {
      setStatus(t(currentLang, "overlay.status.connectionError"), true);
      try {
        socket.close();
      } catch {
        // ignore
      }
    });
  }

  connect();
})();
