import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import { compressImage, now } from './utils';
import type { Client, Company, Job, JobPhoto, PhotoGroup } from '../types/app';

export type CompanyAsset = 'signature' | 'stamp' | 'bizReg';

export function watchJobs(ownerId: string, cb: (jobs: Job[]) => void) {
  const q = query(collection(db, 'jobs'), where('ownerId', '==', ownerId));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)).sort((a, b) => (b.workDate || '').localeCompare(a.workDate || ''))));
}
export async function saveJob(ownerId: string, job: Partial<Job> & { id?: string }) {
  const base = { ...job, ownerId, updatedAt: now() };
  if (job.id) {
    await setDoc(doc(db, 'jobs', job.id), base, { merge: true });
    return job.id;
  }
  const saved = await addDoc(collection(db, 'jobs'), { ...base, createdAt: now(), photos: job.photos ?? [] });
  return saved.id;
}
export async function removeJob(job: Job) {
  await Promise.all((job.photos || []).map(p => deleteObject(ref(storage, p.storagePath)).catch(() => undefined)));
  await deleteDoc(doc(db, 'jobs', job.id));
}
export async function uploadJobPhoto(ownerId: string, job: Job, file: File, group: PhotoGroup): Promise<JobPhoto> {
  const blob = await compressImage(file);
  const id = crypto.randomUUID();
  const storagePath = `users/${ownerId}/jobs/${job.id}/${group}/${id}.jpg`;
  await uploadBytes(ref(storage, storagePath), blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(ref(storage, storagePath));
  const photo = { id, url, storagePath, group, createdAt: now() };
  await updateDoc(doc(db, 'jobs', job.id), { photos: [...(job.photos || []), photo], updatedAt: now() });
  return photo;
}
export async function deleteJobPhoto(job: Job, photo: JobPhoto) {
  await deleteObject(ref(storage, photo.storagePath)).catch(() => undefined);
  await updateDoc(doc(db, 'jobs', job.id), { photos: (job.photos || []).filter(p => p.id !== photo.id), updatedAt: now() });
}
export function watchClients(ownerId: string, cb: (items: Client[]) => void) {
  const q = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)).sort((a, b) => (a.name || '').localeCompare(b.name || ''))));
}
export async function saveClient(ownerId: string, item: Partial<Client> & { id?: string }) {
  if (item.id) await setDoc(doc(db, 'clients', item.id), { ...item, ownerId, updatedAt: now() }, { merge: true });
  else await addDoc(collection(db, 'clients'), { ...item, ownerId, createdAt: now(), updatedAt: now() });
}
export async function getCompany(ownerId: string): Promise<Company | null> {
  const q = query(collection(db, 'companies'), where('ownerId', '==', ownerId), limit(1));
  const snap = await getDocs(q); if (snap.empty) return null;
  const d = snap.docs[0]; return { id: d.id, ...d.data() } as Company;
}
export async function saveCompany(ownerId: string, company: Partial<Company> & { id?: string }) {
  if (company.id) await setDoc(doc(db, 'companies', company.id), { ...company, ownerId, updatedAt: now() }, { merge: true });
  else await addDoc(collection(db, 'companies'), { ...company, ownerId, updatedAt: now() });
}

export async function uploadCompanyAsset(ownerId: string, file: File, asset: CompanyAsset) {
  const isPdf = file.type === 'application/pdf';
  const body = isPdf ? file : await compressImage(file, 1800, 0.82);
  const ext = isPdf ? 'pdf' : 'jpg';
  const storagePath = `users/${ownerId}/company/${asset}.${ext}`;
  await uploadBytes(ref(storage, storagePath), body, { contentType: isPdf ? 'application/pdf' : 'image/jpeg' });
  const url = await getDownloadURL(ref(storage, storagePath));
  return { url, storagePath };
}
