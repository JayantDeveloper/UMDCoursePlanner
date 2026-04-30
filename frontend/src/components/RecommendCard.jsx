import { useState } from "react";
import axios from "axios";
import { getProfScore, PRIORITY_COLORS } from "../utils";
import { MiniProfRow } from "./MiniProfRow";

async function fetchProfessorsForCourse(courseId, termId, backendUrl) {
  const sectionsResp = await axios.post(`${backendUrl}/api/sections`, { courseId, termId });
  const compareResp = await axios.post(`${backendUrl}/api/compare`, {
    courseId, professors: sectionsResp.data.professors,
  });
  return compareResp.data;
}

function tagClass(tag) {
  if (tag === "Major Required") return "tag-major-req";
  if (tag === "Major Elective") return "tag-major-elec";
  if (tag === "Minor Required") return "tag-minor-req";
  if (tag === "Minor Elective") return "tag-minor-elec";
  if (tag.startsWith("Gen-Ed")) return "tag-gened";
  if (tag === "Upper Division") return "tag-upper";
  if (tag === "Check Prereqs")  return "tag-prereq-warn";
  return "tag-other";
}

export function RecommendCard({ rec, isCompleted, bestProf, backendUrl, termId, onOpenProfModal }) {
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
      <div className="rec-card-header">
        <div>
          <span className="rec-course-id">{rec.course_id}</span>
          <span
            className="priority-dot"
            style={{ background: priorityColor }}
            title={`${rec.priority} priority`}
          />
        </div>
        {rec.credits && <span className="rec-credits">{rec.credits} cr</span>}
      </div>

      <p className="rec-name">{rec.name}</p>

      {tags.length > 0 && (
        <div className="rec-tags">
          {tags.map((t) => (
            <span key={t} className={`rec-tag ${tagClass(t)}`}>{t}</span>
          ))}
        </div>
      )}

      {rec.fulfills && <p className="rec-fulfills">{rec.fulfills}</p>}
      <p className="rec-reason">{rec.reason}</p>
      {rec.prereqs && <p className="rec-prereqs">Prereqs: {rec.prereqs}</p>}

      {isCompleted ? (
        <p className="rec-done">✓ Already completed</p>
      ) : (
        <>
          {!expanded && bestProf && (
            <div className="rec-best-prof">
              <span className="rec-prof-label">Best prof this semester</span>
              <div className="rec-prof-row">
                {bestProf.slug ? (
                  <a
                    href={`https://planetterp.com/professor/${bestProf.slug}`}
                    target="_blank" rel="noreferrer"
                    className="rec-prof-name"
                  >
                    {bestProf.name}
                  </a>
                ) : (
                  <span className="rec-prof-name">{bestProf.name}</span>
                )}
                <div className="rec-prof-stats">
                  {bestProf.score != null && (
                    <span className="rec-prof-score" title="Score">{bestProf.score}</span>
                  )}
                  {bestProf.avgRating != null && (
                    <span className="rec-prof-rating">★ {bestProf.avgRating.toFixed(1)}</span>
                  )}
                  {bestProf.avgGpa != null && (
                    <span className="rec-prof-gpa">GPA {bestProf.avgGpa}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {expanded && (
            <div className="inline-profs">
              <p className="inline-profs-title">All professors — ranked by Score</p>
              {loadingProfs && <p className="inline-profs-loading">Loading…</p>}
              {profsError && (
                <p className="error" style={{ fontSize: 13 }}>{profsError}</p>
              )}
              {allProfs.map((prof) => (
                <MiniProfRow key={prof.name} prof={prof} />
              ))}
              {allProfs.length > 0 && (
                <button
                  type="button"
                  className="secondary open-full-btn"
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
