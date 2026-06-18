import type { ImageItem, OutputFormat, ProcessOptions, ProcessedImage } from './types';

export function isSupportedImage(file: File): boolean {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type);
}

export async function createImageItem(file: File): Promise<ImageItem> {
  if (!isSupportedImage(file)) {
    throw new Error('暂不支持这个图片格式');
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(previewUrl);
    return {
      id: crypto.randomUUID(),
      file,
      previewUrl,
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
      originalSize: file.size,
      outputBlob: null,
      outputWidth: 0,
      outputHeight: 0,
      outputFormat: 'image/png',
      status: 'ready',
      error: ''
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

export async function processImage(item: ImageItem, options: ProcessOptions): Promise<ProcessedImage> {
  const sourceUrl = URL.createObjectURL(item.file);

  try {
    const image = await loadImage(sourceUrl);
    const size = getTargetSize(image.naturalWidth, image.naturalHeight, options);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d', { alpha: options.outputFormat === 'image/png' });
    if (!context) throw new Error('当前浏览器不支持 Canvas 图片处理');

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    if (options.outputFormat === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(image, 0, 0, size.width, size.height);
    const blob = await canvasToBlob(canvas, options.outputFormat, options.quality);

    return {
      blob,
      width: size.width,
      height: size.height,
      format: options.outputFormat
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败，请换一张图片试试'));
    image.src = src;
  });
}

function getTargetSize(width: number, height: number, options: ProcessOptions): { width: number; height: number } {
  const ratio = width / height;
  let targetWidth = width;
  let targetHeight = height;

  if (options.resizeMode === 'longest' && options.longestSide > 0) {
    if (width >= height) {
      targetWidth = options.longestSide;
      targetHeight = Math.round(options.longestSide / ratio);
    } else {
      targetHeight = options.longestSide;
      targetWidth = Math.round(options.longestSide * ratio);
    }
  }

  if (options.resizeMode === 'width' && options.targetWidth > 0) {
    targetWidth = options.targetWidth;
    targetHeight = Math.round(options.targetWidth / ratio);
  }

  if (options.resizeMode === 'height' && options.targetHeight > 0) {
    targetHeight = options.targetHeight;
    targetWidth = Math.round(options.targetHeight * ratio);
  }

  if (!options.allowUpscale) {
    targetWidth = Math.min(targetWidth, width);
    targetHeight = Math.min(targetHeight, height);
  }

  return {
    width: Math.max(1, Math.round(targetWidth)),
    height: Math.max(1, Math.round(targetHeight))
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, format: OutputFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('图片导出失败，请尝试换一种格式'));
          return;
        }
        resolve(blob);
      },
      format,
      format === 'image/png' ? undefined : quality
    );
  });
}
