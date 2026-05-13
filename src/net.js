export class Net {
  constructor(url, handlers) {
    this.url = url;
    this.handlers = handlers;
    this.ws = null;
    this.connected = false;
  }
  connect() {
    return new Promise((resolve, reject) => {
      try { this.ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => reject(new Error("connect timeout")), 5000);
      this.ws.onopen = () => { clearTimeout(timer); this.connected = true; resolve(); };
      this.ws.onerror = (e) => { clearTimeout(timer); reject(e); };
      this.ws.onclose = () => { this.connected = false; this.handlers.onClose?.(); };
      this.ws.onmessage = (ev) => {
        try { const m = JSON.parse(ev.data); this.handlers.onMessage?.(m); } catch {}
      };
    });
  }
  send(type, data = {}) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ type, ...data }));
  }
  close() { try { this.ws?.close(); } catch {} }
}
