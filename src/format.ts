import type { OutputFormat } from './types';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatDimensions(width: number, height: number): string {
  if (!width || !height) return '-';
  return `${width} x ${height}`;
}

export function formatRatio(originalSize: number, outputSize: number): string {
  if (!originalSize || !outputSize) return '-';
  const ratio = Math.round((1 - outputSize / originalSize) * 100);
  return ratio >= 0 ? `小 ${ratio}%` : `大 ${Math.abs(ratio)}%`;
}

export function extensionFor(format: OutputFormat): string {
  return format === 'image/jpeg' ? 'jpg' : format.split('/')[1];
}

export function labelFor(format: OutputFormat): string {
  if (format === 'image/jpeg') return 'JPEG';
  if (format === 'image/webp') return 'WebP';
  return 'PNG';
}

export function safeBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
}
