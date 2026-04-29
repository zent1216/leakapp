import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  ClipboardList,
  Download,
  FileText,
  LogOut,
  Plus,
  ShieldCheck,
  Settings,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { auth, googleProvider } from './lib/firebase';
import {
  deleteJobPhoto,
  getCompany,
  removeJob,
  saveClient,
  saveCompany,
  saveJob,
  uploadCompanyAsset,
  uploadJobPhoto,
  watchClients,
  watchJobs,
} from './lib/data';
import { jobTotal, money, netProfit, shortMoney, uid } from './lib/utils';
import type { Client, Company, CostItem, Job, JobPhoto, PhotoGroup } from './types/app';
import './styles.css';

type Tab = 'today' | 'jobs' | 'new' | 'clients' | 'docs' | 'stats' | 'as' | 'settings';
type DocumentType = 'estimate' | 'opinion' | 'insurance';

const leakTypes = ['배관 누수', '수전 누수', '옥상 방수', '외벽 누수', '화장실 방수', '지하 누수', '기타'];

const emptyJob = (ownerId: string): Job => ({
  id: '',
  ownerId,
  clientName: '',
  clientPhone: '',
  clientCompany: '',
  address: '',
  addressDetail: '',
  locationMemo: '',
  workDate: new Date().toISOString().slice(0, 10),
  status: 'pending',
  leakType: '배관 누수',
  beforeNote: '',
  actionNote: '',
  afterNote: '',
  expertOpinion: '',
  costItems: [{ id: uid(), name: '누수 탐지 및 보수', amount: 0 }],
  commissions: [],
  photos: [],
  memo: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [msg, setMsg] = useState('');

  async function submit() {
    try {
      setMsg('처리 중입니다...');
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, pw);
      else await createUserWithEmailAndPassword(auth, email, pw);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    }
  }

  return (
    <main className="login">
      <div className="logo">누수</div>
      <h1>누수설비 업무관리</h1>
      <p>현장 기록, 사진, 견적서, 소견서, 매출 관리를 한곳에서 처리합니다.</p>
      <input placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="비밀번호" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button onClick={submit}>{mode === 'login' ? '로그인' : '회원가입'}</button>
      <button className="secondary" onClick={() => signInWithPopup(auth, googleProvider)}>
        Google 로그인
      </button>
      <button className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? '새 계정 만들기' : '로그인으로 돌아가기'}
      </button>
      {msg && <p className="warn">{msg}</p>}
    </main>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      }),
    [],
  );

  if (loading) return <div className="loading">불러오는 중...</div>;
  return user ? <Workspace user={user} /> : <Login />;
}

