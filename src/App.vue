<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { downloadBlob, downloadZip, outputFileName } from './download';
import { formatBytes, formatDimensions, formatRatio, labelFor } from './format';
import { createImageItem, processImage } from './imageProcessor';
import type { ActiveMode, ImageItem, OutputFormat, ProcessOptions, ResizeMode, SizePreset } from './types';

const activeMode = ref<ActiveMode>('compress');
const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const isProcessing = ref(false);
const message = ref('');
const items = ref<ImageItem[]>([]);
const lastProcessedSignature = ref('');

const options = reactive<ProcessOptions>({
  outputFormat: 'image/png',
  quality: 0.82,
  resizeMode: 'original',
  targetWidth: 1080,
  targetHeight: 1080,
  longestSide: 1280,
  allowUpscale: false,
  fileSuffix: ''
});

const formats: Array<{ value: OutputFormat; label: string; note: string }> = [
  { value: 'image/png', label: 'PNG', note: '默认，清晰通用' },
  { value: 'image/jpeg', label: 'JPEG', note: '照片体积小' },
  { value: 'image/webp', label: 'WebP', note: '网页更轻' }
];

const modes: Array<{ id: ActiveMode; label: string; hint: string }> = [
  { id: 'compress', label: '压缩', hint: '调质量、减体积' },
  { id: 'resize', label: '改尺寸', hint: '头像、配图、网页图' },
  { id: 'convert', label: '转格式', hint: 'PNG / JPEG / WebP' }
];

const modeProfiles: Record<ActiveMode, { title: string; description: string; fields: string[] }> = {
  compress: {
    title: '压缩模式',
    description: '优先减小体积：输出 WebP，保持原尺寸，质量设为 78%。',
    fields: ['WebP', '78%', '原尺寸']
  },
  resize: {
    title: '改尺寸模式',
    description: '优先统一尺寸：按最长边 1280px 等比缩放，不放大小图。',
    fields: ['最长边', '1280px', '不放大']
  },
  convert: {
    title: '转格式模式',
    description: '优先切换格式：保持原尺寸，重点选择 PNG / JPEG / WebP。',
    fields: ['原尺寸', '选择格式', '批量导出']
  }
};

const presets: SizePreset[] = [
  { id: 'original', name: '原尺寸', description: '只压缩或转格式', mode: 'original', width: 0, height: 0, longestSide: 0 },
  { id: 'avatar', name: '头像', description: '最长边 512px', mode: 'longest', width: 0, height: 0, longestSide: 512 },
  { id: 'wechat', name: '公众号配图', description: '最长边 1280px', mode: 'longest', width: 0, height: 0, longestSide: 1280 },
  { id: 'social', name: '社交分享', description: '宽度 1080px', mode: 'width', width: 1080, height: 0, longestSide: 0 },
  { id: 'web', name: '网页小图', description: '宽度 800px', mode: 'width', width: 800, height: 0, longestSide: 0 }
];

const currentOptionsSignature = computed(() => JSON.stringify(options));
const doneItems = computed(() => items.value.filter((item) => item.status === 'done' && item.outputBlob));
const totalOriginalSize = computed(() => items.value.reduce((sum, item) => sum + item.originalSize, 0));
const totalOutputSize = computed(() => doneItems.value.reduce((sum, item) => sum + (item.outputBlob?.size || 0), 0));
const totalSavedSize = computed(() => Math.max(0, totalOriginalSize.value - totalOutputSize.value));
const processableItems = computed(() => items.value.filter((item) => item.previewUrl && item.status !== 'processing'));
const hasItems = computed(() => items.value.length > 0);
const hasPendingWork = computed(() => processableItems.value.some((item) => item.status !== 'done'));
const hasStaleItems = computed(() => items.value.some((item) => item.status === 'stale'));
const canProcess = computed(() => processableItems.value.length > 0 && !isProcessing.value);
const canDownloadAll = computed(() => doneItems.value.length > 0 && !isProcessing.value && !hasStaleItems.value);
const primaryActionText = computed(() => {
  if (isProcessing.value) return '处理中...';
  if (hasStaleItems.value) return '重新处理';
  if (doneItems.value.length) return '再次处理';
  return '确认处理';
});
const activeModeProfile = computed(() => modeProfiles[activeMode.value]);

