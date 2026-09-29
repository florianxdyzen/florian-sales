"use client";

import { Input, Label } from "@/components/ui/input";
import {
  applyRowFirstCopy,
  cellsPerRow,
  clampLegCount,
  DEFAULT_STRUCTURE_LEGS,
  MAX_STRUCTURE_LEGS,
  MIN_STRUCTURE_LEGS,
  resizeLegHeights,
  STRUCTURE_ROW_LABELS,
} from "@/lib/leads/structure-legs";

export function StructureLegsFields({
  totalLegs,
  rows,
  onChange,
}: {
  totalLegs: number;
  rows: number[][];
  onChange: (next: { totalLegs: number; rows: number[][] }) => void;
}) {
  const counts = cellsPerRow(totalLegs);

  function setTotal(raw: string) {
    const nextCount = clampLegCount(Number(raw) || DEFAULT_STRUCTURE_LEGS);
    onChange({ totalLegs: nextCount, rows: resizeLegHeights(nextCount, rows) });
  }

  function setCell(rowIndex: number, cellIndex: number, raw: string) {
    const nextValue = Math.max(0, Number(raw) || 0);
    const nextRows = rows.map((row) => [...row]);
    const row = nextRows[rowIndex] ?? Array.from({ length: counts[rowIndex] }, () => 0);
    const previousFirst = Number(row[0]) || 0;
    if (cellIndex === 0) {
      nextRows[rowIndex] = applyRowFirstCopy(row, nextValue, previousFirst);
    } else {
      row[cellIndex] = nextValue;
      nextRows[rowIndex] = row;
    }
    onChange({ totalLegs, rows: nextRows });
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold text-[var(--text-dark)]">3. Structure legs</h3>
      <p className="text-xs text-[var(--text-muted)]">
        Enter total legs, then heights in mm. Two rows (for example front / rear). Typing{" "}
        <strong>1.</strong> copies into the rest of that row; you can still edit 2. and 3.
      </p>
      <div className="max-w-xs">
        <Label htmlFor="won-legs">Total legs</Label>
        <Input
          id="won-legs"
          type="number"
          min={MIN_STRUCTURE_LEGS}
          max={MAX_STRUCTURE_LEGS}
          value={totalLegs || ""}
          onChange={(e) => setTotal(e.target.value)}
        />
      </div>
      <div className="space-y-4">
        {STRUCTURE_ROW_LABELS.map((label, rowIndex) => (
          <div key={label} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {label}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(rows[rowIndex] ?? Array.from({ length: counts[rowIndex] }, () => 0)).map(
                (height, cellIndex) => (
                  <div key={`${rowIndex}-${cellIndex}`}>
                    <Label htmlFor={`won-leg-${rowIndex}-${cellIndex}`}>
                      {cellIndex + 1}. Height (mm)
                    </Label>
                    <Input
                      id={`won-leg-${rowIndex}-${cellIndex}`}
                      type="number"
                      min={1}
                      value={height || ""}
                      onChange={(e) => setCell(rowIndex, cellIndex, e.target.value)}
                    />
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
