(() => {
  const KNOWN_LANGS = ["ru", "en"];

  function normalizeLang(rawValue) {
    const value = String(rawValue || "").trim().toLowerCase();
    return value === "en" ? "en" : "ru";
  }

  function loadDictionary(lang) {
    const normalized = normalizeLang(lang);
    const request = new XMLHttpRequest();
    request.open("GET", `/locales/overlay/${normalized}.json`, false);
    request.setRequestHeader("Accept", "application/json");
    try {
      request.send();
      if (request.status >= 200 && request.status < 300 && request.responseText) {
        return JSON.parse(request.responseText);
      }
    } catch (_error) {
      // Keep empty fallback below.
    }
    return {};
  }

  const localeCache = Object.fromEntries(KNOWN_LANGS.map((lang) => [lang, loadDictionary(lang)]));

  function getDictionary(lang) {
    const normalized = normalizeLang(lang);
    return localeCache[normalized] || localeCache.ru || {};
  }

  function translate(lang, key, params = {}) {
    const dictionary = getDictionary(lang);
    const fallback = localeCache.ru || {};
    const template = dictionary[key] ?? fallback[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, paramKey) => {
      const value = params[paramKey];
      return value == null ? "" : String(value);
    });
  }

  window.BUNKER_OVERLAY_LOCALE = {
    localeCache,
    normalizeLang,
    getDictionary,
    t: translate,
  };
})();
