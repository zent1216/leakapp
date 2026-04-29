import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectId = 'leakapp-c603d';
const bucket = 'leakapp-c603d.firebasestorage.app';
const legacyUid = 'umHMs58MSaaCc4fZycVrkwGi8812';
const root = `projects/${projectId}/databases/(default)/documents`;

function readToken() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  if (!cfg.tokens?.access_token) throw new Error('Firebase CLI login token not found. Run firebase login first.');
  return cfg.tokens.access_token;
}

const token = readToken();
const authHeaders = { Authorization: `Bearer ${token}` };

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function fieldValue(value) {
  if (value === undefined || value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fieldValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, fieldValue(v)])),
      },
    };
  }
  return { stringValue: String(value) };
}

function fieldsOf(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, fieldValue(v)]));
}

function legacyArray(raw) {
  if (!raw) return [];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(parsed) ? parsed : [];
}

function legacyObject(raw) {
  if (!raw) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function stripDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function uploadDataUrl(dataUrl, storagePath) {
  const parsed = stripDataUrl(dataUrl);
  if (!parsed) return null;
  const downloadToken = crypto.randomUUID();
  const boundary = `migration-${crypto.randomUUID()}`;
  const metadata = {
    name: storagePath,
    contentType: parsed.mime,
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  };
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${parsed.mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, parsed.buffer, tail]);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart&name=${encodeURIComponent(storagePath)}`;
  await jsonFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`,
    storagePath,
  };
}

function mapStatus(status) {
  if (status === 'done') return 'done';
  if (status === 'as') return 'as';
  return 'pending';
}

function mapCostItems(old) {
  const items = Array.isArray(old.costItems) ? old.costItems : [];
  if (items.length) {
    return items.map((item, idx) => ({
      id: item.id ? String(item.id) : `legacy-cost-${idx + 1}`,
      name: item.name || item.label || '비용',
      amount: Number(item.amount || item.price || 0),
    }));
  }
  const total = Number(old.costTotal || old.baseCost || 0);
  return total ? [{ id: 'legacy-cost-total', name: '누수 공사비', amount: total }] : [];
}

function mapCommissions(old) {
  const items = Array.isArray(old.commissions) ? old.commissions : [];
  if (items.length) {
    return items.map((item, idx) => ({
      id: item.id ? String(item.id) : `legacy-commission-${idx + 1}`,
      name: item.name || '수수료',
      amount: Number(item.amount || 0),
    }));
  }
  const commission = Number(old.commission || 0);
  return commission ? [{ id: 'legacy-commission-total', name: '수수료', amount: commission }] : [];
}

function mapJob(old) {
  const materials = Array.isArray(old.materials)
    ? old.materials.map((m) => `${m.name || ''}${m.qty ? ` ${m.qty}` : ''}`.trim()).filter(Boolean)
    : [];
  return {
    id: `legacy-${old.id}`,
    ownerId: legacyUid,
    legacyId: String(old.id ?? ''),
    clientName: old.name || '',
    clientPhone: old.phone || '',
    clientCompany: old.clientCompany || '',
    address: old.addrBase || old.addr || '',
    addressDetail: old.addrDetail || '',
    locationMemo: old.location || '',
    workDate: old.date || new Date().toISOString().slice(0, 10),
    status: mapStatus(old.status),
    leakType: old.type || '기타',
    beforeNote: old.before || '',
    actionNote: old.action || '',
    afterNote: old.afterDesc || old.after || '',
    expertOpinion: old.expertOpinion || '',
    costItems: mapCostItems(old),
    commissions: mapCommissions(old),
    photos: [],
    memo: [old.memo, materials.length ? `자재: ${materials.join(', ')}` : ''].filter(Boolean).join('\n'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function mapClient(old) {
  return {
    id: `legacy-${old.id}`,
    ownerId: legacyUid,
    name: old.name || '',
    contact: old.contact || '',
    phone: old.phone || '',
    address: old.addr || old.address || '',
    commissionRate: Number(old.commissionRate || 0),
    memo: old.memo || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function commitDocuments(docs) {
  const writes = docs.map(({ collection, id, data }) => ({
    update: {
      name: `${root}/${collection}/${id}`,
      fields: fieldsOf(data),
    },
  }));
  if (!writes.length) return;
  await jsonFetch(`https://firestore.googleapis.com/v1/${root}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
}

async function main() {
  const legacy = await jsonFetch(`https://firestore.googleapis.com/v1/${root}/users/${legacyUid}`);
  const raw = {
    jobs: legacy.fields?.jobs?.stringValue || '',
    clients: legacy.fields?.clients?.stringValue || '',
    biz: legacy.fields?.biz?.stringValue || '',
  };
  const backupName = `migration-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(backupName, JSON.stringify(raw, null, 2));

  const oldJobs = legacyArray(raw.jobs);
  const oldClients = legacyArray(raw.clients);
  const oldBiz = legacyObject(raw.biz);

  const company = {
    id: 'legacy-company',
    ownerId: legacyUid,
    name: oldBiz.name || '',
    ceo: oldBiz.ceo || oldBiz.tech || '',
    regNo: oldBiz.reg || '',
    tel: oldBiz.tel || '',
    address: oldBiz.addr || '',
    bank: oldBiz.bank || '',
    account: oldBiz.account || '',
    holder: oldBiz.holder || '',
    updatedAt: Date.now(),
  };

  const sig = await uploadDataUrl(oldBiz.signatureImg, `users/${legacyUid}/company/signature.jpg`);
  if (sig) Object.assign(company, { signatureUrl: sig.url, signaturePath: sig.storagePath });
  const stamp = await uploadDataUrl(oldBiz.stampImg, `users/${legacyUid}/company/stamp.jpg`);
  if (stamp) Object.assign(company, { stampUrl: stamp.url, stampPath: stamp.storagePath });
  const bizReg = await uploadDataUrl(oldBiz.regImg, `users/${legacyUid}/company/bizReg.jpg`);
  if (bizReg) Object.assign(company, { bizRegUrl: bizReg.url, bizRegPath: bizReg.storagePath });

  const jobs = oldJobs.map(mapJob);
  const clients = oldClients.map(mapClient);
  await commitDocuments([
    ...jobs.map((data) => ({ collection: 'jobs', id: data.id, data })),
    ...clients.map((data) => ({ collection: 'clients', id: data.id, data })),
    { collection: 'companies', id: company.id, data: company },
  ]);

  console.log(JSON.stringify({ backupName, migratedJobs: jobs.length, migratedClients: clients.length, migratedCompany: true }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
