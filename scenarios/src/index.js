import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const EXCLUDED_FILES = new Set(["index.ts", "index.js", "index.d.ts", "index.d.ts.map"]);
export async function loadScenarios() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const files = (await fs.readdir(here));
    const scenarioFiles = files.filter((file) => {
        if (EXCLUDED_FILES.has(file))
            return false;
        if (file.endsWith(".d.ts") || file.endsWith(".map"))
            return false;
        return file.endsWith(".ts") || file.endsWith(".js");
    });
    const scenarios = [];
    for (const file of scenarioFiles) {
        const fileUrl = pathToFileURL(path.join(here, file)).href;
        try {
            const mod = await import(fileUrl);
            const scenario = mod.scenario ?? mod.default;
            if (scenario) {
                scenarios.push(scenario);
            }
        }
        catch (error) {
            console.warn(`Failed to load scenario module: ${file}`, error);
        }
    }
    return scenarios;
}
