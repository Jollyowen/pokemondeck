"use client";

import { useState } from "react";
import type { DeckQualityCheck, DeckQualityResult } from "@/types/deck";

function formatTarget(check: DeckQualityCheck): string | null {
  if (!check.target) return null;
  if (Array.isArray(check.target)) return `target ${check.target[0]}\u2013${check.target[1]}`;
  return `target ${check.target.min}+`;
}

function CheckChip({ check }: { check: DeckQualityCheck }) {
  const tone = check.passed ? "success" : check.severity === "hard" ? "danger" : "warning";
  const toneClasses =
    tone === "success"
      ? "border-line bg-success-bg text-success-text"
      : tone === "danger"
        ? "border-danger-border bg-danger-bg text-danger-text"
        : "border-warning-border bg-warning-bg text-warning-text";
  const target = formatTarget(check);
  const mark = check.passed ? "\u2713" : check.severity === "hard" ? "\u2715" : "\u2691";

  return (
    <li className={`rounded-md border px-3 py-2 text-sm ${toneClasses}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          <span aria-hidden="true">{mark}</span> {check.label}
        </span>
        {check.actual !== undefined && (
          <span className="tabular-nums text-xs opacity-80 shrink-0">
            {check.actual}
            {target ? ` (${target})` : ""}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs opacity-90">{check.message}</p>
    </li>
  );
}

/**
 * Collapse-by-default, expand-on-request, per the confirmed UX call in
 * the styling brief — a compact pass/fail summary up front, the full
 * 11-check grid available on demand rather than always shown.
 */
export function DeckQualityPanel({ quality }: { quality: DeckQualityResult }) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = quality.checks.length;
  const passedCount = quality.checks.filter((c) => c.passed).length;
  const hardFailCount = quality.checks.filter((c) => !c.passed && c.severity === "hard").length;
  const softFailCount = quality.checks.filter((c) => !c.passed && c.severity === "soft").length;

  const summaryTone = hardFailCount > 0 ? "danger" : softFailCount > 0 ? "warning" : "success";
  const summaryClasses =
    summaryTone === "danger"
      ? "bg-danger-bg text-danger-text"
      : summaryTone === "warning"
        ? "bg-warning-bg text-warning-text"
        : "bg-success-bg text-success-text";

  const summaryText =
    totalCount === 0
      ? "No quality checks available yet."
      : hardFailCount > 0
        ? `${passedCount}/${totalCount} checks passed \u2014 ${hardFailCount} composition issue${hardFailCount === 1 ? "" : "s"} to address.`
        : softFailCount > 0
          ? `${passedCount}/${totalCount} checks passed \u2014 ${softFailCount} worth a look, nothing blocking.`
          : `${passedCount}/${totalCount} checks passed. This deck's composition looks solid against typical benchmarks for its archetype.`;

  return (
    <div className="space-y-2">
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${summaryClasses}`}
      >
        <span>{summaryText}</span>
        {totalCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="min-h-11 inline-flex items-center shrink-0 text-xs font-medium underline underline-offset-2"
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
        )}
      </div>
      {expanded && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {quality.checks.map((check) => (
            <CheckChip key={check.code} check={check} />
          ))}
        </ul>
      )}
    </div>
  );
}
