// Exports: a single-turnover PDF (expo-print, from shared `turnoverPdfModel`) and the history CSV
// (shared `toCsvRows` + `toCsv`), both handed to the share sheet (expo-sharing).
import { type PhotoRef, type TurnoverPdfModel, toCsv, toCsvRows, turnoverPdfModel } from '@turnproof/shared';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { allIssueRows, listIssues } from '@/data/issues-repo';
import { stripLocal } from '@/data/mappers';
import { listPhotos } from '@/data/photos-repo';
import { allPropertyRows, getProperty } from '@/data/properties-repo';
import { getSettings } from '@/data/settings-repo';
import { deviceTimeZone, todayKey } from '@/data/time';
import { getTurnover, listAllTurnovers } from '@/data/turnovers-repo';

import { fileExists } from './photo-files';

export type ExportResult =
  | { ok: true; uri: string; rows?: number }
  | { ok: false; reason: 'unavailable' | 'not-found' | 'error'; message?: string };

const errorResult = (error: unknown): ExportResult => ({
  ok: false,
  reason: 'error',
  message: error instanceof Error ? error.message : String(error),
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'turnover';

// ---------------------------------------------------------------------------
// CSV

/** CSV text of every turnover (optionally one property's), in local time. */
export function buildHistoryCsv(opts: { propertyId?: string } = {}): { csv: string; rows: number } {
  const turnovers = listAllTurnovers().filter((t) => !opts.propertyId || t.propertyId === opts.propertyId);
  const rows = toCsvRows(turnovers, allPropertyRows(), deviceTimeZone(), allIssueRows());
  return { csv: toCsv(rows), rows: rows.length - 1 };
}

/** Writes the CSV to the cache directory and opens the share sheet. */
export async function shareHistoryCsv(opts: { propertyId?: string } = {}): Promise<ExportResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'unavailable' };
    const { csv, rows } = buildHistoryCsv(opts);
    const file = new File(Paths.cache, `turnproof-history-${todayKey()}.csv`);
    if (file.exists) file.delete();
    file.create();
    file.write(csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Export history' });
    return { ok: true, uri: file.uri, rows };
  } catch (error) {
    return errorResult(error);
  }
}

// ---------------------------------------------------------------------------
// PDF

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A small JPEG data URI for the PDF (local file preferred; remote URL as is; null when neither). */
async function pdfImageSrc(ref: PhotoRef): Promise<string | null> {
  if (!ref.url) return null;
  if (!ref.url.startsWith('file:')) return ref.url;
  if (!fileExists(ref.url)) return null;
  const context = ImageManipulator.manipulate(ref.url).resize({ width: 520 });
  try {
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    image.release();
    new File(saved.uri).delete();
    return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null;
  } catch {
    return null;
  } finally {
    context.release();
  }
}

async function photoFigure(ref: PhotoRef): Promise<string> {
  const src = await pdfImageSrc(ref);
  const badge = ref.source === 'gallery' ? '<span class="ref">Reference</span>' : ref.verified ? '<span class="ok">Verified capture</span>' : '';
  return `<figure>${src ? `<img src="${esc(src)}"/>` : '<div class="missing">Photo not on this device</div>'}<figcaption>${badge}${esc(ref.stampLabel)}</figcaption></figure>`;
}

