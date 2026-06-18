export type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp';
export type ResizeMode = 'original' | 'longest' | 'width' | 'height';
export type ItemStatus = 'ready' | 'processing' | 'done' | 'stale' | 'error';
export type ActiveMode = 'compress' | 'resize' | 'convert';

export interface ProcessOptions {
  outputFormat: OutputFormat;
  quality: number;
  resizeMode: ResizeMode;
  targetWidth: number;
  targetHeight: number;
  longestSide: number;
  allowUpscale: boolean;
  fileSuffix: string;
}

export interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
  outputBlob: Blob | null;
  outputWidth: number;
  outputHeight: number;
  outputFormat: OutputFormat;
  status: ItemStatus;
  error: string;
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  format: OutputFormat;
}

export interface SizePreset {
  id: string;
  name: string;
  description: string;
  mode: ResizeMode;
  width: number;
  height: number;
  longestSide: number;
}