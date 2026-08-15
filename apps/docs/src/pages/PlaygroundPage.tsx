import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  SvgDiagnostic,
  SvgMotionController,
  SvgSource,
} from "@baolq/svg-motion";
import type { SvgMotionHandle, SvgMotionStatus } from "@baolq/svg-motion/react";
import { MotionPreview } from "../components/MotionPreview";
import { specimens, specimenBySlug } from "../specimens/specimens";
import { usePageMeta } from "../hooks/usePageMeta";

type Preset = "draw" | "fade" | "scale" | "stagger" | "pulse";
type SourceMode = "specimen" | "markup" | "url" | "file";
type Tab = "preview" | "source" | "diagnostics";
const presets: readonly Preset[] = [
  "draw",
  "fade",
  "scale",
  "stagger",
  "pulse",
];

function safeError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error.code;
  return error instanceof Error ? error.message : String(error);
}

export function PlaygroundPage() {
  usePageMeta({
    title: "Playground",
    description:
      "Inspect every SVG Motion preset and controller action against local or arbitrary SVG sources.",
    canonicalPath: "/playground",
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSpecimen = specimenBySlug(
    searchParams.get("icon") ?? "mango-juice",
  );
  const initialPreset = presets.includes(searchParams.get("preset") as Preset)
    ? (searchParams.get("preset") as Preset)
    : "draw";
  const motionRef = useRef<SvgMotionHandle>(null);
  const editorTimer = useRef<number | null>(null);
  const [selected, setSelected] = useState(initialSpecimen);
  const [source, setSource] = useState<SvgSource>(initialSpecimen.source);
  const [sourceMode, setSourceMode] = useState<SourceMode>("specimen");
  const [sourceText, setSourceText] = useState("");
  const [editor, setEditor] = useState("");
  const [url, setUrl] = useState("");
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [duration, setDuration] = useState(1200);
  const [easing, setEasing] = useState("ease-in-out");
  const [stagger, setStagger] = useState<"auto" | number>("auto");
  const [autoplay, setAutoplay] = useState(false);
  const [progress, setProgress] = useState(0);
  const [revision, setRevision] = useState(0);
  const [readySequence, setReadySequence] = useState(0);
  const [status, setStatus] = useState<SvgMotionStatus>("loading");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [diagnostics, setDiagnostics] = useState<readonly SvgDiagnostic[]>([]);
  const [tab, setTab] = useState<Tab>("preview");

  useEffect(
    () => () => {
      if (editorTimer.current !== null)
        window.clearTimeout(editorTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (sourceMode !== "specimen") return;
    const controller = new AbortController();
    void fetch(selected.source, { signal: controller.signal })
      .then((response) => response.text())
      .then(setSourceText)
      .catch(() => undefined);
    return () => controller.abort();
  }, [selected, sourceMode]);

  const updateQuery = (icon: string, nextPreset: Preset) => {
    setSearchParams({ icon, preset: nextPreset }, { replace: true });
  };
  const beginRemount = () => {
    setReady(false);
    setStatus("loading");
    setError(null);
    setDiagnostics([]);
  };
  const remount = (nextSource = source) => {
    beginRemount();
    setSource(nextSource);
    setRevision((value) => value + 1);
  };
  const chooseSpecimen = (slug: string) => {
    const next = specimenBySlug(slug);
    setSelected(next);
    setSourceMode("specimen");
    setEditor("");
    setSourceText("");
    updateQuery(next.slug, preset);
    remount(next.source);
  };
  const run = (action: (controller: SvgMotionController) => void) => {
    const controller = motionRef.current?.controller;
    if (!controller) return;
    try {
      action(controller);
      setStatus(controller.state);
      setDiagnostics(controller.diagnostics);
    } catch (nextError) {
      setError(nextError);
      setStatus("error");
      setReady(false);
    }
  };
  const loadUrl = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const next = new URL(url, window.location.href);
      setSourceMode("url");
      setSourceText(next.href);
      remount(next);
    } catch (nextError) {
      setError(nextError);
      setStatus("error");
      setReady(false);
    }
  };
  const updateMarkup = (markup: string) => {
    setEditor(markup);
    setSourceText(markup);
    setSourceMode("markup");
    if (editorTimer.current !== null) window.clearTimeout(editorTimer.current);
    beginRemount();
    editorTimer.current = window.setTimeout(() => {
      remount(markup);
      editorTimer.current = null;
    }, 250);
  };

  return (
    <main className="playground-page">
      <header className="playground-heading">
        <div>
          <p className="eyebrow">CONTROL SURFACE / PACKAGE 0.1.0</p>
          <h1>SVG Motion Playground</h1>
        </div>
        <p>
          Load any valid SVG, compare presets, and inspect the native controller
          without leaving the page.
        </p>
      </header>
      <div className="playground-grid">
        <aside className="specimen-rail" aria-label="Beverage specimens">
          <header>
            <span>SPECIMEN LIBRARY</span>
            <strong>21</strong>
          </header>
          <div className="specimen-list">
            {specimens.map((item, index) => (
              <button
                key={item.slug}
                type="button"
                className={
                  selected.slug === item.slug && sourceMode === "specimen"
                    ? "is-selected"
                    : ""
                }
                onClick={() => chooseSpecimen(item.slug)}
                aria-pressed={
                  selected.slug === item.slug && sourceMode === "specimen"
                }
              >
                <span className="specimen-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <img src={item.source} alt="" />
                <span>
                  <strong>{item.label}</strong>
                  <small lang="zh">{item.chineseName}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="playground-stage" aria-label="Live stage">
          <header>
            <div>
              <span>LIVE STAGE</span>
              <strong>
                {sourceMode === "specimen"
                  ? selected.label
                  : sourceMode.toUpperCase()}
              </strong>
            </div>
            <output role="status" data-motion-status>
              {status}
            </output>
          </header>
          <div className="stage-tabs" role="tablist" aria-label="Stage views">
            {(["preview", "source", "diagnostics"] as const).map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            className="stage-body"
            data-stage
            data-ready-sequence={readySequence}
          >
            {tab === "preview" ? (
              <MotionPreview
                ref={motionRef}
                source={source}
                label={
                  sourceMode === "specimen"
                    ? selected.label
                    : "Custom SVG source"
                }
                preset={preset}
                duration={duration}
                easing={easing}
                stagger={stagger}
                autoplay={autoplay}
                revision={revision}
                onReady={(handle) => {
                  setReady(Boolean(handle.controller));
                  setStatus(handle.controller?.state ?? "loading");
                  setDiagnostics(handle.controller?.diagnostics ?? []);
                  setError(null);
                  setReadySequence((value) => value + 1);
                }}
                onFinish={() => setStatus("finished")}
                onCancel={() => setStatus("cancelled")}
                onError={(nextError) => {
                  setError(nextError);
                  setStatus("error");
                  setReady(false);
                }}
              />
            ) : null}
            {tab === "source" ? (
              <div className="source-view">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(sourceText)
                  }
                >
                  Copy source
                </button>
                <pre>
                  <code>
                    {sourceText ||
                      "Source is available after the local specimen loads."}
                  </code>
                </pre>
              </div>
            ) : null}
            {tab === "diagnostics" ? (
              <div className="diagnostic-view">
                <dl>
                  <div>
                    <dt>Package</dt>
                    <dd>0.1.0</dd>
                  </div>
                  <div>
                    <dt>Controller</dt>
                    <dd>{status}</dd>
                  </div>
                  <div>
                    <dt>Preset</dt>
                    <dd>{preset}</dd>
                  </div>
                </dl>
                {error ? <p role="alert">{safeError(error)}</p> : null}
                <ul>
                  {diagnostics.length ? (
                    diagnostics.map((item, index) => (
                      <li key={`${item.code}-${index}`}>{item.code}</li>
                    ))
                  ) : (
                    <li>No diagnostics.</li>
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="control-inspector" aria-label="Control inspector">
          <header>
            <span>CONTROL INSPECTOR</span>
            <strong>{ready ? "ARMED" : "WAIT"}</strong>
          </header>
          <fieldset className="source-mode">
            <legend>Source</legend>
            {(["specimen", "markup", "url", "file"] as const).map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="source-mode"
                  checked={sourceMode === mode}
                  onChange={() => setSourceMode(mode)}
                />
                {mode}
              </label>
            ))}
          </fieldset>
          {sourceMode === "markup" ? (
            <label className="field">
              SVG markup
              <textarea
                aria-label="SVG markup"
                value={editor}
                onChange={(event) => updateMarkup(event.currentTarget.value)}
                spellCheck={false}
              />
            </label>
          ) : null}
          {sourceMode === "url" ? (
            <form noValidate onSubmit={loadUrl} className="field">
              <label htmlFor="svg-url">SVG URL</label>
              <input
                id="svg-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.currentTarget.value)}
              />
              <button type="submit">Load URL</button>
            </form>
          ) : null}
          {sourceMode === "file" ? (
            <label className="field">
              SVG file
              <input
                aria-label="SVG file"
                type="file"
                accept=".svg,image/svg+xml"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) {
                    setSourceText(file.name);
                    remount(file);
                  }
                }}
              />
            </label>
          ) : null}
          <div className="inspector-fields">
            <label className="field">
              Preset
              <select
                aria-label="Preset"
                value={preset}
                onChange={(event) => {
                  const next = event.currentTarget.value as Preset;
                  setPreset(next);
                  updateQuery(selected.slug, next);
                  remount();
                }}
              >
                {presets.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Duration (ms)
              <input
                aria-label="Duration (ms)"
                type="number"
                min="0"
                value={duration}
                onChange={(event) => {
                  setDuration(Number(event.currentTarget.value));
                  remount();
                }}
              />
            </label>
            <label className="field">
              Easing
              <input
                aria-label="Easing"
                value={easing}
                onChange={(event) => {
                  setEasing(event.currentTarget.value);
                  remount();
                }}
              />
            </label>
            <label className="field">
              Stagger
              <select
                aria-label="Stagger"
                value={stagger}
                onChange={(event) => {
                  setStagger(
                    event.currentTarget.value === "auto"
                      ? "auto"
                      : Number(event.currentTarget.value),
                  );
                  remount();
                }}
              >
                <option value="auto">Auto</option>
                <option value="50">50 ms</option>
                <option value="120">120 ms</option>
              </select>
            </label>
            <label className="toggle">
              <input
                aria-label="Autoplay"
                type="checkbox"
                checked={autoplay}
                onChange={(event) => {
                  setAutoplay(event.currentTarget.checked);
                  remount();
                }}
              />
              <span>Autoplay</span>
            </label>
          </div>
          <label className="field">
            Seek <output>{progress}%</output>
            <input
              aria-label="Progress"
              type="range"
              min="0"
              max="100"
              value={progress}
              disabled={!ready}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                setProgress(next);
                run((controller) => controller.seek(next / 100));
              }}
            />
          </label>
          <div className="transport" aria-label="Motion transport">
            {(
              [
                "Play",
                "Pause",
                "Reverse",
                "Restart",
                "Finish",
                "Cancel",
              ] as const
            ).map((action) => (
              <button
                key={action}
                type="button"
                disabled={!ready}
                onClick={() =>
                  run((controller) => {
                    controller[
                      action.toLowerCase() as
                        | "play"
                        | "pause"
                        | "reverse"
                        | "restart"
                        | "finish"
                        | "cancel"
                    ]();
                  })
                }
              >
                {action}
              </button>
            ))}
          </div>
          {error ? <p role="alert">{safeError(error)}</p> : null}
        </aside>
      </div>
    </main>
  );
}
