import { useEffect, useRef, useState } from "react";
import {
  type SvgDiagnostic,
  type SvgMotionController,
  type SvgSource,
} from "@baole-space/svg-motion";
import {
  SvgMotion,
  type SvgMotionHandle,
  type SvgMotionStatus,
} from "@baole-space/svg-motion/react";
import {
  DEFAULT_FIXTURE,
  DEMO_FIXTURES,
  fixtureById,
  type DemoFixture,
  type PresetName,
} from "./fixtures";

type SourceMode = "markup" | "url" | "file";

const PRESETS: readonly PresetName[] = [
  "draw",
  "fade",
  "scale",
  "stagger",
  "pulse",
];

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string") return code;
  }
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const motionRef = useRef<SvgMotionHandle>(null);
  const labHeadingRef = useRef<HTMLHeadingElement>(null);
  const markupTimeoutRef = useRef<number | null>(null);
  const readySequenceRef = useRef(0);
  const [sourceMode, setSourceMode] = useState<SourceMode>("markup");
  const [source, setSource] = useState<SvgSource>(DEFAULT_FIXTURE.source);
  const [sourceEditor, setSourceEditor] = useState(DEFAULT_FIXTURE.source);
  const [sourceUrl, setSourceUrl] = useState("");
  const [activeTitle, setActiveTitle] = useState(DEFAULT_FIXTURE.title);
  const [preset, setPreset] = useState<PresetName>(DEFAULT_FIXTURE.preset);
  const [duration, setDuration] = useState(1200);
  const [easing, setEasing] = useState("ease-in-out");
  const [stagger, setStagger] = useState<"auto" | number>("auto");
  const [autoplay, setAutoplay] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [readySequence, setReadySequence] = useState(0);
  const [controllerReady, setControllerReady] = useState(false);
  const [status, setStatus] = useState<SvgMotionStatus>("loading");
  const [diagnostics, setDiagnostics] = useState<readonly SvgDiagnostic[]>([]);
  const [error, setError] = useState<unknown>(null);
  const transportDisabled = !controllerReady;

  const beginRemount = () => {
    setControllerReady(false);
    setError(null);
    setStatus("loading");
  };

  const clearMarkupTimeout = () => {
    if (markupTimeoutRef.current !== null) {
      window.clearTimeout(markupTimeoutRef.current);
      markupTimeoutRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearMarkupTimeout();
    },
    [],
  );

  const run = (action: (controller: SvgMotionController) => void) => {
    const controller = motionRef.current?.controller;
    if (!controller) return;
    try {
      action(controller);
      setStatus(controller.state);
      setDiagnostics(controller.diagnostics);
    } catch (nextError) {
      setError(nextError);
      setControllerReady(false);
      setStatus("error");
    }
  };

  const applySource = (nextSource: SvgSource, title = activeTitle) => {
    beginRemount();
    setActiveTitle(title);
    setSource(nextSource);
    setSourceRevision((current) => current + 1);
  };

  const openFixture = (fixture: DemoFixture) => {
    clearMarkupTimeout();
    setSourceMode("markup");
    setSourceEditor(fixture.source);
    setPreset(fixture.preset);
    applySource(fixture.source, fixture.title);
    labHeadingRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  };

  const loadFixture = (id: string) => openFixture(fixtureById(id));

  const resetSource = () => {
    setSourceUrl("");
    openFixture(DEFAULT_FIXTURE);
  };

  const submitUrl = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      applySource(new URL(sourceUrl, window.location.href), "SVG from URL");
    } catch (nextError) {
      setError(nextError);
      setControllerReady(false);
      setStatus("error");
    }
  };

  const changeSourceMode = (nextMode: SourceMode) => {
    if (nextMode !== "markup") clearMarkupTimeout();
    setSourceMode(nextMode);
  };

  const updateMarkup = (nextMarkup: string) => {
    setSourceEditor(nextMarkup);
    clearMarkupTimeout();
    markupTimeoutRef.current = window.setTimeout(() => {
      applySource(nextMarkup, "Custom SVG markup");
      markupTimeoutRef.current = null;
    }, 250);
  };

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <p className="eyebrow">Interactive plotting desk</p>
        <h1 ref={labHeadingRef}>SVG Motion Lab</h1>
        <p>
          Inspect the public controller against SVG sources, presets, and timing
          controls.
        </p>
      </header>

      <section className="lab-grid" aria-label="SVG motion playground">
        <div className="control-panel">
          <div className="field-group">
            <label htmlFor="fixture">Fixture</label>
            <select
              id="fixture"
              value={
                DEMO_FIXTURES.find((item) => item.title === activeTitle)?.id ??
                ""
              }
              onChange={(event) => loadFixture(event.currentTarget.value)}
            >
              {DEMO_FIXTURES.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <fieldset className="source-modes">
              <legend>Source mode</legend>
              <label>
                <input
                  type="radio"
                  name="source-mode"
                  checked={sourceMode === "markup"}
                  onChange={() => changeSourceMode("markup")}
                />
                Markup source
              </label>
              <label>
                <input
                  type="radio"
                  name="source-mode"
                  checked={sourceMode === "url"}
                  onChange={() => changeSourceMode("url")}
                />
                URL source
              </label>
              <label>
                <input
                  type="radio"
                  name="source-mode"
                  checked={sourceMode === "file"}
                  onChange={() => changeSourceMode("file")}
                />
                File source
              </label>
            </fieldset>
          </div>

          {sourceMode === "markup" ? (
            <div className="field-group">
              <label htmlFor="source-editor">SVG markup</label>
              <textarea
                id="source-editor"
                data-testid="source-editor"
                value={sourceEditor}
                onChange={(event) => updateMarkup(event.currentTarget.value)}
                spellCheck={false}
              />
            </div>
          ) : null}

          {sourceMode === "url" ? (
            <form className="source-form" noValidate onSubmit={submitUrl}>
              <label htmlFor="source-url">SVG URL</label>
              <div className="source-form-row">
                <input
                  id="source-url"
                  data-testid="source-url"
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.currentTarget.value)}
                  placeholder="https://example.com/diagram.svg"
                  required
                />
                <button type="submit">Load URL</button>
              </div>
            </form>
          ) : null}

          {sourceMode === "file" ? (
            <div className="field-group">
              <label htmlFor="source-file">SVG file</label>
              <input
                id="source-file"
                data-testid="source-file"
                type="file"
                accept=".svg,image/svg+xml"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) applySource(file, file.name);
                }}
              />
            </div>
          ) : null}

          <button type="button" className="quiet-button" onClick={resetSource}>
            Reset source
          </button>

          <div className="timing-fields">
            <div className="field-group">
              <label htmlFor="preset">Preset</label>
              <select
                id="preset"
                data-testid="preset"
                value={preset}
                onChange={(event) => {
                  beginRemount();
                  setPreset(event.currentTarget.value as PresetName);
                }}
              >
                {PRESETS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="duration">Duration (ms)</label>
              <input
                id="duration"
                data-testid="duration"
                type="number"
                min="0"
                value={duration}
                onChange={(event) => {
                  beginRemount();
                  setDuration(Number(event.currentTarget.value));
                }}
              />
            </div>
            <div className="field-group">
              <label htmlFor="easing">Easing</label>
              <input
                id="easing"
                data-testid="easing"
                value={easing}
                onChange={(event) => {
                  beginRemount();
                  setEasing(event.currentTarget.value);
                }}
              />
            </div>
            <div className="field-group">
              <label htmlFor="stagger">Stagger</label>
              <select
                id="stagger"
                data-testid="stagger"
                value={stagger}
                onChange={(event) => {
                  beginRemount();
                  setStagger(
                    event.currentTarget.value === "auto"
                      ? "auto"
                      : Number(event.currentTarget.value),
                  );
                }}
              >
                <option value="auto">Auto</option>
                <option value="50">50 ms</option>
                <option value="120">120 ms</option>
              </select>
            </div>
            <label className="checkbox-label" htmlFor="autoplay">
              <input
                id="autoplay"
                data-testid="autoplay"
                type="checkbox"
                checked={autoplay}
                onChange={(event) => {
                  beginRemount();
                  setAutoplay(event.currentTarget.checked);
                }}
              />
              Autoplay
            </label>
          </div>

          <div className="field-group">
            <label htmlFor="progress">Progress</label>
            <input
              id="progress"
              data-testid="progress"
              type="range"
              min="0"
              max="100"
              value={progress}
              disabled={transportDisabled}
              onChange={(event) => {
                const nextProgress = Number(event.currentTarget.value);
                setProgress(nextProgress);
                run((controller) => controller.seek(nextProgress / 100));
              }}
            />
          </div>

          <div className="transport" aria-label="Motion transport">
            <button
              type="button"
              disabled={transportDisabled}
              onClick={() => run((controller) => controller.play())}
            >
              Play
            </button>
            <button
              type="button"
              disabled={transportDisabled}
              onClick={() => run((controller) => controller.pause())}
            >
              Pause
            </button>
            <button
              type="button"
              disabled={transportDisabled}
              onClick={() => run((controller) => controller.reverse())}
            >
              Reverse
            </button>
            <button
              type="button"
              disabled={transportDisabled}
              onClick={() => run((controller) => controller.restart())}
            >
              Restart
            </button>
            <button
              type="button"
              disabled={transportDisabled}
              onClick={() => run((controller) => controller.finish())}
            >
              Finish
            </button>
            <button
              type="button"
              disabled={transportDisabled}
              onClick={() => run((controller) => controller.cancel())}
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="stage-panel">
          <div className="stage-meta">
            <p>{activeTitle}</p>
            <output role="status" data-motion-status aria-live="polite">
              {status}
            </output>
          </div>
          <div data-stage data-ready-sequence={readySequence}>
            <SvgMotion
              key={sourceRevision}
              ref={motionRef}
              className="motion-stage"
              source={source}
              preset={preset}
              autoplay={autoplay}
              duration={duration}
              easing={easing}
              stagger={stagger}
              svgProps={{ role: "img", "aria-label": activeTitle }}
              onReady={(handle) => {
                setStatus(handle.controller?.state ?? "loading");
                setControllerReady(handle.controller !== null);
                setDiagnostics(handle.controller?.diagnostics ?? []);
                setError(null);
                readySequenceRef.current += 1;
                setReadySequence(readySequenceRef.current);
              }}
              onFinish={() => setStatus("finished")}
              onCancel={() => setStatus("cancelled")}
              onError={(nextError) => {
                setError(nextError);
                setControllerReady(false);
                setStatus("error");
              }}
            />
          </div>
          {error ? <p role="alert">{errorMessage(error)}</p> : null}
          {diagnostics.length > 0 ? (
            <p className="diagnostics">
              Diagnostics: {diagnostics.map(({ code }) => code).join(", ")}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="gallery-title" className="gallery-section">
        <header>
          <p className="eyebrow">Specimen library · 05</p>
          <h2 id="gallery-title">One engine, different drawing systems.</h2>
        </header>
        <div className="gallery-grid">
          {DEMO_FIXTURES.map((fixture) => (
            <article className="specimen-card" key={fixture.id}>
              <div className="specimen-preview" aria-hidden="true">
                <SvgMotion
                  source={fixture.source}
                  preset={fixture.preset}
                  duration={900}
                  svgProps={{
                    role: "img",
                    "aria-label": `${fixture.title} preview`,
                  }}
                />
              </div>
              <h3>{fixture.title}</h3>
              <p>{fixture.description}</p>
              <ul aria-label={`${fixture.title} capabilities`}>
                {fixture.capability.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <button type="button" onClick={() => openFixture(fixture)}>
                Open {fixture.title} in Lab
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
