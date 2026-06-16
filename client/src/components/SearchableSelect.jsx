import { useState, useRef, useEffect, useMemo } from 'react';

// Dropdown ที่พิมพ์ค้นหา (filter) ได้ — ไม่พึ่ง library ภายนอก
// options: [{ value, label }]
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'เลือก...',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // reset highlight เมื่อ filter เปลี่ยน
  useEffect(() => { setHighlight(0); }, [query]);

  const pick = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) pick(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`} style={{ colorScheme: 'light' }}>
      <button
        type="button"
        className="select select-bordered select-xs w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate" style={{ color: '#000' }}>
          {selected ? selected.label : <span className="opacity-50">{placeholder}</span>}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded-box shadow-lg">
          <div className="p-1.5">
            <input
              autoFocus
              type="text"
              className="input input-bordered input-xs w-full"
              placeholder="🔍 พิมพ์เพื่อค้นหา..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul ref={listRef} className="menu menu-xs p-1 pt-0 max-h-60 overflow-y-auto flex-nowrap">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-base-content/40">ไม่พบรายการ</li>
            ) : (
              filtered.map((opt, i) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    className={`text-xs ${opt.value === value ? 'active' : ''} ${i === highlight ? 'bg-base-200' : ''}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(opt)}
                  >
                    {opt.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
