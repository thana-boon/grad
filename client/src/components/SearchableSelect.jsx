import { useState, useRef, useEffect, useMemo } from 'react';
import Icon from './ui/Icon';

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
        className="input input-xs flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${selected ? '' : 'text-base-content/45'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon
          name="chevronDown"
          size={13}
          className={`text-base-content/45 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="anim-scale-in absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg">
          <div className="relative p-1.5">
            <Icon
              name="search"
              size={13}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40"
            />
            <input
              autoFocus
              type="text"
              className="input input-xs w-full pl-7"
              placeholder="พิมพ์เพื่อค้นหา..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul ref={listRef} className="max-h-60 overflow-y-auto p-1 pt-0" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-base-content/45">ไม่พบรายการ</li>
            ) : (
              filtered.map((opt, i) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                      i === highlight ? 'bg-secondary' : ''
                    } ${opt.value === value ? 'font-medium text-primary' : ''}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(opt)}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.value === value && <Icon name="check" size={13} strokeWidth={2.2} />}
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
