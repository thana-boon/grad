import Icon from './Icon';

/**
 * ชิ้นส่วน UI ที่ทุกหน้าใช้ร่วมกัน — มีที่เดียวเพื่อให้หัวข้อ/การ์ด/ตาราง
 * หน้าตาเหมือนกันหมด ไม่ต้องไปนั่งจำ class ในแต่ละหน้า
 */

/* ── หัวข้อหน้า ───────────────────────────────────────────────
   ชิปไอคอนม่วง + ชื่อหน้า + คำอธิบาย และช่องขวาไว้วางตัวกรอง/ปุ่ม */
export function PageHeader({ icon, title, subtitle, children }) {
  return (
    <div className="anim-fade-up mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="gt-chip size-10">
            <Icon name={icon} size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-xs text-base-content/55">{subtitle}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}

/* ── หัวข้อภายในการ์ด ─────────────────────────────────────── */
export function SectionTitle({ icon, children, action }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="gt-chip size-8">
            <Icon name={icon} size={16} />
          </span>
        )}
        <h2 className="text-sm font-semibold sm:text-base">{children}</h2>
      </div>
      {action}
    </div>
  );
}

/* ── กล่องเนื้อหา ─────────────────────────────────────────── */
export function Panel({ className = '', children, ...rest }) {
  return (
    <div className={`card bg-base-100 ${className}`} {...rest}>
      {children}
    </div>
  );
}

/* ── ตาราง: ครอบให้เลื่อนแนวนอนได้โดยไม่ดันหน้าให้ล้น ─────────
   sticky: จำกัดความสูงกล่อง + ตรึงหัวตารางไว้ (ใช้กับตารางที่แถวเยอะ) */
export function TableWrap({ className = '', sticky = false, children }) {
  return (
    <div className={`card overflow-hidden bg-base-100 ${className}`}>
      <div className={sticky ? 'table-scroll' : 'overflow-x-auto'}>{children}</div>
    </div>
  );
}

/* ── สถานะว่าง: บอกด้วยว่าให้ทำอะไรต่อ ไม่ใช่แค่ "ไม่มีข้อมูล" ── */
export function EmptyState({ icon = 'inbox', title, hint, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <span className="gt-chip mb-3 size-12">
        <Icon name={icon} size={24} />
      </span>
      <p className="text-sm font-medium text-base-content/80">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-base-content/50">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── โครงร่างระหว่างโหลด: กันหน้ากระตุกตอนข้อมูลมา ────────── */
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="py-3">
              <span
                className="gt-skeleton block h-3.5"
                style={{ width: c === 0 ? '1.5rem' : `${55 + ((r + c) % 4) * 12}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function CardSkeleton({ className = '' }) {
  return <span className={`gt-skeleton block ${className}`} />;
}

/* ── Badge ตามความหมาย (ห้ามสื่อด้วยสีอย่างเดียว จึงมีข้อความเสมอ) ── */
const TONES = {
  primary: 'badge-soft-primary',
  success: 'badge-soft-success',
  error: 'badge-soft-error',
  navy: 'badge-soft-navy',
  gold: 'badge-gold',
  muted: 'badge-ghost',
};

export function Tag({ tone = 'muted', icon, children, className = '' }) {
  return (
    <span className={`badge badge-sm gap-1 ${TONES[tone] || TONES.muted} ${className}`}>
      {icon && <Icon name={icon} size={12} strokeWidth={2} />}
      {children}
    </span>
  );
}

/* ── Toast: ประกาศให้ screen reader ด้วย และไม่แย่งโฟกัส ──── */
export function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.type === 'error';
  return (
    <div className="toast toast-top toast-end z-[60]" role="status" aria-live="polite">
      <div
        className={`alert ${isError ? 'alert-error' : 'alert-success'} anim-scale-in py-2.5 text-sm shadow-lg`}
      >
        <Icon name={isError ? 'alert' : 'checkCircle'} size={16} />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

/* ── ตัวหมุนระหว่างโหลด พร้อมข้อความกำกับ ────────────────── */
export function Loading({ label = 'กำลังโหลด...', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-12 text-sm text-base-content/50 ${className}`}>
      <span className="loading loading-spinner loading-sm" />
      {label}
    </div>
  );
}

export { Icon };
