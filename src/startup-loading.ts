export type LoadingEvent = { source: "clarklab-loading"; type: "loading" | "ready" | "error"; progress?: number; label?: string };

let overlay: HTMLDivElement | undefined;
function send(event: LoadingEvent) { if (window.parent !== window) window.parent.postMessage(event, window.location.origin); }
function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#0f172af7,#1e2939f2);color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;text-align:center";
  overlay.innerHTML = '<div style="width:min(280px,100%)"><span style="display:block;width:28px;height:28px;margin:0 auto 14px;border:3px solid #ffffff38;border-top-color:#fff;border-radius:50%;animation:clarklab-loading-spin .8s linear infinite"></span><strong style="display:block;font-size:16px">正在加载</strong><p data-label style="margin:8px 0 13px;color:#cbd5e1;font-size:13px">正在准备应用…</p><div style="height:7px;overflow:hidden;border-radius:99px;background:#ffffff2b"><i data-bar style="display:block;width:8%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#60a5fa,#a78bfa);transition:width .22s ease"></i></div><small data-progress style="display:block;margin-top:6px;color:#cbd5e1">8%</small></div><style>@keyframes clarklab-loading-spin{to{transform:rotate(360deg)}}</style>';
  document.body.appendChild(overlay);
  return overlay;
}
function update(progress: number, label: string) { const view = ensureOverlay(); (view.querySelector("[data-bar]") as HTMLElement).style.width = `${Math.max(0, Math.min(100, progress))}%`; view.querySelector("[data-label]")!.textContent = label; view.querySelector("[data-progress]")!.textContent = `${Math.round(progress)}%`; }
export const startupLoading = {
  report(progress: number, label: string) { update(progress, label); send({ source: "clarklab-loading", type: "loading", progress, label }); },
  ready(label = "准备完成") { update(100, label); send({ source: "clarklab-loading", type: "ready", progress: 100, label }); window.setTimeout(() => overlay?.remove(), 180); },
  error(label = "加载失败，请刷新后重试") { ensureOverlay().querySelector("[data-label]")!.textContent = label; send({ source: "clarklab-loading", type: "error", label }); },
};