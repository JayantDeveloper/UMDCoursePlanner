import { getProfScore, GRADE_COLORS } from "../utils";

export function MiniProfRow({ prof }) {
  const score = getProfScore(prof);
  const dist = prof.grades?.distribution || {};
  const hasDist = Object.values(dist).some(Boolean);

  return (
    <div className="mini-prof-row">
      <div className="mini-prof-identity">
        {score != null && (
          <span className="rec-prof-score" title="Score">{score}</span>
        )}
        {prof.slug ? (
          <a
            href={`https://planetterp.com/professor/${prof.slug}`}
            target="_blank" rel="noreferrer"
            className="mini-prof-name"
          >
            {prof.name}
          </a>
        ) : (
          <span className="mini-prof-name">{prof.name}</span>
        )}
        {prof.avgRating != null && (
          <span className="rec-prof-rating">★ {prof.avgRating.toFixed(1)}</span>
        )}
        {prof.grades?.avgGpa != null && (
          <span className="rec-prof-gpa">GPA {prof.grades.avgGpa}</span>
        )}
        {prof.grades?.aRate != null && (
          <span className="rec-prof-gpa">A {prof.grades.aRate}%</span>
        )}
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
          <div
            key={grade}
            style={{ flex: `0 0 ${pct}%`, background: color }}
            title={`${grade}: ${pct}%`}
          />
        );
      })}
    </div>
  );
}
