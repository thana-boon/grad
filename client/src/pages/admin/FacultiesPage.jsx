import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

export default function FacultiesPage() {
  // Universities
  const [unis, setUnis] = useState([]);

  // Faculties
  const [selectedUniId, setSelectedUniId] = useState('');
  const [faculties, setFaculties] = useState([]);
  const [loadingFaculties, setLoadingFaculties] = useState(false);
  const [selectedFacultyId, setSelectedFacultyId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState(null);
  const [syncingPrograms, setSyncingPrograms] = useState(false);
  const [syncProgramsResult, setSyncProgramsResult] = useState(null);

  // Programs
  const [programs, setPrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  // Faculty modal
  const [facultyModal, setFacultyModal] = useState(false);
  const [editFaculty, setEditFaculty] = useState(null);
  const [facultyName, setFacultyName] = useState('');
  const [savingFaculty, setSavingFaculty] = useState(false);
  const [facultyError, setFacultyError] = useState('');

  // Program modal
  const [programModal, setProgramModal] = useState(false);
  const [editProgram, setEditProgram] = useState(null);
  const [programName, setProgramName] = useState('');
  const [savingProgram, setSavingProgram] = useState(false);
  const [programError, setProgramError] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null); // { type, id, name }
  const [deleting, setDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // โหลดรายการมหาวิทยาลัย
  useEffect(() => {
    api.get('/universities').then((r) => setUnis(r.data)).catch(() => {});
  }, []);

  // โหลดคณะเมื่อเปลี่ยนมหาวิทยาลัย
  useEffect(() => {
    if (!selectedUniId) {
      setFaculties([]);
      setSelectedFacultyId(null);
      setPrograms([]);
      setSyncResult(null);
      return;
    }
    setLoadingFaculties(true);
    setSelectedFacultyId(null);
    setPrograms([]);
    setSyncResult(null);
    api
      .get(`/faculties?university_id=${selectedUniId}`)
      .then((r) => setFaculties(r.data))
      .catch(() => setFaculties([]))
      .finally(() => setLoadingFaculties(false));
  }, [selectedUniId]);

  // โหลดสาขาเมื่อเลือกคณะ
  useEffect(() => {
    if (!selectedFacultyId) { setPrograms([]); return; }
    setLoadingPrograms(true);
    api
      .get(`/faculties/programs?faculty_id=${selectedFacultyId}`)
      .then((r) => setPrograms(r.data))
      .catch(() => setPrograms([]))
      .finally(() => setLoadingPrograms(false));
  }, [selectedFacultyId]);

  // ── Sync คณะ ─────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (!selectedUniId) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await api.post('/faculties/sync', { university_id: selectedUniId });
      setSyncResult(r.data);
      setFaculties(r.data.faculties || []);
      showToast(r.data.message);
    } catch (err) {
      showToast(err.response?.data?.message || 'Sync ไม่สำเร็จ', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ── Sync สาขา ทุกคณะ ทุกมหาลัย ────────────────────────────────────────────────
  const handleSyncPrograms = async () => {
    setSyncingPrograms(true);
    setSyncProgramsResult(null);
    try {
      const r = await api.post('/faculties/sync-programs-global', {}, { timeout: 600000 });
      setSyncProgramsResult(r.data);
      // รีโหลดสาขาที่แสดงอยู่ถ้าเลือกคณะเอาไว้
      if (selectedFacultyId) {
        const pr = await api.get(`/faculties/programs?faculty_id=${selectedFacultyId}`);
        setPrograms(pr.data);
      }
      // รีโหลดคณะถ้าเลือกมหาลัยเอาไว้
      if (selectedUniId) {
        const fr = await api.get(`/faculties?university_id=${selectedUniId}`);
        setFaculties(fr.data);
      }
      showToast(r.data.message);
    } catch (err) {
      showToast(err.response?.data?.message || 'Sync สาขาไม่สำเร็จ', 'error');
    } finally {
      setSyncingPrograms(false);
    }
  };

  // ── Sync ทุกมหาลัย ──────────────────────────────────────────────────────────
  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncAllResult(null);
    try {
      const r = await api.post('/faculties/sync-all', {}, { timeout: 300000 });
      setSyncAllResult(r.data);
      // ถ้าเลือกมหาลัยอยู่ ให้รีโหลดคณะด้วย
      if (selectedUniId) {
        const fr = await api.get(`/faculties?university_id=${selectedUniId}`);
        setFaculties(fr.data);
      }
      showToast(r.data.message);
    } catch (err) {
      showToast(err.response?.data?.message || 'Sync ไม่สำเร็จ', 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  // ── Faculty Modal ─────────────────────────────────────────────────────────────
  const openFacultyModal = (faculty = null) => {
    setEditFaculty(faculty);
    setFacultyName(faculty?.name || '');
    setFacultyError('');
    setFacultyModal(true);
  };

  const handleSaveFaculty = async () => {
    if (!facultyName.trim()) { setFacultyError('กรุณากรอกชื่อคณะ'); return; }
    setSavingFaculty(true);
    setFacultyError('');
    try {
      if (editFaculty) {
        const r = await api.put(`/faculties/${editFaculty.id}`, { name: facultyName.trim() });
        setFaculties((prev) => prev.map((x) => (x.id === editFaculty.id ? r.data : x)));
        showToast('แก้ไขคณะสำเร็จ');
      } else {
        const r = await api.post('/faculties', { university_id: selectedUniId, name: facultyName.trim() });
        setFaculties((prev) => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name, 'th')));
        showToast('เพิ่มคณะสำเร็จ');
      }
      setFacultyModal(false);
    } catch (err) {
      setFacultyError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingFaculty(false);
    }
  };

  // ── Program Modal ─────────────────────────────────────────────────────────────
  const openProgramModal = (program = null) => {
    setEditProgram(program);
    setProgramName(program?.name || '');
    setProgramError('');
    setProgramModal(true);
  };

  const handleSaveProgram = async () => {
    if (!programName.trim()) { setProgramError('กรุณากรอกชื่อสาขา'); return; }
    setSavingProgram(true);
    setProgramError('');
    try {
      if (editProgram) {
        const r = await api.put(`/faculties/programs/${editProgram.id}`, { name: programName.trim() });
        setPrograms((prev) => prev.map((x) => (x.id === editProgram.id ? r.data : x)));
        showToast('แก้ไขสาขาสำเร็จ');
      } else {
        const r = await api.post('/faculties/programs', { faculty_id: selectedFacultyId, name: programName.trim() });
        setPrograms((prev) => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name, 'th')));
        showToast('เพิ่มสาขาสำเร็จ');
      }
      setProgramModal(false);
    } catch (err) {
      setProgramError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingProgram(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'faculty') {
        await api.delete(`/faculties/${deleteTarget.id}`);
        setFaculties((prev) => prev.filter((x) => x.id !== deleteTarget.id));
        if (selectedFacultyId === deleteTarget.id) { setSelectedFacultyId(null); setPrograms([]); }
        showToast('ลบคณะสำเร็จ');
      } else {
        await api.delete(`/faculties/programs/${deleteTarget.id}`);
        setPrograms((prev) => prev.filter((x) => x.id !== deleteTarget.id));
        showToast('ลบสาขาสำเร็จ');
      }
      setDeleteTarget(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'ลบไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const selectedFaculty = faculties.find((f) => f.id === selectedFacultyId);
  const selectedUni = unis.find((u) => u.id === parseInt(selectedUniId));

  return (
    <div className="p-6 space-y-5">
      {/* Toast */}
      {toast && (
        <div className="toast toast-top toast-end z-50">
          <div className={`alert ${toast.type === 'error' ? 'alert-error' : 'alert-success'} shadow-lg`}>
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">🏫 จัดการคณะและสาขา</h1>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={handleSyncAll}
            disabled={syncingAll || syncingPrograms}
            title="Sync คณะมาตรฐานให้ทุกมหาวิทยาลัยในคราวเดียว"
          >
            {syncingAll
              ? <><span className="loading loading-spinner loading-xs" /> กำลัง Sync...</>
              : '🔄 Sync คณะ ทุกมหาลัย'}
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleSyncPrograms}
            disabled={syncingPrograms || syncingAll}
            title="Sync สาขามาตรฐานให้ทุกคณะ ทุกมหาวิทยาลัย (สร้างคณะใหม่ถ้ายังไม่มี)"
          >
            {syncingPrograms
              ? <><span className="loading loading-spinner loading-xs" /> กำลัง Sync...</>
              : '🔄 Sync สาขา ทุกมหาลัย'}
          </button>
        </div>
      </div>

      {(syncAllResult || syncProgramsResult) && (
        <div className="alert alert-success py-2 text-sm">
          ✅ {syncProgramsResult?.message || syncAllResult?.message}
        </div>
      )}

      {/* University Selector */}
      <div className="card bg-base-100 shadow">
        <div className="card-body py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-sm whitespace-nowrap">มหาวิทยาลัย:</span>
            <select
              className="select select-bordered flex-1 min-w-64"
              value={selectedUniId}
              onChange={(e) => setSelectedUniId(e.target.value)}
            >
              <option value="">— เลือกมหาวิทยาลัย —</option>
              {unis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.short_name ? `${u.short_name} — ` : ''}{u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedUniId ? (
        <div className="text-center text-base-content/40 py-24 text-sm">
          กรุณาเลือกมหาวิทยาลัยเพื่อจัดการคณะและสาขา
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* ─── Left: Faculties ─── */}
          <div className="card bg-base-100 shadow">
            <div className="card-body p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-bold text-lg">
                  คณะ{' '}
                  <span className="badge badge-neutral badge-sm">{faculties.length}</span>
                </h2>
                <div className="flex gap-2">
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={handleSync}
                    disabled={syncing}
                    title="Sync คณะจาก Wikipedia หรือรายการมาตรฐาน"
                  >
                    {syncing ? <span className="loading loading-spinner loading-xs" /> : '🔄'}
                    Sync คณะ
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => openFacultyModal()}>
                    ➕ เพิ่มคณะ
                  </button>
                </div>
              </div>

              {syncResult && (
                <div className="alert alert-success py-2 text-xs mb-3">
                  ✅ {syncResult.message}{' '}
                  <span className="opacity-60">(source: {syncResult.source})</span>
                </div>
              )}

              {loadingFaculties ? (
                <div className="text-center py-10">
                  <span className="loading loading-spinner" />
                </div>
              ) : faculties.length === 0 ? (
                <div className="text-center text-base-content/40 py-10 text-sm">
                  ยังไม่มีคณะ — กด <strong>Sync คณะ</strong> หรือ <strong>เพิ่มคณะ</strong>
                </div>
              ) : (
                <ul className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                  {faculties.map((f) => {
                    const isSelected = selectedFacultyId === f.id;
                    return (
                      <li
                        key={f.id}
                        className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary text-primary-content' : 'hover:bg-base-200'
                        }`}
                        onClick={() => setSelectedFacultyId(f.id)}
                      >
                        <span className="flex-1 text-sm truncate">{f.name}</span>
                        <button
                          className="btn btn-xs btn-ghost opacity-60 hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); openFacultyModal(f); }}
                          title="แก้ไข"
                        >
                          ✏️
                        </button>
                        <button
                          className={`btn btn-xs btn-ghost opacity-60 hover:opacity-100 ${isSelected ? '' : 'hover:text-error'}`}
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'faculty', id: f.id, name: f.name }); }}
                          title="ลบ"
                        >
                          🗑️
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ─── Right: Programs ─── */}
          <div className="card bg-base-100 shadow">
            <div className="card-body p-4">
              {!selectedFaculty ? (
                <div className="text-center text-base-content/40 py-24 text-sm">
                  👈 คลิกคณะเพื่อดูและจัดการสาขา
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <h2 className="font-bold text-lg">
                        สาขา{' '}
                        <span className="badge badge-neutral badge-sm">{programs.length}</span>
                      </h2>
                      <p className="text-xs text-base-content/50 truncate">{selectedFaculty.name}</p>
                    </div>
                    <button className="btn btn-sm btn-primary shrink-0" onClick={() => openProgramModal()}>
                      ➕ เพิ่มสาขา
                    </button>
                  </div>

                  {loadingPrograms ? (
                    <div className="text-center py-10">
                      <span className="loading loading-spinner" />
                    </div>
                  ) : programs.length === 0 ? (
                    <div className="text-center text-base-content/40 py-10 text-sm">
                      ยังไม่มีสาขา — กด <strong>เพิ่มสาขา</strong>
                    </div>
                  ) : (
                    <ul className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                      {programs.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-base-200 transition-colors"
                        >
                          <span className="flex-1 text-sm truncate">{p.name}</span>
                          <button
                            className="btn btn-xs btn-ghost opacity-60 hover:opacity-100"
                            onClick={() => openProgramModal(p)}
                            title="แก้ไข"
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-xs btn-ghost opacity-60 hover:opacity-100 hover:text-error"
                            onClick={() => setDeleteTarget({ type: 'program', id: p.id, name: p.name })}
                            title="ลบ"
                          >
                            🗑️
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ─── Faculty Modal ─────────────────────────────────────────────────────── */}
      {facultyModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-4">
              {editFaculty ? '✏️ แก้ไขคณะ' : '➕ เพิ่มคณะ'}
            </h3>
            {selectedUni && (
              <p className="text-xs text-base-content/50 mb-3">{selectedUni.name}</p>
            )}
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">ชื่อคณะ *</span>
              </label>
              <input
                className="input input-bordered"
                value={facultyName}
                onChange={(e) => setFacultyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveFaculty()}
                placeholder="เช่น คณะวิศวกรรมศาสตร์"
                autoFocus
              />
            </div>
            {facultyError && <p className="text-error text-sm mb-3">{facultyError}</p>}
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setFacultyModal(false)} disabled={savingFaculty}>
                ยกเลิก
              </button>
              <button className="btn btn-primary" onClick={handleSaveFaculty} disabled={savingFaculty}>
                {savingFaculty && <span className="loading loading-spinner loading-sm" />}
                บันทึก
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !savingFaculty && setFacultyModal(false)} />
        </div>
      )}

      {/* ─── Program Modal ──────────────────────────────────────────────────────── */}
      {programModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-1">
              {editProgram ? '✏️ แก้ไขสาขา' : '➕ เพิ่มสาขา'}
            </h3>
            {selectedFaculty && (
              <p className="text-xs text-base-content/50 mb-4">{selectedFaculty.name}</p>
            )}
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">ชื่อสาขา *</span>
              </label>
              <input
                className="input input-bordered"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveProgram()}
                placeholder="เช่น วิศวกรรมไฟฟ้า"
                autoFocus
              />
            </div>
            {programError && <p className="text-error text-sm mb-3">{programError}</p>}
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setProgramModal(false)} disabled={savingProgram}>
                ยกเลิก
              </button>
              <button className="btn btn-primary" onClick={handleSaveProgram} disabled={savingProgram}>
                {savingProgram && <span className="loading loading-spinner loading-sm" />}
                บันทึก
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !savingProgram && setProgramModal(false)} />
        </div>
      )}

      {/* ─── Delete Confirm Modal ───────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-3">⚠️ ยืนยันการลบ</h3>
            <p className="text-sm mb-1">
              {deleteTarget.type === 'faculty' ? 'ลบคณะ' : 'ลบสาขา'}:{' '}
              <strong>{deleteTarget.name}</strong>
            </p>
            {deleteTarget.type === 'faculty' && (
              <p className="text-xs text-warning mt-2">
                การลบคณะจะลบสาขาทั้งหมดในคณะนี้โดยอัตโนมัติ
              </p>
            )}
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                ยกเลิก
              </button>
              <button className="btn btn-error" onClick={handleDelete} disabled={deleting}>
                {deleting && <span className="loading loading-spinner loading-sm" />}
                ลบ
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)} />
        </div>
      )}
    </div>
  );
}
