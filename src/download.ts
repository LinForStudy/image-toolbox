import JSZip from 'jszip';
import { extensionFor, safeBaseName } from './format';
import type { ImageItem, ProcessOptions } from './types';

export function outputFileName(item: ImageItem, options: ProcessOptions): string {
  const ext = extensionFor(item.outputFormat || options.outputFormat);
  const width = item.outputWidth || item.originalWidth;
  const suffix = options.fileSuffix.trim() || `${ext}-${width}w`;
  return `${safeBaseName(item.file.name)}-${suffix}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadZip(items: ImageItem[], options: ProcessOptions): Promise<void> {
  const zip = new JSZip();
  const readyItems = items.filter((item) => item.outputBlob);
  const usedNames = new Map<string, number>();

  readyItems.forEach((item) => {
    if (!item.outputBlob) return;
    zip.file(uniqueZipName(outputFileName(item, options), usedNames), item.outputBlob);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `image-toolbox-${new Date().toISOString().slice(0, 10)}.zip`);
}

function uniqueZipName(fileName: string, usedNames: Map<string, number>): string {
  const nextCount = (usedNames.get(fileName) || 0) + 1;
  usedNames.set(fileName, nextCount);
  if (nextCount === 1) return fileName;

  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return `${fileName}-${nextCount}`;

  return `${fileName.slice(0, dotIndex)}-${nextCount}${fileName.slice(dotIndex)}`;
}
