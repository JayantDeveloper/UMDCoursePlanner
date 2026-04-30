export const GRADE_COLORS = { A: "#4ade80", B: "#60a5fa", C: "#fbbf24", D: "#f97316", F: "#f87171" };
export const PRIORITY_COLORS = { High: "#4ade80", Medium: "#fbbf24", default: "#94a3b8" };

// Returns a background color for a 0–100 score: red (0) → amber (50) → green (100)
export function scoreColor(score) {
  if (score == null) return "#1f1a1f";
  const hue = Math.round((score / 100) * 120); // 0=red, 60=amber, 120=green
  return `hsl(${hue}, 72%, 40%)`;
}

export function getProfScore(prof) {
  const r = prof.avgRating != null ? prof.avgRating / 5 : null;
  const g = prof.grades?.avgGpa != null ? prof.grades.avgGpa / 4 : null;
  if (r == null && g == null) return null;
  if (r == null) return Math.round(g * 100);
  if (g == null) return Math.round(r * 100);
  return Math.round((r * 0.6 + g * 0.4) * 100);
}

export function sortProfs(profs, sortBy) {
  return [...profs].sort((a, b) => {
    let va, vb;
    if (sortBy === "rating") {
      va = a.avgRating ?? -1; vb = b.avgRating ?? -1;
    } else if (sortBy === "gpa") {
      va = a.grades?.avgGpa ?? -1; vb = b.grades?.avgGpa ?? -1;
    } else {
      va = getProfScore(a) ?? -1; vb = getProfScore(b) ?? -1;
    }
    return vb - va;
  });
}
