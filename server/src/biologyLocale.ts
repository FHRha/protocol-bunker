import type { CardLocale, OverlayBiologyView, OverlayTagView } from "@bunker/shared";
import biologyMetadataRaw from "../../locales/cards/biology-metadata.json" with { type: "json" };
import traitsRuRaw from "../../locales/traits/ru.json" with { type: "json" };
import traitsEnRaw from "../../locales/traits/en.json" with { type: "json" };

type BiologyTraits = {
  sex?: string;
  age?: number;
  orientation?: string;
};

type BiologyMetadataEntry =
  | {
      titleKey?: string;
      kind: "traits";
      traits?: BiologyTraits;
    }
  | {
      titleKey?: string;
      kind: "special";
      specialType?: string;
    };

type BiologyMetadataFile = {
  cards?: Record<string, BiologyMetadataEntry>;
};

type TraitsDictionary = Record<string, string>;

const biologyMetadata = biologyMetadataRaw as BiologyMetadataFile;
const traitsDictByLocale: Record<CardLocale, TraitsDictionary> = {
  ru: traitsRuRaw as TraitsDictionary,
  en: traitsEnRaw as TraitsDictionary,
};

const UNKNOWN_VALUE = "?";

const traitText = (locale: CardLocale, key: string, fallback: string): string => {
  const dict = traitsDictByLocale[locale] ?? traitsDictByLocale.ru;
  const value = dict[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
};

const hiddenTag = (label: string): OverlayTagView => ({
  label,
  revealed: false,
  value: UNKNOWN_VALUE,
});

export const buildDefaultOverlayBioTags = (locale: CardLocale) => ({
  sex: hiddenTag(traitText(locale, "label.sex", locale === "en" ? "Sex" : "Пол")),
  age: hiddenTag(traitText(locale, "label.age", locale === "en" ? "Age" : "Возраст")),
  orientation: hiddenTag(
    traitText(locale, "label.orientation", locale === "en" ? "Orientation" : "Ориентация")
  ),
});

export const buildOverlayBiology = (
  cardId: string | undefined,
  locale: CardLocale
): {
  biology?: OverlayBiologyView;
  tags: {
    sex: OverlayTagView;
    age: OverlayTagView;
    orientation: OverlayTagView;
  };
} => {
  const defaults = buildDefaultOverlayBioTags(locale);
  const normalizedId = String(cardId ?? "").trim();
  if (!normalizedId) {
    return { tags: defaults };
  }

  const entry = biologyMetadata.cards?.[normalizedId];
  if (!entry) {
    return { tags: defaults };
  }

  if (entry.kind === "special") {
    const specialType = String(entry.specialType ?? "").trim();
    return {
      biology: {
        kind: "special",
        cardId: normalizedId,
        specialType,
        shortLabel: traitText(locale, `special.${specialType}.short`, specialType || UNKNOWN_VALUE),
        fullLabel: traitText(locale, `special.${specialType}.full`, specialType || UNKNOWN_VALUE),
      },
      tags: defaults,
    };
  }

  const traits = entry.traits ?? {};
  const sexCode = String(traits.sex ?? "unknown").trim() || "unknown";
  const orientationCode = String(traits.orientation ?? "none").trim() || "none";
  const ageValue =
    typeof traits.age === "number" && Number.isFinite(traits.age) ? String(traits.age) : UNKNOWN_VALUE;

  return {
    biology: {
      kind: "traits",
      cardId: normalizedId,
    },
    tags: {
      sex: {
        label: defaults.sex.label,
        revealed: sexCode !== "unknown",
        value: traitText(locale, `sex.${sexCode}.short`, UNKNOWN_VALUE),
      },
      age: {
        label: defaults.age.label,
        revealed: ageValue !== UNKNOWN_VALUE,
        value: ageValue,
      },
      orientation: {
        label: defaults.orientation.label,
        revealed: true,
        value: traitText(locale, `orientation.${orientationCode}.short`, UNKNOWN_VALUE),
      },
    },
  };
};
