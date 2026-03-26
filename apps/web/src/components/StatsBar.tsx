interface StatsBarProps {
  passed: number;
  failed: number;
  total: number;
  passRate: number;
}

export function StatsBar({ passed, failed, total, passRate }: StatsBarProps) {
  const passWidth = total > 0 ? (passed / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-3">
          <span className="text-[#3fb950]">{passed} passed</span>
          <span className="text-[#f85149]">{failed} failed</span>
        </div>
        <span className="text-[#8b949e]">{total} total</span>
      </div>
      <div className="h-2 bg-[#30363d] rounded-full overflow-hidden flex">
        {total > 0 && (
          <>
            <div
              className="bg-[#3fb950] transition-all duration-500"
              style={{ width: `${passWidth}%` }}
            />
            <div
              className="bg-[#f85149] transition-all duration-500"
              style={{ width: `${100 - passWidth}%` }}
            />
          </>
        )}
      </div>
      <div className="text-right text-xs text-[#8b949e]">{passRate}% pass rate</div>
    </div>
  );
}