watch(currentOptionsSignature, (signature) => {
  if (!lastProcessedSignature.value || signature === lastProcessedSignature.value) return;
  items.value.forEach((item) => {
    if (item.status === 'done') item.status = 'stale';
  });
  if (hasStaleItems.value) {
    message.value = '参数已调整，请点击重新处理生成最新结果。';
  }
});

onMounted(() => {
  window.addEventListener('paste', handlePaste);
});

onBeforeUnmount(() => {
  window.removeEventListener('paste', handlePaste);
  items.value.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
});

function openPicker() {
  fileInput.value?.click();
}

function selectMode(mode: ActiveMode) {
  activeMode.value = mode;

  if (mode === 'compress') {
    options.outputFormat = 'image/webp';
    options.quality = 0.78;
    options.resizeMode = 'original';
    options.fileSuffix = '';
  }

  if (mode === 'resize') {
    options.resizeMode = 'longest';
    options.longestSide = 1280;
    options.allowUpscale = false;
    options.fileSuffix = '';
  }

  if (mode === 'convert') {
    options.resizeMode = 'original';
    options.quality = 0.92;
    options.fileSuffix = '';
  }

  message.value = hasItems.value ? `已切换到${modeProfiles[mode].title}，参数已更新。` : `已切换到${modeProfiles[mode].title}。`;
}

async function handleInput(event: Event) {
  const input = event.target as HTMLInputElement;
  await addFiles(input.files);
  input.value = '';
}

async function handleDrop(event: DragEvent) {
  isDragging.value = false;
  await addFiles(event.dataTransfer?.files || null);
}

async function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;

  event.preventDefault();
  await addFiles(files);
}

async function addFiles(fileList: FileList | File[] | null) {
  if (!fileList?.length) return;
  const files = Array.from(fileList);
  const nextItems: ImageItem[] = [];

  for (const file of files) {
    try {
      nextItems.push(await createImageItem(file));
    } catch (error) {
      nextItems.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: '',
        originalWidth: 0,
        originalHeight: 0,
        originalSize: file.size,
        outputBlob: null,
        outputWidth: 0,
        outputHeight: 0,
        outputFormat: options.outputFormat,
        status: 'error',
        error: error instanceof Error ? error.message : '图片读取失败'
      });
    }
  }

  items.value = [...items.value, ...nextItems];
  const readyCount = nextItems.filter((item) => item.previewUrl).length;
  message.value = readyCount ? `已加入 ${readyCount} 张图片，确认参数后点击处理。` : '没有可处理的图片。';
}

async function processAll() {
  if (!canProcess.value) return;
  isProcessing.value = true;
  message.value = '';

  for (const item of processableItems.value) {
    item.status = 'processing';
    item.error = '';

    try {
      const output = await processImage(item, options);
      item.outputBlob = output.blob;
      item.outputWidth = output.width;
      item.outputHeight = output.height;
      item.outputFormat = output.format;
      item.status = 'done';
    } catch (error) {
      item.outputBlob = null;
      item.status = 'error';
      item.error = error instanceof Error ? error.message : '处理失败';
    }
  }

  lastProcessedSignature.value = currentOptionsSignature.value;
  isProcessing.value = false;
  message.value = doneItems.value.length ? `已生成 ${doneItems.value.length} 个输出文件。` : '处理失败，请检查图片后再试。';
}

function applyPreset(preset: SizePreset) {
  options.resizeMode = preset.mode;
  options.targetWidth = preset.width || options.targetWidth;
  options.targetHeight = preset.height || options.targetHeight;
  options.longestSide = preset.longestSide || options.longestSide;
  activeMode.value = preset.mode === 'original' ? activeMode.value : 'resize';
}

function setResizeMode(mode: ResizeMode) {
  options.resizeMode = mode;
}

function removeItem(id: string) {
  const item = items.value.find((current) => current.id === id);
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  items.value = items.value.filter((current) => current.id !== id);
}

function clearAll() {
  items.value.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  items.value = [];
  message.value = '';
  lastProcessedSignature.value = '';
}

function downloadItem(item: ImageItem) {
  if (!item.outputBlob || item.status !== 'done') return;
  downloadBlob(item.outputBlob, outputFileName(item, options));
}

