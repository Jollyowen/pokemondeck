import type { DeckQualityResult } from "@/types/deck";

export function DeckQualityPanel({ quality }: { quality: DeckQualityResult }) {
  const hardIssues = quality.issues.filter((i) => i.severity === "hard");
  const softIssues = quality.issues.filter((i) => i.severity === "soft");

  if (quality.issues.length === 0) {
    return (
      <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
        This deck&apos;s composition looks solid against typical benchmarks for its archetype.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {hardIssues.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-1">
            Composition issues ({hardIssues.length})
          </h3>
          <ul className="space-y-1">
            {hardIssues.map((issue, i) => (
              <li key={i} className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {softIssues.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-500 mb-1">
            Worth a look ({softIssues.length})
          </h3>
          <ul className="space-y-1">
            {softIssues.map((issue, i) => (
              <li key={i} className="text-sm text-neutral-600 bg-neutral-50 rounded-md px-3 py-2">
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
