const chartValue = (item, metric) => Number(item?.[metric]) || 0;

export default function DashboardChart({
  data = [],
  metric = "bookings",
  color = "#ef6f61",
  height = 180,
  type = "line",
}) {
  const values = data.map((item) => chartValue(item, metric));
  const max = Math.max(...values, 1);

  if (!data.length) {
    return (
      <div
        className="grid rounded-2xl bg-slate-50 text-sm font-semibold text-ink/45"
        style={{ height }}
      >
        <span className="m-auto">No chart data yet.</span>
      </div>
    );
  }

  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 100;
    const y = 84 - (value / max) * 68;
    return `${x},${y}`;
  });
  const area = `0,92 ${points.join(" ")} 100,92`;

  return (
    <div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
        aria-hidden="true"
      >
        {[20, 40, 60, 80].map((y) => (
          <line
            key={y}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            stroke="rgba(36,23,42,0.08)"
            strokeWidth="0.5"
          />
        ))}

        {type === "bar" ? (
          values.map((value, index) => {
            const width = 70 / Math.max(values.length, 1);
            const gap = 30 / Math.max(values.length + 1, 1);
            const x = gap + index * (width + gap);
            const barHeight = (value / max) * 70;
            return (
              <rect
                key={`${data[index]?.label}-${index}`}
                x={x}
                y={90 - barHeight}
                width={width}
                height={barHeight}
                rx="1.5"
                fill={color}
                opacity="0.82"
              />
            );
          })
        ) : (
          <>
            <polygon points={area} fill={color} opacity="0.12" />
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke={color}
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
      <div className="mt-2 grid grid-flow-col gap-2 text-center text-xs font-bold text-ink/35">
        {data.map((item, index) => (
          <span key={`${item.key || item.label}-${index}`}>{item.label}</span>
        ))}
      </div>
    </div>
  );
}
