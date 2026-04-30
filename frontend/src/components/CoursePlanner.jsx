import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { RecommendCard } from "./RecommendCard";

const LS_KEY = "umd_course_planner";
const TESTUDO_URL = "https://app.testudo.umd.edu/#/main/uotrans";

function countRequired(reqs) {
  return (reqs.sections || [])
    .filter((s) => s.type === "required")
    .reduce((n, s) => n + (s.courses || []).length, 0);
}

function findBestMajorMatch(programs, detectedMajor) {
  if (!detectedMajor) return null;
  const base = detectedMajor
    .replace(/\s*-[^-]+\s+T\s*$/, "")
    .replace(/\s+T\s*$/, "")
    .trim().toLowerCase();
  const majors = programs.filter((p) => p.type === "major");
  return (
    majors.find((p) => p.name.toLowerCase() === base) ||
    majors.find((p) => p.name.toLowerCase().startsWith(base)) ||
    majors.find((p) => base.startsWith(p.name.toLowerCase())) ||
    null
  );
}

export default function CoursePlanner({ backendUrl, semesters, onOpenProfModal, transcriptEnabled = true }) {
  // Program selection
  const [programs, setPrograms]             = useState([]);
  const [majorQuery, setMajorQuery]         = useState("");
  const [major, setMajor]                   = useState(null);
  const [majorDropOpen, setMajorDropOpen]   = useState(false);
  const [major2Query, setMajor2Query]       = useState("");
  const [major2, setMajor2]                 = useState(null);
  const [major2DropOpen, setMajor2DropOpen] = useState(false);
  const [showMajor2, setShowMajor2]         = useState(false);
  const [minorQuery, setMinorQuery]         = useState("");
  const [minor, setMinor]                   = useState(null);
  const [minorDropOpen, setMinorDropOpen]   = useState(false);
  const [minor2Query, setMinor2Query]       = useState("");
  const [minor2, setMinor2]                 = useState(null);
  const [minor2DropOpen, setMinor2DropOpen] = useState(false);
  const [showMinor2, setShowMinor2]         = useState(false);

  // Requirements
  const [majorReqs, setMajorReqs]     = useState(null);
  const [major2Reqs, setMajor2Reqs]   = useState(null);
  const [minorReqs, setMinorReqs]     = useState(null);
  const [minor2Reqs, setMinor2Reqs]   = useState(null);
  const [loadingReqs, setLoadingReqs] = useState(false);

  // Transcript / completed courses
  const [completedCourses, setCompletedCourses]   = useState([]);
  const [manualInput, setManualInput]             = useState("");
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError]     = useState("");
  const [pasteMode, setPasteMode]                 = useState(false);
  const [pasteText, setPasteText]                 = useState("");
  const [waitingClipboard, setWaitingClipboard]   = useState(false);

  // Recommendations
  const [termId, setTermId]                   = useState(semesters[0]?.termId || "");
  const [interests, setInterests]             = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs]         = useState(false);
  const [recsError, setRecsError]             = useState("");
  const [termLabel, setTermLabel]             = useState("");

  // Best professor per recommendation card
  const [bestProfessors, setBestProfessors] = useState({});

  const majorRef         = useRef(null);
  const major2Ref        = useRef(null);
  const minorRef         = useRef(null);
  const minor2Ref        = useRef(null);
  const clipboardCleanup = useRef(null);
  const testudoWinRef    = useRef(null);

  // ── Sync semesters ────────────────────────────────────────────────────────
  useEffect(() => {
    if (semesters.length && !termId) setTermId(semesters[0].termId);
  }, [semesters]);

  // ── Fetch programs ────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${backendUrl}/api/programs`).then((r) => setPrograms(r.data)).catch(() => {});
  }, [backendUrl]);

  // ── localStorage: restore on mount ───────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    try {
      const d = JSON.parse(saved);
      if (d.completedCourses?.length) setCompletedCourses(d.completedCourses);
      if (d.major)      { setMajor(d.major);   setMajorQuery(d.major.name); }
      if (d.majorReqs)    setMajorReqs(d.majorReqs);
      if (d.major2)     { setMajor2(d.major2); setMajor2Query(d.major2.name); setShowMajor2(true); }
      if (d.major2Reqs)   setMajor2Reqs(d.major2Reqs);
      if (d.minor)      { setMinor(d.minor);   setMinorQuery(d.minor.name); }
      if (d.minorReqs)    setMinorReqs(d.minorReqs);
      if (d.minor2)     { setMinor2(d.minor2); setMinor2Query(d.minor2.name); setShowMinor2(true); }
      if (d.minor2Reqs)   setMinor2Reqs(d.minor2Reqs);
      if (d.recommendations?.length) setRecommendations(d.recommendations);
      if (d.termLabel)    setTermLabel(d.termLabel);
      if (d.interests)    setInterests(d.interests);
    } catch (_) {}
  }, []);

  // ── localStorage: persist on change ──────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({
      completedCourses,
      major, majorReqs, major2, major2Reqs,
      minor, minorReqs, minor2, minor2Reqs,
      recommendations, termLabel, interests,
    }));
  }, [completedCourses, major, majorReqs, major2, major2Reqs, minor, minorReqs, minor2, minor2Reqs, recommendations, termLabel, interests]);

  // ── Fetch best professors after recommendations load ──────────────────────
  useEffect(() => {
    if (!recommendations.length || !termId) { setBestProfessors({}); return; }
    const done = new Set(completedCourses.map((c) => c.course_id));
    const ids  = recommendations.filter((r) => !done.has(r.course_id)).map((r) => r.course_id);
    if (!ids.length) return;
    axios
      .post(`${backendUrl}/api/best-professors`, { courseIds: ids, termId }, { timeout: 40000 })
      .then((r) => setBestProfessors(r.data.professors || {}))
      .catch(() => {});
  }, [recommendations, termId, completedCourses]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (majorRef.current  && !majorRef.current.contains(e.target))  setMajorDropOpen(false);
      if (major2Ref.current && !major2Ref.current.contains(e.target)) setMajor2DropOpen(false);
      if (minorRef.current  && !minorRef.current.contains(e.target))  setMinorDropOpen(false);
      if (minor2Ref.current && !minor2Ref.current.contains(e.target)) setMinor2DropOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  // ── Filtered dropdown lists (no artificial cap — user can scroll all) ─────
  const matchesQuery = (p, q) => {
    const lq = q.toLowerCase();
    return p.name.toLowerCase().includes(lq) || (p.school || "").toLowerCase().includes(lq);
  };
  const filteredMajors  = programs.filter((p) => p.type === "major" && matchesQuery(p, majorQuery));
  const filteredMajors2 = programs.filter((p) => p.type === "major" && matchesQuery(p, major2Query));
  const filteredMinors  = programs.filter((p) => p.type === "minor" && matchesQuery(p, minorQuery));
  const filteredMinors2 = programs.filter((p) => p.type === "minor" && matchesQuery(p, minor2Query));

  // ── Requirements ─────────────────────────────────────────────────────────
  const fetchRequirements = async (program, type) => {
    if (!program) return null;
    setLoadingReqs(true);
    try {
      const resp = await axios.post(`${backendUrl}/api/requirements`, {
        catalogUrl: program.url, programName: program.name,
      });
      if (type === "major")       setMajorReqs(resp.data);
      else if (type === "major2") setMajor2Reqs(resp.data);
      else if (type === "minor")  setMinorReqs(resp.data);
      else if (type === "minor2") setMinor2Reqs(resp.data);
      return resp.data;
    } catch (err) {
      console.error("Requirements fetch failed:", err);
      return null;
    } finally {
      setLoadingReqs(false);
    }
  };

  const selectMajor = (prog) => {
    setMajor(prog); setMajorQuery(prog.name);
    setMajorDropOpen(false); setMajorReqs(null);
    fetchRequirements(prog, "major");
  };
  const selectMajor2 = (prog) => {
    setMajor2(prog); setMajor2Query(prog.name);
    setMajor2DropOpen(false); setMajor2Reqs(null);
    fetchRequirements(prog, "major2");
  };
  const removeMajor2 = () => {
    setShowMajor2(false); setMajor2(null); setMajor2Query(""); setMajor2Reqs(null);
  };

  const selectMinor = (prog) => {
    setMinor(prog); setMinorQuery(prog.name);
    setMinorDropOpen(false); setMinorReqs(null);
    fetchRequirements(prog, "minor");
  };
  const selectMinor2 = (prog) => {
    setMinor2(prog); setMinor2Query(prog.name);
    setMinor2DropOpen(false); setMinor2Reqs(null);
    fetchRequirements(prog, "minor2");
  };
  const removeMinor2 = () => {
    setShowMinor2(false); setMinor2(null); setMinor2Query(""); setMinor2Reqs(null);
  };

  // ── Recommendations ───────────────────────────────────────────────────────
  const runRecommendations = async ({ majorVal, majorReqsVal, completedCoursesVal } = {}) => {
    const m1        = majorVal          ?? major;
    const r1        = majorReqsVal      ?? majorReqs;
    const completed = completedCoursesVal ?? completedCourses;
    if (!m1) return;

    const majorsPayload = [
      { name: m1.name, reqs: r1 || {} },
      ...(showMajor2 && major2 ? [{ name: major2.name, reqs: major2Reqs || {} }] : []),
    ];
    const minorsPayload = [
      ...(minor  ? [{ name: minor.name,  reqs: minorReqs  || {} }] : []),
      ...(showMinor2 && minor2 ? [{ name: minor2.name, reqs: minor2Reqs || {} }] : []),
    ];

    setLoadingRecs(true); setRecsError(""); setRecommendations([]); setBestProfessors({});
    try {
      const resp = await axios.post(`${backendUrl}/api/recommend`, {
        majors: majorsPayload, minors: minorsPayload,
        completedCourses: completed, termId, interests,
      }, { timeout: 130000 });
      setRecommendations(resp.data.recommendations || []);
      setTermLabel(resp.data.termLabel || "");
    } catch (err) {
      setRecsError(err?.response?.data?.error || "Failed to get recommendations.");
    } finally {
      setLoadingRecs(false);
    }
  };

  const parseAndApplyTranscript = async (text) => {
    setTranscriptLoading(true); setTranscriptError("");
    let detectedMajor = "", allCourses = [];
    try {
      const resp = await axios.post(`${backendUrl}/api/parse-transcript`, { text }, { timeout: 30000 });
      detectedMajor = resp.data.detected_major || "";
      allCourses = [
        ...(resp.data.completed || []),
        ...(resp.data.in_progress || []).map((c) => ({ ...c, inProgress: true })),
      ];
      setCompletedCourses(allCourses);
      setPasteText(""); setPasteMode(false); setWaitingClipboard(false);
    } catch (err) {
      setTranscriptError(err?.response?.data?.error || "Could not parse transcript. Make sure you copied the full page.");
      setPasteMode(true); setWaitingClipboard(false);
      return;
    } finally {
      setTranscriptLoading(false);
    }
    if (detectedMajor && programs.length > 0) {
      const match = findBestMajorMatch(programs, detectedMajor);
      if (match) {
        setMajor(match); setMajorQuery(match.name); setMajorReqs(null);
        const reqs = await fetchRequirements(match, "major");
        if (reqs) await runRecommendations({ majorVal: match, majorReqsVal: reqs, completedCoursesVal: allCourses });
      }
    }
  };

  const handleOpenTestudo = () => {
    if (clipboardCleanup.current) { clipboardCleanup.current(); clipboardCleanup.current = null; }
    testudoWinRef.current = window.open(TESTUDO_URL, "_blank");
    setWaitingClipboard(true); setPasteMode(false); setTranscriptError("");

    const onFocus = async () => {
      if (!document.hasFocus()) return;
      cleanup();
      try {
        const text = await navigator.clipboard.readText();
        const looksLikeTranscript =
          text.includes("UNIVERSITY OF MARYLAND") ||
          text.includes("UNOFFICIAL TRANSCRIPT") ||
          text.includes("Historic Course Information") ||
          text.includes("Transfer Credit Information");
        if (looksLikeTranscript) {
          await parseAndApplyTranscript(text);
          return;
        }
        // Clipboard had content but it wasn't the transcript — keep waiting
        setTranscriptError("Clipboard didn't look like a transcript. Make sure you're on the Unofficial Transcript page, then press Ctrl+A → Ctrl+C and switch back.");
        setWaitingClipboard(true);
        window.addEventListener("focus", onFocus);
        clipboardCleanup.current = cleanup;
        return;
      } catch (_) { /* clipboard permission denied */ }
      setWaitingClipboard(false); setPasteMode(true);
    };

    const cleanup = () => {
      window.removeEventListener("focus", onFocus);
      clipboardCleanup.current = null;
    };
    clipboardCleanup.current = cleanup;
    window.addEventListener("focus", onFocus);
  };

  const goToTranscriptTab = () => {
    try {
      if (testudoWinRef.current && !testudoWinRef.current.closed) {
        testudoWinRef.current.location.href = TESTUDO_URL;
        testudoWinRef.current.focus();
      } else {
        testudoWinRef.current = window.open(TESTUDO_URL, "_blank");
      }
    } catch (_) {}
  };

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    await parseAndApplyTranscript(pasteText);
  };

  // ── Transcript import — Playwright path (local only) ─────────────────────
  const handleImportTranscript = async () => {
    setTranscriptLoading(true); setTranscriptError("");
    let detectedMajor = "", allCourses = [];
    try {
      const resp = await axios.post(`${backendUrl}/api/transcript`, {}, { timeout: 200000 });
      detectedMajor = resp.data.detected_major || "";
      allCourses = [
        ...(resp.data.completed || []),
        ...(resp.data.in_progress || []).map((c) => ({ ...c, inProgress: true })),
      ];
      setCompletedCourses(allCourses);
      if (resp.data.warning) setTranscriptError(resp.data.warning);
    } catch (err) {
      setTranscriptError(err?.response?.data?.error || "Transcript import failed. Try again.");
      return;
    } finally {
      setTranscriptLoading(false);
    }

    if (detectedMajor && programs.length > 0) {
      const match = findBestMajorMatch(programs, detectedMajor);
      if (match) {
        setMajor(match); setMajorQuery(match.name); setMajorReqs(null);
        const reqs = await fetchRequirements(match, "major");
        if (reqs) await runRecommendations({ majorVal: match, majorReqsVal: reqs, completedCoursesVal: allCourses });
      }
    }
  };

  const applyManualCourses = () => {
    const ids = manualInput
      .split(/[\s,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{3,4}\d{3}[A-Z]?$/.test(s));
    if (!ids.length) return;
    const existing = new Set(completedCourses.map((c) => c.course_id));
    const added = ids
      .filter((id) => !existing.has(id))
      .map((id) => ({ course_id: id, grade: null, semester: null }));
    setCompletedCourses([...completedCourses, ...added]);
    setManualInput("");
  };

  const clearSession = () => {
    setCompletedCourses([]);
    setMajor(null);  setMajorQuery("");  setMajorReqs(null);
    setMajor2(null); setMajor2Query(""); setMajor2Reqs(null); setShowMajor2(false);
    setMinor(null);  setMinorQuery("");  setMinorReqs(null);
    setMinor2(null); setMinor2Query(""); setMinor2Reqs(null); setShowMinor2(false);
    setRecommendations([]); setTermLabel(""); setBestProfessors({});
    localStorage.removeItem(LS_KEY);
  };

  const completedIds = completedCourses.map((c) => c.course_id);
  const canRecommend = major && (completedCourses.length > 0 || majorReqs) && termId;
  const hasSession   = completedCourses.length > 0 || major || recommendations.length > 0;

  return (
    <section className="planner">
      <div className="planner-form">
        {/* Step 1 — Transcript / Manual */}
        <div className="planner-section">
          <div className="section-label-row">
            <p className="section-label">
              <span className="step-badge">1</span>
              {transcriptEnabled ? "Import your transcript" : "Your completed courses"}
            </p>
            {hasSession && (
              <button type="button" className="clear-session-btn" onClick={clearSession}>
                clear session
              </button>
            )}
          </div>

          {transcriptEnabled ? (
            /* ── Local: Playwright browser automation ── */
            <>
              <p className="section-hint">Detects your major automatically and pulls all your completed courses.</p>
              <button
                type="button"
                className={`transcript-btn ${transcriptLoading ? "transcript-btn-waiting" : ""}`}
                onClick={handleImportTranscript}
                disabled={transcriptLoading}
              >
                {transcriptLoading
                  ? <><span className="transcript-spinner" />Waiting for Testudo login…</>
                  : <><img src="/testudo-example-color.webp" alt="" className="testudo-icon" />Import from Testudo</>}
              </button>
              {transcriptLoading && (
                <div className="transcript-steps">
                  <p className="transcript-steps-title">A browser window just opened —</p>
                  <ol>
                    <li>Log in with your UMD credentials</li>
                    <li>Complete Duo Push if prompted</li>
                    <li>The window closes automatically, then your major and recommendations load</li>
                  </ol>
                </div>
              )}
              {transcriptError && <p className="error">{transcriptError}</p>}
            </>
          ) : transcriptLoading ? (
            /* ── Deployed: parsing in progress ── */
            <div className="transcript-steps">
              <p className="transcript-steps-title"><span className="transcript-spinner" /> Importing your transcript…</p>
            </div>
          ) : waitingClipboard ? (
            /* ── Deployed: waiting for user to copy on Testudo tab ── */
            <>
              <div className="transcript-steps">
                <p className="transcript-steps-title">On the Testudo tab that just opened:</p>
                <ol>
                  <li>Log in with your UMD credentials &amp; Duo</li>
                  <li>After login you&apos;ll land on the <strong>Schedule page</strong> — click <strong>Go to Transcript</strong> below</li>
                  <li>Press <strong>Ctrl+A</strong> then <strong>Ctrl+C</strong> to copy the full page</li>
                  <li>Switch back to this tab — it imports automatically</li>
                </ol>
              </div>
              <div className="transcript-action-row">
                <button
                  type="button"
                  className="transcript-btn"
                  onClick={goToTranscriptTab}
                >
                  <img src="/testudo-example-color.webp" alt="" className="testudo-icon" />
                  Go to Transcript →
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setWaitingClipboard(false);
                    setPasteMode(true);
                    if (clipboardCleanup.current) clipboardCleanup.current();
                  }}
                >
                  Paste manually instead
                </button>
              </div>
              {transcriptError && <p className="error">{transcriptError}</p>}
            </>
          ) : !pasteMode ? (
            /* ── Deployed: Import button ── */
            <>
              <p className="section-hint">Opens your Testudo transcript in a new tab — switch back after copying and it imports automatically.</p>
              <button
                type="button"
                className="transcript-btn"
                onClick={handleOpenTestudo}
              >
                <img src="/testudo-example-color.webp" alt="" className="testudo-icon" />
                Import from Testudo
              </button>
            </>
          ) : (
            /* ── Deployed: paste textarea fallback ── */
            <>
              <div className="transcript-steps" style={{ marginBottom: 12 }}>
                <p className="transcript-steps-title">Paste your transcript:</p>
                <ol>
                  <li>On the Testudo tab, press <strong>Ctrl+A</strong> then <strong>Ctrl+C</strong></li>
                  <li>Paste below and click <strong>Parse Transcript</strong></li>
                </ol>
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste your transcript text here…"
                rows={5}
                className="transcript-paste-area"
              />
              <div className="transcript-action-row">
                <button
                  type="button"
                  className="transcript-btn"
                  onClick={handlePasteSubmit}
                  disabled={transcriptLoading || !pasteText.trim()}
                >
                  {transcriptLoading
                    ? <><span className="transcript-spinner" />Parsing…</>
                    : <><img src="/testudo-example-color.webp" alt="" className="testudo-icon" />Parse Transcript</>}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => { setPasteMode(false); setPasteText(""); setTranscriptError(""); setWaitingClipboard(false); }}
                >
                  Cancel
                </button>
              </div>
              {transcriptError && <p className="error">{transcriptError}</p>}
            </>
          )}

          {completedCourses.length > 0 && (
            <div className="completed-chips">
              {completedCourses.map((c) => (
                <span
                  key={c.course_id}
                  className={`course-chip ${c.inProgress ? "chip-in-progress" : ""}`}
                  title={c.inProgress ? "In progress" : c.semester || ""}
                >
                  {c.course_id}
                  {c.inProgress
                    ? <span className="chip-grade chip-wip">now</span>
                    : c.grade && <span className="chip-grade">{c.grade}</span>}
                </span>
              ))}
              <button type="button" className="chip-clear" onClick={() => setCompletedCourses([])}>
                clear
              </button>
            </div>
          )}
          {transcriptEnabled && completedCourses.length > 0 && (
            <div className="add-courses-row">
              <input
                type="text" placeholder="Add more course IDs…"
                value={manualInput} onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyManualCourses()}
                className="add-courses-input"
              />
              <button type="button" className="secondary add-courses-btn" onClick={applyManualCourses}>
                Add
              </button>
            </div>
          )}
        </div>

        {/* Step 2 — Major / Minor */}
        <div className="planner-section step-divider">
          <p className="section-label"><span className="step-badge">2</span>Your program</p>
          <p className="section-hint">
            {transcriptEnabled
              ? "Auto-filled from your transcript. Adjust if needed, or add a minor."
              : "Search for your major and optional minor below."}
          </p>

          {/* Row: Major 1 + Minor 1 */}
          <div className="planner-row">
            <div className="field-group planner-field" ref={majorRef}>
              <label>
                Major *
                {major && <span className="field-auto-tag">auto-detected</span>}
              </label>
              <input
                type="text" placeholder="Search major…" value={majorQuery}
                onChange={(e) => { setMajorQuery(e.target.value); setMajorDropOpen(true); }}
                onFocus={() => setMajorDropOpen(true)} className="program-input"
              />
              {majorDropOpen && filteredMajors.length > 0 && (
                <div className="program-dropdown">
                  {filteredMajors.map((p) => (
                    <button key={p.url} type="button" className="program-option" onClick={() => selectMajor(p)}>
                      <span className="program-option-name">{p.name}</span>
                      {p.school && <span className="program-option-school">{p.school}</span>}
                    </button>
                  ))}
                </div>
              )}
              {major && majorReqs && (
                <p className="req-status">
                  {loadingReqs ? "Loading requirements…" : `✓ ${countRequired(majorReqs)} required courses found`}
                </p>
              )}
            </div>

            <div className="field-group planner-field" ref={minorRef}>
              <label>Minor <span className="optional">(optional)</span></label>
              <input
                type="text" placeholder="Search minor…" value={minorQuery}
                onChange={(e) => { setMinorQuery(e.target.value); setMinorDropOpen(true); }}
                onFocus={() => setMinorDropOpen(true)} className="program-input"
              />
              {minorDropOpen && filteredMinors.length > 0 && (
                <div className="program-dropdown">
                  {filteredMinors.map((p) => (
                    <button key={p.url} type="button" className="program-option" onClick={() => selectMinor(p)}>
                      <span className="program-option-name">{p.name}</span>
                      {p.school && <span className="program-option-school">{p.school}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row: Major 2 + Minor 2 (shown on demand) */}
          {(showMajor2 || showMinor2) && (
            <div className="planner-row">
              <div className="field-group planner-field" ref={major2Ref}>
                {showMajor2 ? (
                  <>
                    <label>
                      Double Major
                      <button type="button" className="remove-program-btn" onClick={removeMajor2}>×</button>
                    </label>
                    <input
                      type="text" placeholder="Search major…" value={major2Query}
                      onChange={(e) => { setMajor2Query(e.target.value); setMajor2DropOpen(true); }}
                      onFocus={() => setMajor2DropOpen(true)} className="program-input"
                    />
                    {major2DropOpen && filteredMajors2.length > 0 && (
                      <div className="program-dropdown">
                        {filteredMajors2.map((p) => (
                          <button key={p.url} type="button" className="program-option" onClick={() => selectMajor2(p)}>
                            <span className="program-option-name">{p.name}</span>
                            {p.school && <span className="program-option-school">{p.school}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {major2 && major2Reqs && (
                      <p className="req-status">
                        {loadingReqs ? "Loading…" : `✓ ${countRequired(major2Reqs)} required courses found`}
                      </p>
                    )}
                  </>
                ) : <div />}
              </div>

              <div className="field-group planner-field" ref={minor2Ref}>
                {showMinor2 ? (
                  <>
                    <label>
                      Second Minor
                      <button type="button" className="remove-program-btn" onClick={removeMinor2}>×</button>
                    </label>
                    <input
                      type="text" placeholder="Search minor…" value={minor2Query}
                      onChange={(e) => { setMinor2Query(e.target.value); setMinor2DropOpen(true); }}
                      onFocus={() => setMinor2DropOpen(true)} className="program-input"
                    />
                    {minor2DropOpen && filteredMinors2.length > 0 && (
                      <div className="program-dropdown">
                        {filteredMinors2.map((p) => (
                          <button key={p.url} type="button" className="program-option" onClick={() => selectMinor2(p)}>
                            <span className="program-option-name">{p.name}</span>
                            {p.school && <span className="program-option-school">{p.school}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : <div />}
              </div>
            </div>
          )}

          {/* Add buttons */}
          <div className="add-program-row">
            {!showMajor2 && major && (
              <button type="button" className="add-program-btn" onClick={() => setShowMajor2(true)}>
                + Double major
              </button>
            )}
            {!showMinor2 && (
              <button type="button" className="add-program-btn" onClick={() => setShowMinor2(true)}>
                + {minor ? "Second minor" : "Minor"}
              </button>
            )}
          </div>
        </div>

        {/* Step 3 — Semester + interests + submit */}
        <div className="planner-section step-divider">
          <p className="section-label"><span className="step-badge">3</span>Plan your semester</p>
          <div className="planner-row planner-bottom-row">
            <div className="field-group">
              <label>Plan for semester</label>
              <select value={termId} onChange={(e) => setTermId(e.target.value)}>
                {semesters.map((s) => (
                  <option key={s.termId} value={s.termId}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field-group interests-field">
              <label>Interests / goals <span className="optional">(optional)</span></label>
              <input
                type="text" placeholder="e.g. AI/ML, web dev, finance…"
                value={interests} onChange={(e) => setInterests(e.target.value)}
              />
            </div>
            <button
              type="button" className="compare-btn"
              onClick={() => runRecommendations()}
              disabled={!canRecommend || loadingRecs}
            >
              {loadingRecs ? "Generating…" : "Get Recommendations →"}
            </button>
          </div>
          {recsError && <p className="error">{recsError}</p>}
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="recs-section">
          <div className="results-header">
            <div className="results-title">
              <h3>Recommended for {termLabel}</h3>
              <p className="count">{recommendations.length} courses</p>
            </div>
          </div>
          <div className="recs-grid">
            {recommendations.map((rec) => (
              <RecommendCard
                key={rec.course_id}
                rec={rec}
                isCompleted={completedIds.includes(rec.course_id)}
                bestProf={bestProfessors[rec.course_id] || null}
                backendUrl={backendUrl}
                termId={termId}
                onOpenProfModal={onOpenProfModal}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