async function downloadAll() {
  if (!canDownloadAll.value) return;
  await downloadZip(doneItems.value, options);
}

function statusText(item: ImageItem): string {
  if (item.status === 'done') return '完成';
  if (item.status === 'processing') return '处理中';
  if (item.status === 'error') return '失败';
  if (item.status === 'stale') return '需重新处理';
  return '待确认';
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">本地处理 · 不上传图片</p>
        <h1>图片工具箱</h1>
      </div>
      <div class="summary-strip" aria-label="处理概览">
        <span>{{ items.length }} 张图片</span>
        <span>{{ formatBytes(totalOriginalSize) }}</span>
        <span v-if="totalOutputSize">输出 {{ formatBytes(totalOutputSize) }}</span>
        <span v-if="totalSavedSize">节省 {{ formatBytes(totalSavedSize) }}</span>
      </div>
    </header>

    <section class="mode-tabs" aria-label="工具模式">
      <button
        v-for="mode in modes"
        :key="mode.id"
        class="mode-tab"
        :class="{ active: activeMode === mode.id }"
        type="button"
        @click="selectMode(mode.id)"
      >
        <strong>{{ mode.label }}</strong>
        <span>{{ mode.hint }}</span>
      </button>
    </section>

    <section class="workspace">
      <aside class="control-panel">
        <section class="mode-summary" aria-live="polite">
          <div>
            <strong>{{ activeModeProfile.title }}</strong>
            <p>{{ activeModeProfile.description }}</p>
          </div>
          <div class="mode-chips">
            <span v-for="field in activeModeProfile.fields" :key="field">{{ field }}</span>
          </div>
        </section>

        <section class="panel-section" :class="{ spotlight: activeMode === 'convert' || activeMode === 'compress' }">
          <div class="section-title">
            <h2>输出格式</h2>
            <span>{{ activeMode === 'compress' ? '推荐 WebP' : activeMode === 'convert' ? '选择目标格式' : '默认 PNG' }}</span>
          </div>
          <div class="format-grid">
            <button
              v-for="format in formats"
              :key="format.value"
              class="choice-card"
              :class="{ active: options.outputFormat === format.value }"
              type="button"
              @click="options.outputFormat = format.value"
            >
              <strong>{{ format.label }}</strong>
              <small>{{ format.note }}</small>
            </button>
          </div>
        </section>

        <section class="panel-section" :class="{ spotlight: activeMode === 'compress' }">
          <div class="section-title">
            <h2>压缩质量</h2>
            <span>{{ Math.round(options.quality * 100) }}%</span>
          </div>
          <input v-model.number="options.quality" class="range" type="range" min="0.2" max="1" step="0.01" />
          <p class="hint">PNG 由浏览器编码，质量主要影响 JPEG 和 WebP。</p>
        </section>

        <section class="panel-section" :class="{ spotlight: activeMode === 'resize' }">
          <div class="section-title">
            <h2>尺寸预设</h2>
            <span>{{ options.resizeMode === 'original' ? '原尺寸' : '缩放' }}</span>
          </div>
          <div class="preset-grid">
            <button
              v-for="preset in presets"
              :key="preset.id"
              class="choice-card preset-card"
              :class="{ active: options.resizeMode === preset.mode && (preset.longestSide === options.longestSide || preset.width === options.targetWidth || preset.mode === 'original') }"
              type="button"
              @click="applyPreset(preset)"
            >
              <strong>{{ preset.name }}</strong>
              <small>{{ preset.description }}</small>
            </button>
          </div>
        </section>

        <section class="panel-section" :class="{ spotlight: activeMode === 'resize' }">
          <div class="section-title">
            <h2>自定义尺寸</h2>
            <span>等比缩放</span>
          </div>
          <div class="segmented">
            <button type="button" :class="{ active: options.resizeMode === 'original' }" @click="setResizeMode('original')">原图</button>
            <button type="button" :class="{ active: options.resizeMode === 'longest' }" @click="setResizeMode('longest')">最长边</button>
            <button type="button" :class="{ active: options.resizeMode === 'width' }" @click="setResizeMode('width')">宽度</button>
            <button type="button" :class="{ active: options.resizeMode === 'height' }" @click="setResizeMode('height')">高度</button>
          </div>
          <div class="input-grid">
            <label>
              最长边
              <input v-model.number="options.longestSide" min="1" type="number" :disabled="options.resizeMode !== 'longest'" />
            </label>
            <label>
              宽度
              <input v-model.number="options.targetWidth" min="1" type="number" :disabled="options.resizeMode !== 'width'" />
            </label>
            <label>
              高度
              <input v-model.number="options.targetHeight" min="1" type="number" :disabled="options.resizeMode !== 'height'" />
            </label>
          </div>
          <label class="toggle-row">
            <input v-model="options.allowUpscale" type="checkbox" />
            <span>允许放大小图</span>
          </label>
        </section>

        <section class="panel-section">
          <div class="section-title">
            <h2>文件名后缀</h2>
            <span>可选</span>
          </div>
          <input v-model="options.fileSuffix" class="text-input" placeholder="留空自动生成，如 png-1280w" />
        </section>
      </aside>

      <section class="main-panel">
        <div
          class="dropzone"
          :class="{ dragging: isDragging }"
          @click="openPicker"
          @dragenter.prevent="isDragging = true"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <input ref="fileInput" class="sr-only" type="file" accept="image/*" multiple @change="handleInput" />
          <div class="upload-icon">+</div>
          <div>
            <h2>拖入图片，或点击选择</h2>
            <p>支持拖拽、点击选择，也可以直接 Ctrl + V 粘贴截图或剪贴板图片。</p>
          </div>
        </div>

        <div class="toolbar">
          <div>
            <strong>处理队列</strong>
            <span v-if="message">{{ message }}</span>
            <span v-else-if="isProcessing">正在处理...</span>
            <span v-else-if="hasStaleItems">参数已调整，需要重新处理后再下载。</span>
            <span v-else-if="hasPendingWork">图片已就绪，确认参数后开始处理。</span>
            <span v-else-if="hasItems">已生成 {{ doneItems.length }} 个输出文件</span>
            <span v-else>还没有图片</span>
          </div>
          <div class="toolbar-actions">
            <button class="secondary" type="button" :disabled="!hasItems" @click="clearAll">清空</button>
            <button class="primary" type="button" :disabled="!canProcess" @click="processAll">{{ primaryActionText }}</button>
            <button class="primary download-button" type="button" :disabled="!canDownloadAll" @click="downloadAll">下载 ZIP</button>
          </div>
        </div>

        <section v-if="hasItems" class="image-list" aria-label="图片处理列表">
          <article v-for="item in items" :key="item.id" class="image-row">
            <div class="thumb">
              <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.file.name" />
              <span v-else>!</span>
            </div>
            <div class="image-info">
              <div class="name-line">
                <strong>{{ item.file.name }}</strong>
                <span :class="['status-pill', item.status]">{{ statusText(item) }}</span>
              </div>
              <div class="meta-grid">
                <span>原图 {{ formatDimensions(item.originalWidth, item.originalHeight) }}</span>
                <span>{{ formatBytes(item.originalSize) }}</span>
                <span v-if="item.outputBlob">输出 {{ formatDimensions(item.outputWidth, item.outputHeight) }}</span>
                <span v-if="item.outputBlob">{{ labelFor(item.outputFormat) }} · {{ formatBytes(item.outputBlob.size) }}</span>
                <span v-if="item.outputBlob">{{ formatRatio(item.originalSize, item.outputBlob.size) }}</span>
                <span v-if="item.status === 'stale'" class="warning-text">旧结果不可下载，请重新处理。</span>
                <span v-if="item.error" class="error-text">{{ item.error }}</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="secondary" type="button" :disabled="!item.outputBlob || item.status !== 'done'" @click="downloadItem(item)">下载</button>
              <button class="ghost" type="button" @click="removeItem(item.id)">移除</button>
            </div>
          </article>
        </section>

        <section v-else class="empty-state">
          <h2>适合这些小场景</h2>
          <div class="use-cases">
            <span>报名上传图片太大</span>
            <span>公众号配图统一宽度</span>
            <span>PNG / JPEG / WebP 互转</span>
            <span>网页图片批量瘦身</span>
          </div>
        </section>
      </section>
    </section>
  </main>
</template>
