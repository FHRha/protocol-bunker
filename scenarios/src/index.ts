import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ScenarioModule } from "@bunker/shared";

const EXCLUDED_FILES = new Set(["index.ts", "index.js", "index.d.ts", "index.d.ts.map"]);

export async function loadScenarios(): Promise<ScenarioModule[]> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const files = (await fs.readdir(here)) as string[];
  const scenarioFiles = files.filter((file: string) => {
    if (EXCLUDED_FILES.has(file)) return false;
    if (file.endsWith(".d.ts") || file.endsWith(".map")) return false;
    return file.endsWith(".ts") || file.endsWith(".js");
  });

  const scenarios: ScenarioModule[] = [];

  for (const file of scenarioFiles) {
    const fileUrl = pathToFileURL(path.join(here, file)).href;
    try {
      const mod = await import(fileUrl);
      const scenario: ScenarioModule | undefined = mod.scenario ?? mod.default;
      if (scenario) {
        scenarios.push(scenario);
      }
    } catch (error) {
      console.warn(`Failed to load scenario module: ${file}`, error);
    }
  }

  return scenarios;
}

export type { ScenarioModule } from "@bunker/shared";
