import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import CoursePlanner from "./components/CoursePlanner";
import { getProfScore, sortProfs, GRADE_COLORS } from "./utils";

const DEFAULT_BACKEND = "http://127.0.0.1:5001";

const SORT_OPTIONS = [
  { key: "score",  label: "Score" },
  { key: "rating", label: "Rating" },
  { key: "gpa",    label: "Avg GPA" },
];

export default function App() {
  const [semesters, setSemesters] = useState([]);
  const backendUrl = useMemo(() => import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND, []);
  // Transcript import requires a local browser window — unavailable on the deployed version
  const transcriptEnabled = !import.meta.env.VITE_BACKEND_URL;

  // ── Lookup modal ─────────────────────────────────────────────────────────
  const [modalOpen,   setModalOpen]   = useState(false);
  const [modalCourse, setModalCourse] = useState("");
  const [modalTermId, setModalTermId] = useState("");
  const [profData,    setProfData]    = useState([]);
  const [activeCourse, setActiveCourse] = useState("");
  const [sortBy,      setSortBy]      = useState("score");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  useEffect(() => {
    axios.get(`${backendUrl}/api/semesters`).then((resp) => {
      setSemesters(resp.data);
      if (resp.data.length) setModalTermId(resp.data[0].termId);
    });
  }, [backendUrl]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const fetchComparison = async (courseId, termId) => {
    if (!courseId.trim() || !termId) return;
    setError(""); setProfData([]); setActiveCourse(""); setLoading(true);
    try {
      const id = courseId.trim();
      const sectionsResp = await axios.post(`${backendUrl}/api/sections`, { courseId: id, termId });
      const compareResp  = await axios.post(`${backendUrl}/api/compare`, {
        courseId: id, professors: sectionsResp.data.professors,
      });
      setProfData(compareResp.data.professors);
      setActiveCourse(compareResp.data.courseId);
      setSortBy("score");
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const openModal = (courseId = "", termId = "") => {
    const term = termId || semesters[0]?.termId || "";
    setModalCourse(courseId);
    setModalTermId(term);
    setProfData([]); setActiveCourse(""); setError("");
    setModalOpen(true);
    if (courseId) fetchComparison(courseId, term);
  };

  const closeModal = () => setModalOpen(false);

  const handleModalSubmit = (e) => {
    e.preventDefault();
    fetchComparison(modalCourse, modalTermId);
  };

  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="hero-content">
          <div className="hero-left">
            <h1>UMD Course Planner</h1>
            <p className="subhead">
              Import your transcript and get a personalized plan — requirements mapped,
              gen-eds tracked, best professors surfaced for each recommendation.
            </p>
          </div>
          <div className="hero-right">
            <button type="button" className="lookup-cta-btn" onClick={() => openModal()}>
              <span className="lookup-cta-icon">⌕</span>
              <span className="lookup-cta-text">
                <span className="lookup-cta-title">Compare professors for any course</span>
                <span className="lookup-cta-desc">ratings, GPA distributions &amp; AI prep summaries</span>
              </span>
              <span className="lookup-cta-arrow">→</span>
            </button>
          </div>
        </div>
      </header>

      <CoursePlanner
        backendUrl={backendUrl}
        semesters={semesters}
        onOpenProfModal={openModal}
        transcriptEnabled={transcriptEnabled}
      />

      {/* ── Course lookup modal ─────────────────────────────────────── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{activeCourse ? `${activeCourse} — Professors` : "Look up a course"}</h2>
              <button type="button" className="modal-close" onClick={closeModal} aria-label="Close">
                ✕
              </button>
            </div>

            <form className="search-form modal-search" onSubmit={handleModalSubmit}>
              <div className="search-fields">
                <div className="field-group">
                  <label htmlFor="modalCourseId">Course ID</label>
                  <input
                    id="modalCourseId"
                    type="text"
                    placeholder="e.g. CMSC351"
                    value={modalCourse}
                    onChange={(e) => setModalCourse(e.target.value)}
                    className="course-input"
                    autoFocus={!modalCourse}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="modalSemester">Semester</label>
                  <select
                    id="modalSemester"
                    value={modalTermId}
                    onChange={(e) => setModalTermId(e.target.value)}
                  >
                    {semesters.map((s) => (
                      <option key={s.termId} value={s.termId}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={loading} className="compare-btn">
                  {loading ? "Loading…" : "Compare →"}
                </button>
              </div>
              {error && <p className="error">{error}</p>}
            </form>

            {profData.length > 0 && (
              <div className="modal-results">
                <div className="results-header">
                  <div className="results-title">
                    <h3>{activeCourse}</h3>
                    <p className="count">
                      {profData.length} instructor{profData.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="sort-controls">
                    <span className="sort-label">Sort by</span>
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`sort-btn ${sortBy === opt.key ? "active" : ""}`}
                        onClick={() => setSortBy(opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="prof-grid">
                  {sortProfs(profData, sortBy).map((prof) => (
                    <ProfCard
                      key={prof.name}
                      prof={prof}
                      courseId={activeCourse}
                      backendUrl={backendUrl}
                      score={getProfScore(prof)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProfCard ─────────────────────────────────────────────────────────────────

function ProfCard({ prof, courseId, backendUrl, score }) {
  const [feedback, setFeedback]   = useState(null);
  const [loadingFb, setLoadingFb] = useState(false);
  const [fbError, setFbError]     = useState("");

  const handleGetFeedback = async () => {
    setLoadingFb(true); setFbError("");
    try {
      const resp = await axios.post(`${backendUrl}/api/feedback`, {
        courseId, professor: prof.name,
      });
      setFeedback(resp.data.feedback);
    } catch (err) {
      setFbError(err?.response?.data?.error || "Failed to generate summary.");
    } finally {
      setLoadingFb(false);
    }
  };

  const hasGrades      = prof.grades.avgGpa != null;
  const hasDistribution = Object.keys(prof.grades.distribution || {}).length > 0;

  return (
    <div className={`prof-card ${!prof.onPlanetTerp ? "no-data" : ""}`}>
      <div className="prof-card-header">
        <h3 className="prof-name">{prof.name}</h3>
        <div className="prof-card-meta">
          {score != null && (
            <span className="score-badge" title="Score: 60% rating + 40% GPA, 0–100">
              {score}
            </span>
          )}
          {prof.slug && (
            <a
              href={`https://planetterp.com/professor/${prof.slug}`}
              target="_blank" rel="noreferrer" className="pt-link"
            >
              PlanetTerp ↗
            </a>
          )}
        </div>
      </div>

      {prof.onPlanetTerp ? (
        <>
          <div className="stats-row">
            {prof.avgRating != null && (
              <div className="stat-item">
                <StarRating rating={prof.avgRating} />
                <span className="stat-value">{prof.avgRating.toFixed(1)}</span>
              </div>
            )}
            {hasGrades && (
              <div className="stat-item">
                <span className="stat-label">Avg GPA</span>
                <span className="stat-value">{prof.grades.avgGpa}</span>
              </div>
            )}
            {prof.grades.aRate != null && (
              <div className="stat-item">
                <span className="stat-label">A-rate</span>
                <span className="stat-value">{prof.grades.aRate}%</span>
              </div>
            )}
            {prof.reviewCount > 0 && (
              <div className="stat-item">
                <span className="stat-label">Reviews</span>
                <span className="stat-value">{prof.reviewCount}</span>
              </div>
            )}
          </div>

          {hasDistribution && <GradeBar distribution={prof.grades.distribution} />}
          {!hasGrades && (
            <p className="muted-note">No grade data on PlanetTerp for {courseId}</p>
          )}

          {prof.recentReviews.length > 0 && (
            <div className="reviews-list">
              {prof.recentReviews.slice(0, 2).map((r) => (
                <p key={r.text.slice(0, 40)} className="review-snippet">
                  "{r.text.length > 130 ? r.text.slice(0, 130) + "…" : r.text}"
                </p>
              ))}
            </div>
          )}

          {!feedback && (
            <button
              type="button" className="secondary feedback-btn"
              onClick={handleGetFeedback} disabled={loadingFb}
            >
              {loadingFb ? "Generating…" : "Get AI Prep Summary"}
            </button>
          )}
          {fbError && <p className="error" style={{ marginTop: 8 }}>{fbError}</p>}
          {feedback && <FeedbackDisplay text={feedback} />}
        </>
      ) : (
        <p className="muted-note">Not found on PlanetTerp — no ratings or grade data available.</p>
      )}
    </div>
  );
}

function StarRating({ rating }) {
  const filled = Math.round(rating);
  return (
    <span className="star-rating" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= filled ? "star filled" : "star"}>
          {n <= filled ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function GradeBar({ distribution }) {
  return (
    <div className="grade-bar-wrapper">
      <div className="grade-bar">
        {Object.entries(GRADE_COLORS).map(([grade, color]) => {
          const pct = distribution[grade] || 0;
          if (!pct) return null;
          return (
            <div key={grade} className="grade-bar-segment"
              style={{ width: `${pct}%`, background: color }} title={`${grade}: ${pct}%`} />
          );
        })}
      </div>
      <div className="grade-bar-legend">
        {Object.entries(GRADE_COLORS).map(([grade, color]) => {
          const pct = distribution[grade];
          if (!pct) return null;
          return (
            <span key={grade} className="legend-item">
              <span className="legend-dot" style={{ background: color }} />
              {grade} {pct}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FeedbackDisplay({ text }) {
  const lines  = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const header = lines.find((l) => l.toLowerCase().startsWith("to prep for"));
  const bullets = lines.filter((l) => l !== header);
  return (
    <div className="feedback-content">
      {header && <h4>{header}</h4>}
      {bullets.length > 0 && (
        <ul>
          {bullets.map((b, i) => <li key={i}>{b.replace(/^[-•]\s*/, "")}</li>)}
        </ul>
      )}
    </div>
  );
}
