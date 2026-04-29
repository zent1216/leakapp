import type { CommissionItem, CostItem, Job } from '../types/app';

export const now = () => Date.now();
export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

export const money = (n = 0) => `${Math.round(Number(n) || 0).toLocaleString('ko-KR')}원`;

export const shortMoney = (n = 0) => {
  const value = Math.round(Number(n) || 0);
  if (value >= 100000000) return `${Math.round(value / 100000000)}억`;
  if (value >= 10000) return `${Math.round(value / 10000)}만`;
  return value.toLocaleString('ko-KR');
};

export const sumCosts = (items: CostItem[] = []) =>
  items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

export const sumCommissions = (items: CommissionItem[] = []) =>
  items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

export const jobTotal = (job: Pick<Job, 'costItems'>) => sumCosts(job.costItems);
export const netProfit = (job: Pick<Job, 'costItems' | 'commissions'>) =>
  sumCosts(job.costItems) - sumCommissions(job.commissions);

export async function compressImage(file: File, maxWidth = 1600, quality = 0.78): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지 처리에 실패했습니다.');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 압축에 실패했습니다.'))),
      'image/jpeg',
      quality,
    );
  });
}
