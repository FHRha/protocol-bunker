import { z } from "zod";
import { CardLocaleSchema, type CardLocale } from "./primitives.js";

export interface OverlayTagView {
  label: string;
  revealed: boolean;
  value: string;
}

export interface OverlayBiologyView {
  kind: "traits" | "special";
  cardId?: string;
  specialType?: string;
  shortLabel?: string;
  fullLabel?: string;
}

export interface OverlayCategoryView {
  key: string;
  label: string;
  revealed: boolean;
  value: string;
  imgUrl?: string;
}

export interface OverlayOverrideEnabled {
  topBunker?: boolean;
  topCatastrophe?: boolean;
  topThreats?: boolean;
  playerNames?: boolean;
  playerTraits?: boolean;
  playerCategories?: boolean;
}

export interface OverlayOverrideTop {
  bunkerLines?: string[];
  catastropheText?: string;
  threatsLines?: string[];
}

export interface OverlayOverridePlayerTraits {
  sex?: string;
  age?: string;
  orient?: string;
}

export interface OverlayOverridePlayerEnabled {
  name?: boolean;
  traits?: boolean;
  categories?: Record<string, boolean>;
}

export interface OverlayOverridePlayer {
  name?: string;
  traits?: OverlayOverridePlayerTraits;
  categories?: Record<string, string>;
  enabled?: OverlayOverridePlayerEnabled;
}

export interface OverlayExtraText {
  id: string;
  text: string;
  x: number;
  y: number;
  align?: "left" | "center" | "right";
  size?: number;
  color?: string;
  shadow?: boolean;
  visible?: boolean;
}

export interface OverlayOverrides {
  enabled?: OverlayOverrideEnabled;
  top?: OverlayOverrideTop;
  players?: Record<string, OverlayOverridePlayer>;
  extraTexts?: OverlayExtraText[];
  backgroundPreset?: string;
  overlayUrlParams?: Record<string, string>;
}

export interface OverlayPlayerView {
  id: string;
  nickname: string;
  connected?: boolean;
  alive: boolean;
  biology?: OverlayBiologyView;
  tags: {
    sex: OverlayTagView;
    age: OverlayTagView;
    orientation: OverlayTagView;
  };
  categories: OverlayCategoryView[];
}

export interface OverlayTopCardItem {
  title: string;
  subtitle?: string;
  imageId?: string;
}

export interface OverlayState {
  roomId: string;
  locale?: CardLocale;
  playerCount: number;
  top: {
    bunker: {
      revealed: number;
      total: number;
      lines: string[];
      items?: OverlayTopCardItem[];
    };
    catastrophe: {
      text: string;
      title?: string;
      imageId?: string;
    };
    threats: {
      revealed: number;
      total: number;
      lines: string[];
      items?: OverlayTopCardItem[];
    };
  };
  players: OverlayPlayerView[];
  overrides?: OverlayOverrides;
}

export const OverlayTagViewSchema = z.object({
  label: z.string(),
  revealed: z.boolean(),
  value: z.string(),
});

export const OverlayBiologyViewSchema = z.object({
  kind: z.union([z.literal("traits"), z.literal("special")]),
  cardId: z.string().optional(),
  specialType: z.string().optional(),
  shortLabel: z.string().optional(),
  fullLabel: z.string().optional(),
});

export const OverlayCategoryViewSchema = z.object({
  key: z.string(),
  label: z.string(),
  revealed: z.boolean(),
  value: z.string(),
  imgUrl: z.string().optional(),
});

export const OverlayOverrideEnabledSchema = z.object({
  topBunker: z.boolean().optional(),
  topCatastrophe: z.boolean().optional(),
  topThreats: z.boolean().optional(),
  playerNames: z.boolean().optional(),
  playerTraits: z.boolean().optional(),
  playerCategories: z.boolean().optional(),
});

export const OverlayOverrideTopSchema = z.object({
  bunkerLines: z.array(z.string().max(120)).max(5).optional(),
  catastropheText: z.string().max(600).optional(),
  threatsLines: z.array(z.string().max(120)).max(6).optional(),
});

export const OverlayOverridePlayerTraitsSchema = z.object({
  sex: z.string().max(120).optional(),
  age: z.string().max(120).optional(),
  orient: z.string().max(120).optional(),
});

export const OverlayOverridePlayerEnabledSchema = z.object({
  name: z.boolean().optional(),
  traits: z.boolean().optional(),
  categories: z.record(z.string().max(40), z.boolean()).optional(),
});

export const OverlayOverridePlayerSchema = z.object({
  name: z.string().max(24).optional(),
  traits: OverlayOverridePlayerTraitsSchema.optional(),
  categories: z.record(z.string().max(120)).optional(),
  enabled: OverlayOverridePlayerEnabledSchema.optional(),
});

export const OverlayExtraTextSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(120),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  align: z.union([z.literal("left"), z.literal("center"), z.literal("right")]).optional(),
  size: z.number().min(8).max(96).optional(),
  color: z.string().max(32).optional(),
  shadow: z.boolean().optional(),
  visible: z.boolean().optional(),
});

export const OverlayOverridesSchema = z.object({
  enabled: OverlayOverrideEnabledSchema.optional(),
  top: OverlayOverrideTopSchema.optional(),
  players: z.record(OverlayOverridePlayerSchema).optional(),
  extraTexts: z.array(OverlayExtraTextSchema).optional(),
  backgroundPreset: z.string().min(1).max(64).optional(),
  overlayUrlParams: z.record(z.string().min(1).max(64), z.string().min(1).max(256)).optional(),
});

export const OverlayPlayerViewSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  connected: z.boolean().optional(),
  alive: z.boolean(),
  biology: OverlayBiologyViewSchema.optional(),
  tags: z.object({
    sex: OverlayTagViewSchema,
    age: OverlayTagViewSchema,
    orientation: OverlayTagViewSchema,
  }),
  categories: z.array(OverlayCategoryViewSchema),
});

export const OverlayStateSchema = z.object({
  roomId: z.string(),
  locale: CardLocaleSchema.optional(),
  playerCount: z.number().int().nonnegative(),
  top: z.object({
    bunker: z.object({
      revealed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      lines: z.array(z.string()),
      items: z.array(
        z.object({
          title: z.string(),
          subtitle: z.string().optional(),
          imageId: z.string().optional(),
        })
      ).optional(),
    }),
    catastrophe: z.object({
      text: z.string(),
      title: z.string().optional(),
      imageId: z.string().optional(),
    }),
    threats: z.object({
      revealed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      lines: z.array(z.string()),
      items: z.array(
        z.object({
          title: z.string(),
          subtitle: z.string().optional(),
          imageId: z.string().optional(),
        })
      ).optional(),
    }),
  }),
  players: z.array(OverlayPlayerViewSchema),
  overrides: OverlayOverridesSchema.optional(),
});