function Workspace({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('today');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);

  useEffect(() => {
    const stopJobs = watchJobs(user.uid, setJobs);
    const stopClients = watchClients(user.uid, setClients);
    getCompany(user.uid).then(setCompany);
    return () => {
      stopJobs();
      stopClients();
    };
  }, [user.uid]);

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthJobs = jobs.filter((job) => job.workDate?.startsWith(monthPrefix));
  const doneJobs = monthJobs.filter((job) => job.status === 'done');
  const asJobs = jobs.filter((job) => job.status === 'as');
  const pendingJobs = monthJobs.filter((job) => job.status !== 'done');
  const revenue = doneJobs.reduce((sum, job) => sum + jobTotal(job), 0);
  const profit = doneJobs.reduce((sum, job) => sum + netProfit(job), 0);
  const nav = [
    { id: 'today', label: '오늘', icon: <CalendarDays /> },
    { id: 'jobs', label: '현장', icon: <Wrench /> },
    { id: 'new', label: '등록', icon: <Plus /> },
    { id: 'clients', label: '고객', icon: <Users /> },
    { id: 'docs', label: '문서', icon: <FileText /> },
    { id: 'settings', label: '사업자', icon: <Settings /> },
  ] as const;

  return (
    <div className="shell">
      <header>
        <div>
          <b>{user.displayName || user.email?.split('@')[0]}</b> 사장님, 오늘도 화이팅!
        </div>
        <button className="ghost" onClick={() => signOut(auth)}>
          <LogOut size={16} /> 로그아웃
        </button>
      </header>
      <section className="stats">
        <Stat label="이달 완료" value={doneJobs.length} tone="green" />
        <Stat label="진행중" value={pendingJobs.length} tone="orange" />
        <Stat label="이달 수입" value={shortMoney(profit || revenue)} tone="accent" />
      </section>
      <main className="content">
        {tab === 'today' && (
          <Dashboard
            monthJobs={monthJobs}
            asCount={asJobs.length}
            onNew={() => {
              setEditing(null);
              setTab('new');
            }}
            onJobs={() => setTab('jobs')}
            onStats={() => setTab('stats')}
            onAs={() => setTab('as')}
            onDocs={() => setTab('docs')}
            onClients={() => setTab('clients')}
            onSettings={() => setTab('settings')}
          />
        )}
        {tab === 'jobs' && (
          <JobList
            title="전체 현장"
            jobs={jobs}
            onEdit={(job) => {
              setEditing(job);
              setTab('new');
            }}
            onDelete={removeJob}
          />
        )}
        {tab === 'new' && (
          <JobForm
            key={editing?.id || 'new'}
            userId={user.uid}
            job={editing || emptyJob(user.uid)}
            clients={clients}
            onSaved={() => {
              setEditing(null);
              setTab('jobs');
            }}
          />
        )}
        {tab === 'stats' && <StatsPage jobs={jobs} />}
        {tab === 'as' && (
          <AsPage
            jobs={jobs}
            onEdit={(job) => {
              setEditing(job);
              setTab('new');
            }}
          />
        )}
        {tab === 'clients' && <Clients userId={user.uid} clients={clients} />}
        {tab === 'docs' && <Documents jobs={jobs} company={company} />}
        {tab === 'settings' && <SettingsPage userId={user.uid} company={company} onSaved={setCompany} />}
      </main>
      <nav>
        {nav.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => {
              if (item.id === 'new') setEditing(null);
              setTab(item.id);
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'green' | 'orange' | 'accent' }) {
  return (
    <div className="stat">
      <strong className={tone || ''}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Dashboard({
  monthJobs,
  asCount,
  onNew,
  onJobs,
  onStats,
  onAs,
  onDocs,
  onClients,
  onSettings,
}: {
  monthJobs: Job[];
  asCount: number;
  onNew: () => void;
  onJobs: () => void;
  onStats: () => void;
  onAs: () => void;
  onDocs: () => void;
  onClients: () => void;
  onSettings: () => void;
}) {
  return (
    <section className="dashboard">
      <div className="menu-grid">
        <button className="menu-card" onClick={onNew}>
          <span className="menu-icon blue">
            <Plus />
          </span>
          <span className="menu-title">새 작업</span>
          <span className="menu-sub">현장 기록 등록</span>
        </button>
        <button className="menu-card" onClick={onDocs}>
          <span className="menu-icon green">
            <FileText />
          </span>
          <span className="menu-title">견적서</span>
          <span className="menu-sub">A4 · PDF 출력</span>
        </button>
        <button className="menu-card" onClick={onDocs}>
          <span className="menu-icon orange">
            <ClipboardList />
          </span>
          <span className="menu-title">소견서</span>
          <span className="menu-sub">기술 소견 작성</span>
        </button>
        <button className="menu-card" onClick={onDocs}>
          <span className="menu-icon purple">
            <ShieldCheck />
          </span>
          <span className="menu-title">보험서류</span>
          <span className="menu-sub">보험사 제출용</span>
        </button>
        <button className="menu-card wide" onClick={onStats}>
          <span className="menu-icon blue">
            <BarChart3 />
          </span>
          <span className="menu-copy">
            <span className="menu-title">실적관리</span>
            <span className="menu-sub">월별 매출 · 건수 · 통계</span>
          </span>
        </button>
        <button className="menu-card wide" onClick={onJobs}>
          <span className="menu-icon green">
            <Wrench />
          </span>
          <span className="menu-copy">
            <span className="menu-title">현장관리</span>
            <span className="menu-sub">전체 작업 현황 확인 · 이번 달 {monthJobs.length}건</span>
          </span>
        </button>
      </div>
      <div className="bottom-btns">
        <button onClick={onAs}>AS 관리 {asCount > 0 ? asCount : ''}</button>
        <button onClick={onClients}>고객 연락처</button>
        <button onClick={onSettings}>사업자 정보</button>
      </div>
    </section>
  );
}

function JobList({
  title,
  jobs,
  onEdit,
  onDelete,
}: {
  title: string;
  jobs: Job[];
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {jobs.length === 0 && <Empty text="등록된 작업이 없습니다." />}
      {jobs.map((job) => (
        <article className="card" key={job.id}>
          <div className="row">
            <h3>{job.clientName || '이름 없음'}</h3>
            <span className={`badge ${job.status}`}>{statusLabel(job.status)}</span>
          </div>
          <p>
            {job.workDate} · {job.address} {job.addressDetail}
          </p>
          <p>
            {job.leakType} · {money(jobTotal(job))}
          </p>
          <p className="muted">
            사진 {job.photos?.length || 0}장 · 순매출 {money(netProfit(job))}
          </p>
          <div className="actions">
            <button onClick={() => onEdit(job)}>수정</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm('이 작업과 Storage 사진을 삭제할까요?')) onDelete(job);
              }}
            >
              <Trash2 size={15} /> 삭제
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function JobForm({
  userId,
  job,
  clients,
  onSaved,
}: {
  userId: string;
  job: Job;
  clients: Client[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Job>(job);
  const [saving, setSaving] = useState(false);
  const patch = (next: Partial<Job>) => setForm((current) => ({ ...current, ...next }));
  const updateCost = (idx: number, next: Partial<CostItem>) =>
    patch({ costItems: form.costItems.map((item, itemIdx) => (itemIdx === idx ? { ...item, ...next } : item)) });

  async function submit() {
    if (!form.clientName || !form.address || !form.workDate) {
      alert('고객명, 주소, 작업일은 필수입니다.');
      return;
    }
    setSaving(true);
    try {
      const savedId = await saveJob(userId, form);
      if (!form.id) {
        setForm((current) => ({ ...current, id: savedId }));
        alert('작업이 저장되었습니다. 이제 사진을 업로드할 수 있습니다.');
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2>{form.id ? '작업 수정' : '새 작업 등록'}</h2>
      <div className="card form">
        <label>
          의뢰처
          <input list="clients" value={form.clientCompany || ''} onChange={(e) => patch({ clientCompany: e.target.value })} />
          <datalist id="clients">{clients.map((client) => <option key={client.id} value={client.name} />)}</datalist>
        </label>
        <label>
          고객명 *
          <input value={form.clientName} onChange={(e) => patch({ clientName: e.target.value })} />
        </label>
        <label>
          전화번호
          <input value={form.clientPhone || ''} onChange={(e) => patch({ clientPhone: e.target.value })} />
        </label>
        <label>
          주소 *
          <input value={form.address} onChange={(e) => patch({ address: e.target.value })} />
        </label>
        <label>
          상세주소
          <input value={form.addressDetail || ''} onChange={(e) => patch({ addressDetail: e.target.value })} />
        </label>
        <div className="grid2">
          <label>
            작업일 *
            <input type="date" value={form.workDate} onChange={(e) => patch({ workDate: e.target.value })} />
          </label>
          <label>
            상태
            <select value={form.status} onChange={(e) => patch({ status: e.target.value as Job['status'] })}>
              <option value="pending">진행중</option>
              <option value="done">완료</option>
              <option value="as">AS</option>
            </select>
          </label>
        </div>
        <label>
          누수 유형
          <select value={form.leakType} onChange={(e) => patch({ leakType: e.target.value })}>
            {leakTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          조치 전 상황
          <textarea value={form.beforeNote || ''} onChange={(e) => patch({ beforeNote: e.target.value })} />
        </label>
        <label>
          조치 내용
          <textarea value={form.actionNote || ''} onChange={(e) => patch({ actionNote: e.target.value })} />
        </label>
        <label>
          조치 후 상태
          <textarea value={form.afterNote || ''} onChange={(e) => patch({ afterNote: e.target.value })} />
        </label>
        <label>
          전문가 소견
          <textarea value={form.expertOpinion || ''} onChange={(e) => patch({ expertOpinion: e.target.value })} />
        </label>
        <h3>비용 내역</h3>
        {form.costItems.map((item, idx) => (
          <div className="cost" key={item.id}>
            <input placeholder="항목명" value={item.name} onChange={(e) => updateCost(idx, { name: e.target.value })} />
            <input type="number" value={item.amount || ''} onChange={(e) => updateCost(idx, { amount: Number(e.target.value) })} />
            <button type="button" onClick={() => patch({ costItems: form.costItems.filter((next) => next.id !== item.id) })}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => patch({ costItems: [...form.costItems, { id: uid(), name: '', amount: 0 }] })}>
          + 비용 항목
        </button>
        <h3>사진</h3>
        {form.id ? (
          <PhotoManager userId={userId} job={form} onChanged={setForm} />
        ) : (
          <p className="muted">작업을 한 번 저장한 뒤 사진을 업로드할 수 있습니다. 사진 파일은 Firebase Storage에 저장되고 Firestore에는 URL만 저장됩니다.</p>
        )}
        <div className="total">
          합계 <b>{money(jobTotal(form))}</b>
        </div>
        <button onClick={submit} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </section>
  );
}

function PhotoManager({ userId, job, onChanged }: { userId: string; job: Job; onChanged: (job: Job) => void }) {
  async function upload(files: FileList | null, group: PhotoGroup) {
    if (!files) return;
    let updated = job;
    for (const file of Array.from(files)) {
      const photo = await uploadJobPhoto(userId, updated, file, group);
      updated = { ...updated, photos: [...(updated.photos || []), photo] };
    }
    onChanged(updated);
  }

  async function del(photo: JobPhoto) {
    await deleteJobPhoto(job, photo);
    onChanged({ ...job, photos: job.photos.filter((item) => item.id !== photo.id) });
  }

  return (
    <div>
      {(['before', 'after'] as PhotoGroup[]).map((group) => (
        <div key={group}>
          <p className="muted">{group === 'before' ? '조치 전 사진' : '조치 후 사진'}</p>
          <div className="photos">
            {job.photos
              .filter((photo) => photo.group === group)
              .map((photo) => (
                <div className="photo" key={photo.id}>
                  <img src={photo.url} alt="" />
                  <button onClick={() => del(photo)}>×</button>
                </div>
              ))}
            <label className="addPhoto">
              <Camera />
              <input hidden type="file" accept="image/*" multiple onChange={(event) => upload(event.target.files, group)} />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

function Clients({ userId, clients }: { userId: string; clients: Client[] }) {
  const [item, setItem] = useState<Partial<Client>>({ name: '', phone: '', contact: '', commissionRate: 0 });

  async function addClient() {
    if (!item.name) return;
    await saveClient(userId, item);
    setItem({ name: '', phone: '', contact: '', commissionRate: 0 });
  }

  return (
    <section>
      <h2>고객/의뢰처 관리</h2>
      <div className="card form">
        <label>
          이름 또는 업체명
          <input value={item.name || ''} onChange={(e) => setItem({ ...item, name: e.target.value })} />
        </label>
        <div className="grid2">
          <label>
            담당자
            <input value={item.contact || ''} onChange={(e) => setItem({ ...item, contact: e.target.value })} />
          </label>
          <label>
            전화번호
            <input value={item.phone || ''} onChange={(e) => setItem({ ...item, phone: e.target.value })} />
          </label>
        </div>
        <label>
          수수료율(%)
          <input
            type="number"
            value={item.commissionRate || ''}
            onChange={(e) => setItem({ ...item, commissionRate: Number(e.target.value) })}
          />
        </label>
        <button onClick={addClient}>추가</button>
      </div>
      {clients.map((client) => (
        <article className="card" key={client.id}>
          <h3>{client.name}</h3>
          <p>
            {client.contact || '-'} · {client.phone || '-'}
          </p>
          <p className="muted">수수료율 {client.commissionRate || 0}%</p>
        </article>
      ))}
    </section>
  );
}

function StatsPage({ jobs }: { jobs: Job[] }) {
  const rows = useMemo(() => {
    const groups = new Map<string, { month: string; total: number; net: number; done: number; count: number; as: number }>();
    for (const job of jobs) {
      const month = (job.workDate || '날짜 없음').slice(0, 7);
      const row = groups.get(month) || { month, total: 0, net: 0, done: 0, count: 0, as: 0 };
      row.count += 1;
      if (job.status === 'done') row.done += 1;
      if (job.status === 'as') row.as += 1;
      row.total += jobTotal(job);
      row.net += netProfit(job);
      groups.set(month, row);
    }
    return Array.from(groups.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [jobs]);

  return (
    <section>
      <h2>실적 관리</h2>
      {rows.length === 0 && <Empty text="집계할 작업이 없습니다." />}
      {rows.map((row) => (
        <article className="card stats-row" key={row.month}>
          <div className="row">
            <h3>{row.month}</h3>
            <span className="badge done">완료 {row.done}건</span>
          </div>
          <div className="stats-grid">
            <div>
              <b>{row.count}</b>
              <span>전체 건수</span>
            </div>
            <div>
              <b>{money(row.total)}</b>
              <span>매출</span>
            </div>
            <div>
              <b>{money(row.net)}</b>
              <span>순수익</span>
            </div>
            <div>
              <b>{row.as}</b>
              <span>AS</span>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function AsPage({ jobs, onEdit }: { jobs: Job[]; onEdit: (job: Job) => void }) {
  const asJobs = jobs.filter((job) => job.status === 'as');
  return (
    <section>
      <h2>AS 관리</h2>
      {asJobs.length === 0 && <Empty text="AS로 표시된 작업이 없습니다." />}
      {asJobs.map((job) => (
        <article className="card as-card" key={job.id}>
          <div className="row">
            <h3>{job.clientName}</h3>
            <span className="badge as">AS 접수</span>
          </div>
          <p>{job.workDate} · {job.address} {job.addressDetail}</p>
          <p>전화번호 {job.clientPhone || '-'}</p>
          <p className="muted">{job.afterNote || job.memo || '처리 내용이 아직 없습니다.'}</p>
          <button onClick={() => onEdit(job)}>AS 내용 수정</button>
        </article>
      ))}
    </section>
  );
}

function Documents({ jobs, company }: { jobs: Job[]; company: Company | null }) {
  const [id, setId] = useState(jobs[0]?.id || '');
  const [type, setType] = useState<DocumentType>('estimate');
  const job = useMemo(() => jobs.find((item) => item.id === id) || jobs[0], [id, jobs]);

  async function pdf() {
    const el = document.getElementById('doc-preview');
    if (!el || !job) return;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff', useCORS: true });
    const p = new jsPDF('p', 'mm', 'a4');
    p.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
    p.save(`${job.workDate}_${job.clientName}_${docTitle(type)}.pdf`);
  }

  async function image() {
    const el = document.getElementById('doc-preview');
    if (!el || !job) return;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff', useCORS: true });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const fileName = `${job.workDate}_${job.clientName}_${docTitle(type)}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h2>문서 생성</h2>
      <div className="grid2">
        <select value={job?.id || ''} onChange={(e) => setId(e.target.value)}>
          {jobs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.workDate} · {item.clientName}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
          <option value="estimate">견적서</option>
          <option value="opinion">소견서</option>
          <option value="insurance">보험서류</option>
        </select>
      </div>
      {job ? (
        <>
          <DocumentPreview job={job} company={company} type={type} />
          <div className="share-actions">
            <button onClick={pdf}>
              <Download size={16} /> PDF 저장
            </button>
            <button className="secondary" onClick={image}>
              이미지 저장/공유
            </button>
          </div>
        </>
      ) : (
        <Empty text="문서로 만들 작업이 없습니다." />
      )}
    </section>
  );
}

function DocumentPreview({ job, company, type }: { job: Job; company: Company | null; type: DocumentType }) {
  return (
    <div id="doc-preview" className="doc">
      <h1>{docTitle(type)}</h1>
      <p className="right">발행일 {new Date().toLocaleDateString('ko-KR')}</p>
      <h3>{company?.name || '업체명'}</h3>
      <p>
        대표 {company?.ceo || '-'} · TEL {company?.tel || '-'} · 사업자번호 {company?.regNo || '-'}
      </p>
      <table>
        <tbody>
          <tr>
            <th>고객명</th>
            <td>{job.clientName}</td>
          </tr>
          <tr>
            <th>주소</th>
            <td>
              {job.address} {job.addressDetail}
            </td>
          </tr>
          <tr>
            <th>작업일</th>
            <td>{job.workDate}</td>
          </tr>
          <tr>
            <th>누수 유형</th>
            <td>{job.leakType}</td>
          </tr>
        </tbody>
      </table>
      <h3>현장 내용</h3>
      <p>{job.beforeNote || '조치 전 상황 기록 없음'}</p>
      <h3>조치 내용</h3>
      <p>{job.actionNote || '조치 내용 기록 없음'}</p>
      {type !== 'estimate' && (
        <>
          <h3>전문가 소견</h3>
          <p>{job.expertOpinion || job.afterNote || '소견 기록 없음'}</p>
        </>
      )}
      <table>
        <thead>
          <tr>
            <th>항목</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          {job.costItems.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{money(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>합계 {money(jobTotal(job))}</h2>
      <p>
        입금계좌: {company?.bank || ''} {company?.account || ''} {company?.holder || ''}
      </p>
      <div className="doc-signs">
        <div>
          <span>서명</span>
          {company?.signatureUrl ? <img src={company.signatureUrl} alt="" /> : <i />}
        </div>
        <div>
          <span>도장</span>
          {company?.stampUrl ? <img src={company.stampUrl} alt="" /> : <i />}
        </div>
      </div>
      {type === 'insurance' && (
        <p className="doc-note">사업자등록증 사본: {company?.bizRegUrl ? '첨부됨' : '사업자 정보에서 업로드 필요'}</p>
      )}
    </div>
  );
}

function SettingsPage({
  userId,
  company,
  onSaved,
}: {
  userId: string;
  company: Company | null;
  onSaved: (company: Company) => void;
}) {
  const [item, setItem] = useState<Company>(company || { id: '', ownerId: userId, updatedAt: Date.now() });
  const [uploading, setUploading] = useState('');
  const [signOpen, setSignOpen] = useState(false);
  const patch = (next: Partial<Company>) => setItem((current) => ({ ...current, ...next }));

  async function save() {
    await saveCompany(userId, item);
    const fresh = await getCompany(userId);
    if (fresh) onSaved(fresh);
    alert('사업자 정보가 저장되었습니다.');
  }

  async function upload(file: File | undefined, asset: 'signature' | 'stamp' | 'bizReg') {
    if (!file) return;
    setUploading(asset);
    try {
      const uploaded = await uploadCompanyAsset(userId, file, asset);
      const next =
        asset === 'signature'
          ? { signatureUrl: uploaded.url, signaturePath: uploaded.storagePath }
          : asset === 'stamp'
            ? { stampUrl: uploaded.url, stampPath: uploaded.storagePath }
            : { bizRegUrl: uploaded.url, bizRegPath: uploaded.storagePath };
      const merged = { ...item, ...next };
      setItem(merged);
      await saveCompany(userId, merged);
      const fresh = await getCompany(userId);
      if (fresh) onSaved(fresh);
    } finally {
      setUploading('');
    }
  }

  async function saveSignature(file: File) {
    await upload(file, 'signature');
    setSignOpen(false);
  }

  async function removeAsset(asset: 'signature' | 'stamp' | 'bizReg') {
    const next =
      asset === 'signature'
        ? { signatureUrl: '', signaturePath: '' }
        : asset === 'stamp'
          ? { stampUrl: '', stampPath: '' }
          : { bizRegUrl: '', bizRegPath: '' };
    const merged = { ...item, ...next };
    setItem(merged);
    await saveCompany(userId, merged);
    const fresh = await getCompany(userId);
    if (fresh) onSaved(fresh);
  }

  function exportCompany() {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      company: item,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `누수설비_사업자정보_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h2>사업자 정보</h2>
      <div className="settings-stack">
      <div className="card form form-section">
        <h3>기본 정보</h3>
        <label>
          업체명
          <input value={item.name || ''} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label>
          대표자
          <input value={item.ceo || ''} onChange={(e) => patch({ ceo: e.target.value })} />
        </label>
        <label>
          사업자번호
          <input value={item.regNo || ''} onChange={(e) => patch({ regNo: e.target.value })} />
        </label>
        <label>
          전화번호
          <input value={item.tel || ''} onChange={(e) => patch({ tel: e.target.value })} />
        </label>
        <label>
          주소
          <input value={item.address || ''} onChange={(e) => patch({ address: e.target.value })} />
        </label>
        <div className="grid2">
          <label>
            은행
            <input value={item.bank || ''} onChange={(e) => patch({ bank: e.target.value })} />
          </label>
          <label>
            예금주
            <input value={item.holder || ''} onChange={(e) => patch({ holder: e.target.value })} />
          </label>
        </div>
        <label>
          계좌번호
          <input value={item.account || ''} onChange={(e) => patch({ account: e.target.value })} />
        </label>
        <button onClick={save}>
          <BriefcaseBusiness size={16} /> 기본 정보 저장
        </button>
      </div>
      <div className="card form form-section">
        <h3>서명 / 도장</h3>
        <div className="asset-grid">
          <AssetUpload
            title="서명"
            url={item.signatureUrl}
            busy={uploading === 'signature'}
            onFile={(file) => upload(file, 'signature')}
            onRemove={() => removeAsset('signature')}
            extraAction={<button type="button" className="asset-action" onClick={(event) => { event.preventDefault(); setSignOpen(true); }}>직접 작성</button>}
          />
          <AssetUpload
            title="도장"
            url={item.stampUrl}
            busy={uploading === 'stamp'}
            onFile={(file) => upload(file, 'stamp')}
            onRemove={() => removeAsset('stamp')}
          />
        </div>
      </div>
      <div className="card form form-section">
        <h3>사업자등록증 사본</h3>
        <p className="muted">보험청구 서류에 자동 첨부할 수 있도록 보관합니다.</p>
        <AssetUpload title="사업자등록증" url={item.bizRegUrl} busy={uploading === 'bizReg'} onFile={(file) => upload(file, 'bizReg')} onRemove={() => removeAsset('bizReg')} wide />
      </div>
      <div className="card form form-section">
        <h3>데이터 백업</h3>
        <p className="muted">현재 사업자 정보와 첨부 URL을 JSON 파일로 내려받습니다.</p>
        <button className="secondary" onClick={exportCompany}>사업자 정보 백업 저장</button>
      </div>
      </div>
      {signOpen && <SignaturePad onClose={() => setSignOpen(false)} onSave={saveSignature} />}
    </section>
  );
}

function AssetUpload({
  title,
  url,
  busy,
  wide,
  extraAction,
  onRemove,
  onFile,
}: {
  title: string;
  url?: string;
  busy: boolean;
  wide?: boolean;
  extraAction?: React.ReactNode;
  onRemove?: () => void;
  onFile: (file?: File) => void;
}) {
  return (
    <label className={`asset-upload ${wide ? 'wide' : ''}`}>
      <span>{title}</span>
      {url ? (
        <span className="asset-preview">
          <img src={url} alt="" />
          {onRemove && (
            <button
              type="button"
              className="remove-btn"
              onClick={(event) => {
                event.preventDefault();
                onRemove();
              }}
            >
              ×
            </button>
          )}
        </span>
      ) : (
        <b>업로드</b>
      )}
      <em>{busy ? '저장 중...' : url ? '터치해서 교체' : '터치해서 업로드'}</em>
      {extraAction}
      <input hidden type="file" accept="image/*,application/pdf" onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

function SignaturePad({ onClose, onSave }: { onClose: () => void; onSave: (file: File) => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(180 * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, 180);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, 180);
  }

  async function save() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasInk = false;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) {
        hasInk = true;
        break;
      }
    }
    if (!hasInk) {
      alert('서명을 먼저 작성해주세요.');
      return;
    }
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      await onSave(new File([blob], 'signature.png', { type: 'image/png' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-sheet">
        <div className="modal-header">
          <strong>서명 작성</strong>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p className="muted">아래 흰색 영역에 손가락이나 마우스로 서명해주세요.</p>
          <canvas
            ref={canvasRef}
            className="signature-canvas"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          <div className="actions">
            <button className="secondary" onClick={clear}>지우기</button>
            <button onClick={save} disabled={saving}>{saving ? '저장 중...' : '서명 저장'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: Job['status']) {
  if (status === 'done') return '완료';
  if (status === 'as') return 'AS';
  return '진행중';
}

function docTitle(type: DocumentType) {
  if (type === 'opinion') return '소견서';
  if (type === 'insurance') return '보험 제출 서류';
  return '견적서';
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
