import type { PreCallGap } from "@/lib/lead-profile";
import type { LvsAuditResponse } from "@/lib/run-audit";

type ActionItemLike = {
  id?: string;
  priority?: string;
  severity?: string;
  title?: string;
  why?: string;
  outcome?: string;
};

/**
 * Build dial talk-track from an LVS audit response.
 * First point is always the audit's top fix (most useful opener).
 */
export function buildCallTrackFromAudit(lvs: LvsAuditResponse): PreCallGap[] {
  const gaps: PreCallGap[] = [];
  const seen = new Set<string>();

  const push = (g: PreCallGap) => {
    const key = g.title.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    gaps.push(g);
  };

  const grade = lvs.grade ?? "?";
  const score = lvs.score;
  const headline = (lvs.headline ?? "").trim();

  if (lvs.topFix?.title) {
    push({
      id: "audit_top_fix",
      severity: "critical",
      title: lvs.topFix.title,
      talk_track:
        lvs.topFix.do_this?.trim() ||
        `Lead with this: we scored them ${grade}${score != null ? `/${score}` : ""} and this is the #1 fix.`,
    });
  } else {
    push({
      id: "audit_score_opener",
      severity: "critical",
      title: `Local Visibility Score: ${grade}${score != null ? ` / ${score}` : ""}`,
      talk_track:
        headline ||
        "Open with the grade and offer to walk the ranked checklist from the PDF.",
    });
  }

  const items = Array.isArray(lvs.actionItems) ? lvs.actionItems : [];
  const ordered = [...items].sort((a, b) => priorityRank(a) - priorityRank(b));

  for (const item of ordered.slice(0, 5)) {
    const title = (item.title ?? "").trim();
    if (!title) continue;
    if (lvs.topFix?.title && title.toLowerCase() === lvs.topFix.title.toLowerCase()) continue;
    const severity = mapSeverity(item.severity, item.severity);
    const talk =
      [item.why, item.outcome].filter(Boolean).join(" → ") ||
      "Walk this fix from the PDF checklist.";
    push({
      id: item.id || `audit_${gaps.length}`,
      severity,
      title,
      talk_track: talk,
    });
  }

  if (gaps.length === 1 && headline) {
    push({
      id: "audit_headline",
      severity: "info",
      title: "Audit headline",
      talk_track: headline,
    });
  }

  return gaps;
}

export function formatAuditCallTrackMarkdown(input: {
  businessName: string;
  grade: string;
  score: number | null;
  reportUrl: string;
  headline?: string | null;
  gaps: PreCallGap[];
}): string {
  const { businessName, grade, score, reportUrl, headline, gaps } = input;
  const lines: string[] = [
    `# Call track — ${businessName}`,
    "",
    `Score: **${grade}${score != null ? ` / ${score}` : ""}**`,
    `PDF: ${reportUrl}`,
  ];
  if (headline) {
    lines.push(`Headline: ${headline}`);
  }
  lines.push("", "## Talking points (from audit)");
  for (const g of gaps) {
    lines.push(`### [${g.severity}] ${g.title}`);
    lines.push(g.talk_track);
    lines.push("");
  }
  lines.push("---");
  lines.push("Dial with point #1 first, then email if no answer.");
  return lines.join("\n");
}

function priorityRank(item: ActionItemLike): number {
  switch (item.priority) {
    case "do_first":
      return 0;
    case "this_week":
      return 1;
    case "keep_going":
      return 3;
    default:
      return 2;
  }
}

function mapSeverity(
  severity: string | undefined,
  priority: string | undefined,
): PreCallGap["severity"] {
  if (severity === "critical" || priority === "do_first") return "critical";
  if (severity === "warning" || priority === "this_week") return "warning";
  return "info";
}
