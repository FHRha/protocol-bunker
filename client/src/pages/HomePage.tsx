import { useEffect, useMemo, useState } from "react";
import type { ScenarioMeta } from "@bunker/shared";
import { DEV_TAB_IDENTITY } from "../config";
import { ru } from "../i18n/ru";
import RulesModal from "../components/RulesModal";

const GITHUB_URL = "https://github.com/FHRha";

interface HomePageProps {
  scenarios: ScenarioMeta[];
  scenariosLoading: boolean;
  onCreate: (name: string, scenarioId: string) => void;
  onJoin: (name: string, roomCode: string) => void;
  devBadgeActive?: boolean;
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

  useEffect(() => {
    if (!scenarioId && scenarios.length > 0) {
      setScenarioId(scenarios[0].id);
    }
  }, [scenarioId, scenarios]);

  const hasName = name.trim().length > 0;
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const rulesButtonLabel = "\u041f\u0440\u0430\u0432\u0438\u043b\u0430";

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
            <h1>{ru.homeTitle}</h1>
            <p>{ru.homeSubtitle}</p>
          </div>
          {showDevBadge ? <span className="pill">{ru.devBadge}</span> : null}
        </div>
      </section>

      <section className="panel">
        <h2>{ru.nameTitle}</h2>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={ru.namePlaceholder}
        />
      </section>

      <div className="grid">
        <section className="panel">
          <h2>{ru.createRoomTitle}</h2>
          <div className="section-body">
            {scenariosLoading ? (
              <div className="muted">{ru.scenariosLoading}</div>
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
                      <strong>{scenario.name}</strong>
                      <span className="muted">
                        {scenario.description ? ` ${scenario.description}` : ""}
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
              {ru.createButton}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>{ru.joinRoomTitle}</h2>
          <div className="section-body">
            <input
              type="text"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder={ru.joinRoomPlaceholder}
            />
            <button
              className="primary"
              disabled={!hasName || normalizedRoomCode.length === 0}
              onClick={() => onJoin(name.trim(), normalizedRoomCode)}
            >
              {ru.joinButton}
            </button>
            <div className="muted">
              {showDevBadge ? ru.devHint : ru.prodHint}
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
        aria-label="GitHub автора"
      >
        Сделано FHR · GitHub
      </a>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
