import { useEffect, useMemo, useState } from "react";
import type { ScenarioMeta } from "@bunker/shared";
import { DEV_TAB_IDENTITY } from "../config";
import { useUiLocaleNamespace, useUiLocaleNamespacesActivation } from "../localization";
import RulesModal from "../components/RulesModal";
import classicScenarioRu from "../../../locales/scenario/classic/ru.json";
import classicScenarioEn from "../../../locales/scenario/classic/en.json";
import devTestScenarioRu from "../../../locales/scenario/dev_test/ru.json";
import devTestScenarioEn from "../../../locales/scenario/dev_test/en.json";

const GITHUB_URL = "https://github.com/FHRha";

interface HomePageProps {
  scenarios: ScenarioMeta[];
  scenariosLoading: boolean;
  onCreate: (name: string, scenarioId: string) => void;
  onJoin: (name: string, roomCode: string) => void;
  devBadgeActive?: boolean;
}

const SCENARIO_DESCRIPTIONS = {
  ru: {
    classic: classicScenarioRu["meta.description"] ?? "",
    dev_test: devTestScenarioRu["meta.description"] ?? "",
  },
  en: {
    classic: classicScenarioEn["meta.description"] ?? "",
    dev_test: devTestScenarioEn["meta.description"] ?? "",
  },
} as const;

const SCENARIO_NAMES = {
  ru: {
    classic: classicScenarioRu["meta.name"] ?? "Классический бункер",
    dev_test: devTestScenarioRu["meta.name"] ?? "Dev test scenario",
  },
  en: {
    classic: classicScenarioEn["meta.name"] ?? "Classic Bunker",
    dev_test: devTestScenarioEn["meta.name"] ?? "Dev Test Scenario",
  },
} as const;

function getScenarioName(
  locale: "ru" | "en",
  scenarioId: string,
  fallback?: string,
): string {
  return SCENARIO_NAMES[locale][scenarioId as "classic" | "dev_test"] ?? fallback ?? scenarioId;
}

function getScenarioDescription(
  locale: "ru" | "en",
  scenarioId: string,
  fallback?: string,
): string {
  return SCENARIO_DESCRIPTIONS[locale][scenarioId as "classic" | "dev_test"] ?? fallback ?? "";
}

export default function HomePage({
  scenarios,
  scenariosLoading,
  onCreate,
  onJoin,
  devBadgeActive,
}: HomePageProps) {
  const [name, setName] = useState(() => localStorage.getItem("bunker.playerName") ?? "");
  const [roomCode, setRoomCode] = useState("");
  const [scenarioId, setScenarioId] = useState<string>("");
  const [rulesOpen, setRulesOpen] = useState(false);
  useUiLocaleNamespacesActivation(["home", "common", "rules", "dev", "misc"]);
  const homeText = useUiLocaleNamespace("home", {
    fallbacks: ["common", "rules", "dev", "misc", "format"],
  });

  useEffect(() => {
    if (!scenarioId && scenarios.length > 0) {
      setScenarioId(scenarios[0].id);
    }
  }, [scenarioId, scenarios]);

  const hasName = name.trim().length > 0;
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const rulesButtonLabel = homeText.t("rulesButtonShort");

  const scenarioOptions = useMemo(() => {
    if (scenariosLoading) return [];
    return scenarios;
  }, [scenarios, scenariosLoading]);

  const showDevBadge = devBadgeActive ?? DEV_TAB_IDENTITY;

  return (
    <div className="stack home-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>{homeText.t("homeTitle")}</h1>
            <p>{homeText.t("homeSubtitle")}</p>
          </div>
          {showDevBadge ? <span className="pill">{homeText.t("devBadge")}</span> : null}
        </div>
      </section>

      <section className="panel">
        <h2>{homeText.t("nameTitle")}</h2>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={homeText.t("namePlaceholder")}
        />
      </section>

      <div className="grid">
        <section className="panel">
          <h2>{homeText.t("createRoomTitle")}</h2>
          <div className="section-body">
            {scenariosLoading ? (
              <div className="muted">{homeText.t("scenariosLoading")}</div>
            ) : (
              <div className="scenario-list">
                {scenarioOptions.map((scenario) => (
                  <label key={scenario.id} className="scenario-option">
                    <input
                      type="radio"
                      name="scenario"
                      checked={scenarioId === scenario.id}
                      onChange={() => setScenarioId(scenario.id)}
                    />
                    <span>
                      <strong>{getScenarioName(homeText.locale, scenario.id, scenario.name)}</strong>
					  <span className="muted">
						{(() => {
						  const description = getScenarioDescription(homeText.locale, scenario.id, scenario.description);
						  return description ? ` ${description}` : "";
						})()}
					  </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <button
              className="primary"
              disabled={!hasName || !scenarioId}
              onClick={() => onCreate(name.trim(), scenarioId)}
            >
              {homeText.t("createButton")}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>{homeText.t("joinRoomTitle")}</h2>
          <div className="section-body">
            <input
              type="text"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder={homeText.t("joinRoomPlaceholder")}
            />
            <button
              className="primary"
              disabled={!hasName || normalizedRoomCode.length === 0}
              onClick={() => onJoin(name.trim(), normalizedRoomCode)}
            >
              {homeText.t("joinButton")}
            </button>
            <div className="muted">
              {showDevBadge ? homeText.t("devHint") : homeText.t("prodHint")}
            </div>
          </div>
        </section>
      </div>
      <button className="ghost rulesButton" onClick={() => setRulesOpen(true)}>
        {rulesButtonLabel}
      </button>
      <a
        className="homeWatermark"
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={homeText.t("authorGithubAria")}
      >
        {homeText.t("authorGithubLabel")}
      </a>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

