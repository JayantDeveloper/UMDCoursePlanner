import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { getProfScore, GRADE_COLORS, PRIORITY_COLORS } from "../utils";

const LS_KEY = "umd_course_planner";

async function fetchProfessorsForCourse(courseId, termId, backendUrl) {
  const sectionsResp = await axios.post(`${backendUrl}/api/sections`, { courseId, termId });
  const compareResp  = await axios.post(`${backendUrl}/api/compare`, {
    courseId, professors: sectionsResp.data.professors,
  });
  return compareResp.data;
}

export default function CoursePlanner({ backendUrl, semesters, onOpenProfModal }) {
  // Program selection
  const [programs, setPrograms]       = useState([]);
  const [majorQuery, setMajorQuery]   = useState("");
  const [minorQuery, setMinorQuery]   = useState("");
  const [major, setMajor]             = useState(null);
  const [minor, setMinor]             = useState(null);
  const [majorDropOpen, setMajorDropOpen] = useState(false);
  const [minorDropOpen, setMinorDropOpen] = useState(false);

  // Requirements
  const [majorReqs, setMajorReqs]     = useState(null);
  const [minorReqs, setMinorReqs]     = useState(null);
  const [loadingReqs, setLoadingReqs] = useState(false);

  // Transcript / completed courses
  const [completedCourses, setCompletedCourses] = useState([]);
  const [manualInput, setManualInput] = useState("");
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError]     = useState("");

  // Recommendations
  const [termId, setTermId]               = useState(semesters[0]?.termId || "");
  const [interests, setInterests]         = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs]     = useState(false);
  const [recsError, setRecsError]         = useState("");
  const [termLabel, setTermLabel]         = useState("");

  // Best professor per card (from /api/best-professors)
  const [bestProfessors, setBestProfessors] = useState({});

  const majorRef = useRef(null);
  const minorRef = useRef(null);

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
      if (d.major)    { setMajor(d.major);   setMajorQuery(d.major.name); }
      if (d.majorReqs)  setMajorReqs(d.majorReqs);
      if (d.minor)    { setMinor(d.minor);   setMinorQuery(d.minor.name); }
      if (d.minorReqs)  setMinorReqs(d.minorReqs);
      if (d.recommendations?.length) setRecommendations(d.recommendations);
      if (d.termLabel)  setTermLabel(d.termLabel);
      if (d.interests)  setInterests(d.interests);
    } catch (_) {}
  }, []);

  // ── localStorage: persist on change ──────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({
      completedCourses, major, majorReqs, minor, minorReqs,
      recommendations, termLabel, interests,
    }));
  }, [completedCourses, major, majorReqs, minor, minorReqs, recommendations, termLabel, interests]);

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
      if (majorRef.current && !majorRef.current.contains(e.target)) setMajorDropOpen(false);
      if (minorRef.current && !minorRef.current.contains(e.target)) setMinorDropOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  // ── Filtered dropdown lists ───────────────────────────────────────────────
  const filteredMajors = programs
    .filter((p) => p.type === "major" && p.name.toLowerCase().includes(majorQuery.toLowerCase()))
    .slice(0, 12);

  const filteredMinors = programs
    .filter((p) => p.type === "minor" && p.name.toLowerCase().includes(minorQuery.toLowerCase()))
    .slice(0, 12);

  // ── Requirements ─────────────────────────────────────────────────────────
  const fetchRequirements = async (program, type) => {
    if (!program) return null;
    setLoadingReqs(true);
    try {
      const resp = await axios.post(`${backendUrl}/api/requirements`, {
        catalogUrl: program.url, programName: program.name,
      });
      if (type === "major") setMajorReqs(resp.data);
      else setMinorReqs(resp.data);
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

  const selectMinor = (prog) => {
    setMinor(prog); setMinorQuery(prog.name);
    setMinorDropOpen(false); setMinorReqs(null);
    fetchRequirements(prog, "minor");
  };

  // ── Recommendations — accepts overrides for auto-chain from transcript ────
  const runRecommendations = async ({ majorVal, majorReqsVal, completedCoursesVal } = {}) => {
    const maj      = majorVal          ?? major;
    const reqs     = majorReqsVal      ?? majorReqs;
    const completed = completedCoursesVal ?? completedCourses;
    if (!maj) return;
    setLoadingRecs(true); setRecsError(""); setRecommendations([]); setBestProfessors({});
    try {
      const resp = await axios.post(`${backendUrl}/api/recommend`, {
        majorName: maj.name, majorReqs: reqs || {},
        minorName: minor?.name || null, minorReqs: minorReqs || null,
        completedCourses: completed, termId, interests,
      }, { timeout: 60000 });
      setRecommendations(resp.data.recommendations || []);
      setTermLabel(resp.data.termLabel || "");
    } catch (err) {
      setRecsError(err?.response?.data?.error || "Failed to get recommendations.");
    } finally {
      setLoadingRecs(false);
    }
  };

  // ── Transcript import — auto-chains to requirements + recommendations ─────
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
    setMajor(null); setMajorQuery(""); setMajorReqs(null);
    setMinor(null); setMinorQuery(""); setMinorReqs(null);
    setRecommendations([]); setTermLabel(""); setBestProfessors({});
    localStorage.removeItem(LS_KEY);
  };

  const completedIds = completedCourses.map((c) => c.course_id);
  const canRecommend = major && (completedCourses.length > 0 || majorReqs) && termId;
  const hasSession   = completedCourses.length > 0 || major || recommendations.length > 0;

  return (
    <section className="planner">
      <div className="planner-form">
        {/* Step 1 — Transcript */}
        <div className="planner-section">
          <div className="section-label-row">
            <p className="section-label"><span className="step-badge">1</span>Import your transcript</p>
            {hasSession && (
              <button type="button" className="clear-session-btn" onClick={clearSession}>
                clear session
              </button>
            )}
          </div>
          <p className="section-hint">Detects your major automatically and pulls all your completed courses.</p>
          <button
            type="button"
            className={`transcript-btn ${transcriptLoading ? "transcript-btn-waiting" : ""}`}
            onClick={handleImportTranscript} disabled={transcriptLoading}
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
          {completedCourses.length > 0 && (
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
          <p className="section-hint">Auto-filled from your transcript. Adjust if needed, or add a minor.</p>
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
                      {p.name}
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
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function tagClass(tag) {
  if (tag === "Major Required")  return "tag-major-req";
  if (tag === "Major Elective")  return "tag-major-elec";
  if (tag === "Minor Required")  return "tag-minor-req";
  if (tag === "Minor Elective")  return "tag-minor-elec";
  if (tag.startsWith("Gen-Ed"))  return "tag-gened";
  if (tag === "Upper Division")  return "tag-upper";
  if (tag === "Check Prereqs")   return "tag-prereq-warn";
  return "tag-other";
}

function countRequired(reqs) {
  return (reqs.sections || [])
    .filter((s) => s.type === "required")
    .reduce((n, s) => n + (s.courses || []).length, 0);
}

// ── RecommendCard ─────────────────────────────────────────────────────────────

function RecommendCard({ rec, isCompleted, bestProf, backendUrl, termId, onOpenProfModal }) {
  const [expanded,     setExpanded]     = useState(false);
  const [allProfs,     setAllProfs]     = useState([]);
  const [loadingProfs, setLoadingProfs] = useState(false);
  const [profsError,   setProfsError]   = useState("");

  const handleExpandProfs = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (allProfs.length > 0) return;
    setLoadingProfs(true); setProfsError("");
    try {
      const compareData = await fetchProfessorsForCourse(rec.course_id, termId, backendUrl);
      const sorted = [...(compareData.professors || [])].sort(
        (a, b) => (getProfScore(b) ?? -1) - (getProfScore(a) ?? -1)
      );
      setAllProfs(sorted);
    } catch (err) {
      setProfsError(err?.response?.data?.error || "Could not load professors.");
      setExpanded(false);
    } finally {
      setLoadingProfs(false);
    }
  };

  const priorityColor = PRIORITY_COLORS[rec.priority] ?? PRIORITY_COLORS.default;
  const tags = rec.tags || [];

  return (
    <div className="rec-card">
      {/* Course header */}
      <div className="rec-card-header">
        <div>
          <span className="rec-course-id">{rec.course_id}</span>
          <span className="priority-dot" style={{ background: priorityColor }} title={`${rec.priority} priority`} />
        </div>
        {rec.credits && <span className="rec-credits">{rec.credits} cr</span>}
      </div>

      <p className="rec-name">{rec.name}</p>

      {tags.length > 0 && (
        <div className="rec-tags">
          {tags.map((t) => <span key={t} className={`rec-tag ${tagClass(t)}`}>{t}</span>)}
        </div>
      )}

      {rec.fulfills && <p className="rec-fulfills">{rec.fulfills}</p>}
      <p className="rec-reason">{rec.reason}</p>
      {rec.prereqs && <p className="rec-prereqs">Prereqs: {rec.prereqs}</p>}

      {isCompleted ? (
        <p className="rec-done">✓ Already completed</p>
      ) : (
        <>
          {/* Best prof preview — hidden when full list is expanded */}
          {!expanded && bestProf && (
            <div className="rec-best-prof">
              <span className="rec-prof-label">Best prof this semester</span>
              <div className="rec-prof-row">
                {bestProf.slug ? (
                  <a href={`https://planetterp.com/professor/${bestProf.slug}`}
                    target="_blank" rel="noreferrer" className="rec-prof-name">
                    {bestProf.name}
                  </a>
                ) : <span className="rec-prof-name">{bestProf.name}</span>}
                <div className="rec-prof-stats">
                  {bestProf.score  != null && <span className="rec-prof-score"  title="Score">{bestProf.score}</span>}
                  {bestProf.avgRating != null && <span className="rec-prof-rating">★ {bestProf.avgRating.toFixed(1)}</span>}
                  {bestProf.avgGpa    != null && <span className="rec-prof-gpa">GPA {bestProf.avgGpa}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Expanded: full ranked professor list */}
          {expanded && (
            <div className="inline-profs">
              <p className="inline-profs-title">All professors — ranked by Score</p>
              {loadingProfs && <p className="inline-profs-loading">Loading…</p>}
              {profsError   && <p className="error" style={{ fontSize: 13 }}>{profsError}</p>}
              {allProfs.map((prof) => <MiniProfRow key={prof.name} prof={prof} />)}
              {allProfs.length > 0 && (
                <button
                  type="button" className="secondary open-full-btn"
                  onClick={() => onOpenProfModal(rec.course_id, termId)}
                >
                  Get AI prep summaries →
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            className="secondary expand-profs-btn"
            onClick={handleExpandProfs}
            disabled={loadingProfs}
          >
            {loadingProfs ? "Loading…" : expanded ? "Show less" : "See all professors →"}
          </button>
        </>
      )}
    </div>
  );
}

// ── MiniProfRow ───────────────────────────────────────────────────────────────

function MiniProfRow({ prof }) {
  const score = getProfScore(prof);
  const dist  = prof.grades?.distribution || {};
  const hasDist = Object.values(dist).some(Boolean);

  return (
    <div className="mini-prof-row">
      <div className="mini-prof-identity">
        {score != null && (
          <span className="rec-prof-score" title="Score">{score}</span>
        )}
        {prof.slug ? (
          <a href={`https://planetterp.com/professor/${prof.slug}`}
            target="_blank" rel="noreferrer" className="mini-prof-name">
            {prof.name}
          </a>
        ) : <span className="mini-prof-name">{prof.name}</span>}
        {prof.avgRating   != null && <span className="rec-prof-rating">★ {prof.avgRating.toFixed(1)}</span>}
        {prof.grades?.avgGpa != null && <span className="rec-prof-gpa">GPA {prof.grades.avgGpa}</span>}
        {prof.grades?.aRate  != null && <span className="rec-prof-gpa">A {prof.grades.aRate}%</span>}
      </div>
      {hasDist && <MiniGradeBar distribution={dist} />}
    </div>
  );
}

function MiniGradeBar({ distribution }) {
  return (
    <div className="mini-grade-bar">
      {Object.entries(GRADE_COLORS).map(([grade, color]) => {
        const pct = distribution[grade] || 0;
        if (!pct) return null;
        return (
          <div key={grade} style={{ flex: `0 0 ${pct}%`, background: color }} title={`${grade}: ${pct}%`} />
        );
      })}
    </div>
  );
}
