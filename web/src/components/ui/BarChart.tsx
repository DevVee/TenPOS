interface BarChartProps {
  data: Record<string, unknown>[]
  valueKey: string
  labelKey: string
  color?: string
  formatValue?: (v: number) => string
  height?: number
}

export function BarChart({ data, valueKey, labelKey, color = '#E5484D', formatValue, height = 180 }: BarChartProps) {
  const values = data.map((d) => Math.max(0, Number(d[valueKey]) || 0))
  const max = Math.max(...values, 1)

  return (
    <div className="w-full flex flex-col" style={{ height }}>
      <div className="flex items-end gap-1 flex-1 pb-5">
        {data.map((d, i) => {
          const pct = (values[i] / max) * 100
          const label = String(d[labelKey] ?? '')
          const tip = formatValue ? formatValue(values[i]) : String(values[i])
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative group">
              {values[i] > 0 && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {tip}
                </div>
              )}
              <div
                className="w-full rounded-t transition-all duration-300"
                style={{
                  height: `${Math.max(pct, values[i] > 0 ? 3 : 0)}%`,
                  backgroundColor: color,
                  opacity: values[i] === 0 ? 0.15 : 1,
                }}
              />
              <span className="absolute bottom-0 text-[9px] text-gray-400 truncate w-full text-center leading-none">
                {label.length > 5 ? label.slice(0, 5) : label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
