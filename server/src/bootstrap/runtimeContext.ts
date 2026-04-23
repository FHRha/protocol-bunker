import type { AssetCatalog, ScenarioModule } from "@bunker/shared";
import { loadScenarios } from "@bunker/scenarios";
import { buildAssetCatalog } from "../assets/catalog.js";

interface CreateRuntimeContextOptions {
  assetsRoot: string;
  devScenariosEnabled: boolean;
}

export interface RuntimeContext {
  assets: AssetCatalog;
  availableScenarios: ScenarioModule[];
  scenarioMap: Map<string, ScenarioModule>;
  controlDeckCatalog: Record<string, Array<{ id: string; labelShort: string }>>;
}

export async function createRuntimeContext(options: CreateRuntimeContextOptions): Promise<RuntimeContext> {
  const assets = buildAssetCatalog(options.assetsRoot);
  const controlDeckCatalog = Object.fromEntries(
    Object.entries(assets.decks).map(([deckName, cards]) => [
      deckName,
      cards.map((card) => ({ id: card.id, labelShort: card.labelShort })),
    ])
  );

  const scenarios = await loadScenarios();
  const availableScenarios = scenarios.filter(
    (scenario) => !(scenario.meta.devOnly && !options.devScenariosEnabled)
  );
  const scenarioMap = new Map<string, ScenarioModule>(availableScenarios.map((scenario) => [scenario.meta.id, scenario]));

  return {
    assets,
    availableScenarios,
    scenarioMap,
    controlDeckCatalog,
  };
}
