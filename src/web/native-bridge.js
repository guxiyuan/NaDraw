(() => {
  'use strict';

  const webview = window.chrome?.webview;
  if (!webview) {
    window.nadraw = {
      saveProject: async () => ({ canceled: true }),
      openProject: async () => ({ canceled: true }),
      exportImage: async () => ({ canceled: true }),
      onOpenProject: () => {},
      getUpdateSettings: async () => ({ enabled: false, available: false }),
      setAutoUpdates: async () => ({ enabled: false, available: false }),
      checkUpdates: async () => { throw new Error('请在安装后的 NaDraw 中检查更新'); },
      onUpdateStatus: () => {}
    };
    return;
  }

  let nextId = 1;
  let openProjectHandler = null;
  let updateStatusHandler = null;
  const pending = new Map();

  function encodeUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function request(action, rawPayload = '') {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      webview.postMessage(`${id}|${action}|${encodeUtf8(rawPayload)}`);
    });
  }

  webview.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.event === 'update-state') { if (updateStatusHandler) updateStatusHandler(message); return; }
    if (message.result && typeof message.result.projectText === 'string') {
      try { message.result.project = JSON.parse(message.result.projectText); }
      catch { message.result.error = '工程文件格式错误，无法打开'; }
      delete message.result.projectText;
    }
    if (message.event === 'open-project') {
      if (openProjectHandler) openProjectHandler(message.result);
      return;
    }
    const task = pending.get(Number(message.id));
    if (!task) return;
    pending.delete(Number(message.id));
    if (message.ok === false) task.reject(new Error(message.error || '操作失败'));
    else task.resolve(message.result);
  });

  window.nadraw = {
    getUpdateSettings() { return request('get-update-settings'); },
    setAutoUpdates(enabled) { return request('set-auto-updates', enabled ? '1' : '0'); },
    checkUpdates() { return request('check-updates'); },
    onUpdateStatus(callback) { updateStatusHandler=callback; },
    saveProject({ project, suggestedName }) {
      return request('save-project', `${suggestedName || '未命名1.nad'}\0${JSON.stringify(project)}`);
    },
    openProject() {
      return request('open-project');
    },
    exportImage({ format, jpegDataUrl, svgText, suggestedName }) {
      return request('export-image', `${format || 'choose'}\0${suggestedName || '未命名1.jpg'}\0${jpegDataUrl || ''}\0${svgText || ''}`);
    },
    onOpenProject(callback) {
      openProjectHandler = typeof callback === 'function' ? callback : null;
      request('bridge-ready').catch(() => {});
    }
  };
})();
