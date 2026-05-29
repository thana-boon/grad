import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function FacultiesPage() {
  const [unis, setUnis] = useState([]);
  const [selectedUniId, setSelectedUniId] = useState('');
  const [faculties, setFaculties] = useState([]);
  const [loadingFaculties, setLoadingFaculties] = useState(false);
  const [selectedFacultyId, setSelectedFacultyId] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/universities').then(r => setUnis(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedUniId) { setFaculties([]); setSelectedFacultyId(null); setPrograms([]); return; }
    setLoadingFaculties(true);
    setSelectedFacultyId(null);
    setPrograms([]);
    api.get(`/faculties?university_id=${selectedUniId}`)
      .then(r => setFaculties(r.data))
      .catch(() => setFaculties([]))
      .finally(() => setLoadingFaculties(false));
  }, [selectedUniId]);

  useEffect(() => {
    if (!selectedFacultyId) { setPrograms([]); return; }
    setLoadingPrograms(true);
    setSearch('');
    api.get(`/faculties/programs?faculty_id=${selectedFacultyId}`)
      .then(r => setPrograms(r.data))
      .catch(() => setPrograms([]))
      .finally(() => setLoadingPrograms(false));
  }, [selectedFacultyId]);

  const selectedFaculty = faculties.find(f => f.id === selectedFacultyId);

  const filteredPrograms = programs.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.field_name_th || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.campus || '').toLowerCase().includes(search.toLowerCase())
  );

  const TYPE_BADGE = { 'ทปอ.': 'badge-primary', 'ราชภัฏ': 'badge-secondary', 'ราชมงคล': 'badge-accent', 'เอกชน': 'badge-ghost' };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">🏫 คณะและหลักสูตร</h2>
        <p className="text-xs text-base-content/50">ข้อมูลนำเข้าจาก Excel · จัดการผ่านหน้ามหาวิทยาลัย</p>
      </div>

      {/* University Selector */}
      <select
        className="select select-bordered w-full max-w-lg"
        value={selectedUniId}
        onChange={e => setSelectedUniId(e.target.value)}
      >
        <option value="">— เลือกมหาวิทยาลัย —</option>
        {unis.map(u => (
          <option key={u.id} value={u.id}>
            {u.university_type ? `[${u.university_type}] ` : ''}{u.name}
          </option>
        ))}
      </select>

      {!selectedUniId ? (
        <div className="text-center text-base-content/40 py-24 text-sm">
          เลือกมหาวิทยาลัยเพื่อดูคณะและหลักสูตร
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

          {/* Faculties list */}
          <div className="lg:col-span-2 card bg-base-100 shadow border border-base-200">
            <div className="card-body p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">คณะ
                  <span className="badge badge-ghost badge-sm ml-1">{faculties.length}</span>
                </h3>
              </div>
              {loadingFaculties ? (
                <div className="text-center py-10"><span className="loading loading-spinner loading-sm" /></div>
              ) : faculties.length === 0 ? (
                <div className="text-center text-base-content/30 py-10 text-xs">ไม่มีข้อมูลคณะ</div>
              ) : (
                <ul className="space-y-0.5 max-h-[520px] overflow-y-auto">
                  {faculties.map(f => (
                    <li
                      key={f.id}
                      onClick={() => setSelectedFacultyId(f.id)}
                      className={`px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                        selectedFacultyId === f.id
                          ? 'bg-primary text-primary-content font-medium'
                          : 'hover:bg-base-200'
                      }`}
                    >
                      <div className="truncate">{f.name}</div>
                      {f.name_en && <div className="text-xs opacity-60 truncate">{f.name_en}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Programs list */}
          <div className="lg:col-span-3 card bg-base-100 shadow border border-base-200">
            <div className="card-body p-3">
              {!selectedFaculty ? (
                <div className="text-center text-base-content/30 py-24 text-sm">👈 คลิกคณะเพื่อดูหลักสูตร</div>
              ) : (
                <>
                  <div className="mb-2">
                    <h3 className="font-semibold text-sm">หลักสูตร
                      <span className="badge badge-ghost badge-sm ml-1">{programs.length}</span>
                    </h3>
                    <p className="text-xs text-base-content/50 truncate">{selectedFaculty.name}</p>
                  </div>
                  <input
                    type="text"
                    className="input input-bordered input-xs w-full mb-2"
                    placeholder="🔍 ค้นหาหลักสูตร / สาขา / วิทยาเขต..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {loadingPrograms ? (
                    <div className="text-center py-10"><span className="loading loading-spinner loading-sm" /></div>
                  ) : filteredPrograms.length === 0 ? (
                    <div className="text-center text-base-content/30 py-10 text-xs">ไม่พบข้อมูล</div>
                  ) : (
                    <ul className="space-y-1 max-h-[480px] overflow-y-auto">
                      {filteredPrograms.map(p => (
                        <li key={p.id} className="px-3 py-2 rounded-lg bg-base-50 border border-base-200 text-xs">
                          <div className="font-medium text-sm leading-snug">{p.name}</div>
                          {p.program_name_en && <div className="text-base-content/50 text-xs mt-0.5 truncate">{p.program_name_en}</div>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.field_name_th && (
                              <span className="badge badge-outline badge-xs">{p.field_name_th}</span>
                            )}
                            {p.campus && p.campus !== 'วิทยาเขตหลัก' && (
                              <span className="badge badge-ghost badge-xs">📍{p.campus}</span>
                            )}
                            {p.program_type && (
                              <span className="badge badge-info badge-xs opacity-70">{p.program_type}</span>
                            )}
                          </div>
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
    </div>
  );
}
