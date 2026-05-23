// ─────────────────────────────────────────────────────────────────────────────
// AddressAutocomplete — debounced OpenStreetMap Nominatim address search
// Philippines-scoped (countrycodes=ph). No API key required.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader2 } from 'lucide-react'

interface Suggestion { place_id: number; display_name: string }

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function AddressAutocomplete({ value, onChange, placeholder = 'Start typing an address…', className = '' }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading,     setLoading]     = useState(false)
  const [open,        setOpen]        = useState(false)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 4) { setSuggestions([]); setOpen(false); return }
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ph&limit=5&addressdetails=0`
      const res  = await fetch(url, {
        signal: abortRef.current.signal,
        headers: { 'Accept-Language': 'en' },
      })
      if (!res.ok) throw new Error('Network error')
      const data: Suggestion[] = await res.json()
      setSuggestions(data)
      setOpen(data.length > 0)
    } catch {
      // Ignore abort errors; silently fail for network issues
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(v), 500)
  }

  const handleSelect = (s: Suggestion) => {
    // Shorten the full Nominatim display_name to a clean local address
    // (Nominatim returns "Street, Barangay, City, Province, Region, Philippines")
    const parts = s.display_name.split(', ')
    const phIdx = parts.findLastIndex((p) => p.toLowerCase() === 'philippines')
    const localParts = phIdx > 0 ? parts.slice(0, phIdx) : parts
    // Drop long trailing region strings (keep first 4 meaningful parts max)
    const clean = localParts.slice(0, Math.min(localParts.length, 5)).join(', ')
    onChange(clean)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          className="input-base pl-9 pr-9"
          placeholder={placeholder}
          value={value}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-panel overflow-hidden">
          {suggestions.map((s) => (
            <li
              key={s.place_id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
              className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 border-b border-gray-50 last:border-0 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
              <span className="line-clamp-2">{s.display_name}</span>
            </li>
          ))}
          <li className="px-3 py-1.5 text-[10px] text-gray-300 text-right">
            © OpenStreetMap contributors
          </li>
        </ul>
      )}
    </div>
  )
}