/** HTML document for `turnoverPdfModel` (colours from the shared tokens' light scheme). */
export async function turnoverPdfHtml(model: TurnoverPdfModel): Promise<string> {
  const rooms: string[] = [];
  for (const room of model.rooms) {
    const items = room.checklist.items
      .map((i) => `<li class="${i.checked ? 'done' : ''}">${i.checked ? '✓' : '○'} ${esc(i.label)}${i.required ? '' : ' <em>(optional)</em>'}</li>`)
      .join('');
    const before = (await Promise.all(room.before.map(photoFigure))).join('');
    const after = (await Promise.all(room.after.map(photoFigure))).join('');
    const refs = (await Promise.all(room.references.map(photoFigure))).join('');
    const issues = room.issues
      .map((i) => `<div class="issue"><b>${esc(i.severity.toUpperCase())}</b> ${esc(i.note)}</div>`)
      .join('');
    rooms.push(`<section>
      <h2>${esc(room.name)} <small>${room.complete ? 'Complete' : 'Incomplete'} · ${room.checklist.checkedAll}/${room.checklist.totalAll}</small></h2>
      <ul>${items}</ul>
      ${before ? `<h3>Before</h3><div class="grid">${before}</div>` : ''}
      ${after ? `<h3>After</h3><div class="grid">${after}</div>` : ''}
      ${refs ? `<h3>Reference (not proof)</h3><div class="grid">${refs}</div>` : ''}
      ${issues}
    </section>`);
  }
  const general = model.generalIssues.map((i) => `<div class="issue"><b>${esc(i.severity.toUpperCase())}</b> ${esc(i.note)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1A1F24; margin: 32px; }
    h1 { font-size: 22px; margin: 0; } .sub { color: #545C64; margin: 4px 0 16px; }
    .summary { background: #F1EDE5; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; }
    .summary li { margin: 2px 0; } h2 { font-size: 17px; border-top: 1px solid #E7E2D8; padding-top: 12px; }
    h2 small { font-weight: 400; color: #545C64; font-size: 12px; } h3 { font-size: 13px; color: #545C64; margin: 10px 0 6px; }
    ul { padding-left: 18px; font-size: 12px; } li.done { color: #1F6B4A; }
    .grid { display: flex; flex-wrap: wrap; gap: 8px; } figure { margin: 0; width: 31%; page-break-inside: avoid; }
    img { width: 100%; border-radius: 8px; } figcaption { font-size: 9px; color: #545C64; margin-top: 2px; }
    .ok { color: #0B5E66; font-weight: 600; margin-right: 4px; } .ref { color: #8A5A00; font-weight: 600; margin-right: 4px; }
    .missing { height: 80px; background: #F1EDE5; border-radius: 8px; font-size: 10px; display: flex; align-items: center; justify-content: center; }
    .issue { background: #FBE6DE; color: #B5452A; border-radius: 8px; padding: 8px 10px; margin: 6px 0; font-size: 12px; }
    section { page-break-inside: auto; } footer { margin-top: 24px; font-size: 10px; color: #7D858C; }
  </style></head><body>
    <h1>${esc(model.title)}</h1>
    <div class="sub">${esc(model.subtitle)}${model.property.address ? ` · ${esc(model.property.address)}` : ''}</div>
    <ul class="summary">${model.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    ${model.turnover.note ? `<p><b>Note:</b> ${esc(model.turnover.note)}</p>` : ''}
    ${rooms.join('')}
    ${general ? `<h2>Other issues</h2>${general}` : ''}
    <footer>Generated by Turnproof. "Verified capture" = taken in the app's camera during the turnover, with a matching content hash.</footer>
  </body></html>`;
}

/** Renders the turnover PDF to a file (no share sheet). */
export async function buildTurnoverPdf(turnoverId: string): Promise<ExportResult> {
  try {
    const t = getTurnover(turnoverId);
    const p = t ? getProperty(t.propertyId) : null;
    if (!t || !p) return { ok: false, reason: 'not-found' };
    // Prefer this device's files so the PDF works offline.
    const photos = listPhotos(turnoverId).map((ph) => {
      const plain = stripLocal(ph);
      return fileExists(plain.localUri) ? { ...plain, remoteUrl: null } : plain;
    });
    const model = turnoverPdfModel(p, t, photos, listIssues(turnoverId), deviceTimeZone(), { stampGps: getSettings().stampGps });
    const { uri } = await Print.printToFileAsync({ html: await turnoverPdfHtml(model) });
    const target = new File(Paths.cache, `turnproof-${slug(p.name)}-${t.scheduledFor.slice(0, 10)}.pdf`);
    if (target.exists) target.delete();
    new File(uri).moveSync(target);
    return { ok: true, uri: target.uri };
  } catch (error) {
    return errorResult(error);
  }
}

/** Builds the turnover PDF and opens the share sheet. */
export async function shareTurnoverPdf(turnoverId: string): Promise<ExportResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'unavailable' };
    const built = await buildTurnoverPdf(turnoverId);
    if (!built.ok) return built;
    await Sharing.shareAsync(built.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share turnover PDF' });
    return built;
  } catch (error) {
    return errorResult(error);
  }
}
