(() => {
  'use strict';

  const canvas = document.getElementById('drawing-canvas');
  let ctx = canvas.getContext('2d');
  const stage = document.getElementById('drawing-stage');
  const toastNode = document.getElementById('canvas-toast');
  const hintNode = document.getElementById('canvas-hint');
  const contextMenu = document.getElementById('context-menu');
  const assistPanel = document.getElementById('assist-panel');
  const arrowPopover = document.getElementById('arrow-popover');
  const templatePopover = document.getElementById('template-popover');
  const chargePopover = document.getElementById('charge-popover');
  const bracketPopover = document.getElementById('bracket-popover');
  const markPopover = document.getElementById('mark-popover');
  const textPopover = document.getElementById('text-popover');
  const periodicPanel = document.getElementById('periodic-panel');
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  const tutorialPages = [...document.querySelectorAll('[data-tutorial-page]')];
  const tutorialNavButtons = [...document.querySelectorAll('[data-tutorial-target]')];
  let tutorialPageIndex = 0;
  const blackCrosshairCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 1v22M1 12h22' stroke='white' stroke-width='3'/%3E%3Cpath d='M12 1v22M1 12h22' stroke='black' stroke-width='1.5'/%3E%3Ccircle cx='12' cy='12' r='1.5' fill='black'/%3E%3C/svg%3E") 12 12, crosshair`;
  const CHEM_FONT = '"Cambria Math", "STIX Two Text", "Times New Roman", "Microsoft YaHei UI", serif';
  const TEXT_FONT = '"Cambria Math", "STIX Two Text", "Times New Roman", "Microsoft YaHei UI", serif';
  const TEXT_PLACEHOLDER = '请输入文字';
  const ELEMENTS = {
    H: { valence: 1 }, B: { valence: 3 }, C: { valence: 4 }, N: { valence: 3 }, O: { valence: 2 }, F: { valence: 1 },
    P: { valence: 3 }, S: { valence: 2 }, Cl: { valence: 1 }, Br: { valence: 1 }, I: { valence: 1 }, Si: { valence: 4 },
    Li: { valence: 1 }, Na: { valence: 1 }, K: { valence: 1 }, Mg: { valence: 2 }, Ca: { valence: 2 }, Al: { valence: 3 }
  };
  const TOOL_HINTS = {
    select: '选择工具：点击对象选择，拖动框选；八个控制点缩放，顶部圆形手柄可旋转。',
    pan: '平移工具：拖动无限画布；按住空格也可临时平移。',
    bond: '化学键：拖动绘制；双键工具点击双键主体，切换居中、一侧短线、另一侧短线。端点用于继续接键。',
    chain: '碳链：拖动生成连续的标准键长碳链。',
    template: '模板：在画布点击插入化学结构模板；模板由真实原子与键组成。',
    arrow: '箭头：直线拖动绘制；三点曲线依次点击三点；连续折线双击或按 Enter 完成。直线和折线使用角度辅助。',
    charge: '电荷：点击原子添加正电；右键可改为负电、带圈样式或移除。',
    bracket: '括号：先框选基团后点击可自动贴合；也可拖动框出范围。',
    mark: '点位：点击画布放置圆点；右键可切换叉号。',
    text: '文字：先点击画布确定位置，再在自动弹出的编辑器中输入和排版。',
    element: '元素：点击原子端点将其替换为所选元素，标签自动排版且可自动补氢。'
  };

  const state = {
    atoms: [],
    bonds: [],
    decorations: [],
    selected: { atoms: new Set(), bonds: new Set(), decorations: new Set() },
    viewport: { x: 0, y: 0, zoom: 1 },
    tool: 'select',
    element: 'C',
    bondOrder: 1,
    bondStyle: 'normal',
    template: 'benzene',
    arrow: { line: 'solid', mode: 'straight', head: 'full' },
    arrowDraft: null,
    mark: 'dot',
    bracket: 'round',
    chargeStyle: 'plus',
    text: { value: TEXT_PLACEHOLDER, size: 14, color: '#111111' },
    editingTextId: null,
    editingAtomId: null,
    bondLength: 24,
    grid: false,
    assist: { fixedLength: true, snapAtoms: true, textSnap: true, smartGuides: true, batchText: false, snapAngles: true, implicitHydrogens: true, labelAvoidance: true, valenceCheck: true },
    interaction: null,
    canvas: { width: 1, height: 1, dpr: 1 },
    cursor: { x: 0, y: 0 },
    history: [],
    historyIndex: -1,
    fileName: '未命名1.nad',
    dirty: false,
    spaceDown: false,
    pointerInside: false,
    suppressContextOnce: false,
    clipboard: null,
    pasteSerial: 0
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = (value, precision = 1) => Math.round(value * 10 ** precision) / 10 ** precision;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const normalize = (vector) => { const size = Math.hypot(vector.x, vector.y) || 1; return { x: vector.x / size, y: vector.y / size }; };
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

  const documentWorkspace = { documents: [], activeId: null, nextUntitled: 2 };
  function captureDocument(id = uid('doc')) {
    return {
      id,
      atoms: clone(state.atoms),
      bonds: clone(state.bonds),
      decorations: clone(state.decorations),
      selected: {
        atoms: [...state.selected.atoms],
        bonds: [...state.selected.bonds],
        decorations: [...state.selected.decorations]
      },
      viewport: clone(state.viewport),
      history: clone(state.history),
      historyIndex: state.historyIndex,
      fileName: state.fileName,
      dirty: state.dirty,
      bondLength: state.bondLength,
      grid: state.grid,
      assist: clone(state.assist),
      text: clone(state.text)
    };
  }
  function activeDocument() { return documentWorkspace.documents.find((document) => document.id === documentWorkspace.activeId); }
  function syncActiveDocument() {
    const document = activeDocument();
    if (!document) return;
    Object.assign(document, captureDocument(document.id));
  }
  function restoreDocument(document) {
    state.atoms = clone(document.atoms || []);
    state.bonds = clone(document.bonds || []);
    state.decorations = clone(document.decorations || []);
    state.selected = {
      atoms: new Set(document.selected?.atoms || []),
      bonds: new Set(document.selected?.bonds || []),
      decorations: new Set(document.selected?.decorations || [])
    };
    state.viewport = clone(document.viewport || { x: state.canvas.width / 2, y: state.canvas.height / 2, zoom: 1 });
    state.history = clone(document.history || []);
    state.historyIndex = Number.isInteger(document.historyIndex) ? document.historyIndex : -1;
    state.fileName = document.fileName || '未命名1.nad';
    state.dirty = Boolean(document.dirty);
    state.bondLength = document.bondLength || 24;
    state.grid = Boolean(document.grid);
    state.assist = { ...state.assist, ...(document.assist || {}) };
    state.text = { ...state.text, ...(document.text || {}) };
    state.interaction = null;
    state.arrowDraft = null;
    state.editingTextId = null;
    state.editingAtomId = null;
  }
  function blankDocument(fileName) {
    const document = captureDocument();
    document.atoms = [];
    document.bonds = [];
    document.decorations = [];
    document.selected = { atoms: [], bonds: [], decorations: [] };
    document.viewport = { x: state.canvas.width / 2, y: state.canvas.height / 2, zoom: 1 };
    document.history = [];
    document.historyIndex = -1;
    document.fileName = fileName;
    document.dirty = false;
    return document;
  }
  function nextUntitledName() { const name = `未命名${documentWorkspace.nextUntitled}.nad`; documentWorkspace.nextUntitled += 1; return name; }
  function tabEscape(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
  function renderDocumentTabs() {
    const list = document.getElementById('document-tab-list');
    if (!list) return;
    list.innerHTML = documentWorkspace.documents.map((document) => {
      const label = (document.fileName || '未命名').replace(/\.(?:nad|chd)$/i, '');
      return `<div class="document-tab-item${document.id === documentWorkspace.activeId ? ' active' : ''}" data-document-id="${tabEscape(document.id)}" role="button" tabindex="0" title="${tabEscape(label)}"><span class="doc-mark">⌬</span><span class="document-tab-name">${tabEscape(label)}</span><span class="document-tab-dirty">${document.dirty ? '*' : ''}</span><button class="document-tab-close" data-document-close="${tabEscape(document.id)}" title="关闭 ${tabEscape(label)}">×</button></div>`;
    }).join('');
  }
  function switchDocument(id) {
    if (!id || id === documentWorkspace.activeId) return;
    syncActiveDocument();
    const document = documentWorkspace.documents.find((item) => item.id === id);
    if (!document) return;
    documentWorkspace.activeId = id;
    closePopups();
    hideContext();
    restoreDocument(document);
    syncAssistControls();
    render();
    showToast(`已切换到：${state.fileName.replace(/\.(?:nad|chd)$/i, '')}`);
  }
  function closeDocument(id) {
    const index = documentWorkspace.documents.findIndex((document) => document.id === id);
    if (index < 0) return;
    if (id === documentWorkspace.activeId) syncActiveDocument();
    const document = documentWorkspace.documents[index];
    if (document.dirty && !window.confirm(`“${document.fileName.replace(/\.(?:nad|chd)$/i, '')}”尚未保存，确定关闭吗？`)) return;
    documentWorkspace.documents.splice(index, 1);
    if (!documentWorkspace.documents.length) documentWorkspace.documents.push(blankDocument(nextUntitledName()));
    if (id === documentWorkspace.activeId) {
      const next = documentWorkspace.documents[Math.min(index, documentWorkspace.documents.length - 1)];
      documentWorkspace.activeId = next.id;
      restoreDocument(next);
      if (state.historyIndex < 0) pushHistory(false);
      syncAssistControls();
      render();
    } else renderDocumentTabs();
  }

  const firstDocument = captureDocument();
  documentWorkspace.documents.push(firstDocument);
  documentWorkspace.activeId = firstDocument.id;

  function serializableState() {
    return { atoms: clone(state.atoms), bonds: clone(state.bonds), decorations: clone(state.decorations), bondLength: state.bondLength, grid: state.grid, assist: clone(state.assist), textStyle: clone(state.text) };
  }
  function pushHistory(markDirty = true) {
    const next = serializableState();
    if (state.historyIndex >= 0 && JSON.stringify(state.history[state.historyIndex]) === JSON.stringify(next)) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(next);
    if (state.history.length > 90) state.history.shift();
    state.historyIndex = state.history.length - 1;
    if (markDirty) state.dirty = true;
    updateChrome();
  }
  function restoreHistory(index) {
    if (index < 0 || index >= state.history.length) return;
    const snap = clone(state.history[index]);
    state.atoms = snap.atoms || [];
    state.bonds = snap.bonds || [];
    state.decorations = snap.decorations || [];
    state.bondLength = snap.bondLength || 24;
    state.grid = Boolean(snap.grid);
    state.assist = { ...state.assist, ...(snap.assist || {}) };
    state.text = { ...state.text, ...(snap.textStyle || {}) };
    clearSelection();
    state.historyIndex = index;
    state.dirty = true;
    syncAssistControls();
    updateChrome();
    render();
  }
  function undo() { if (state.historyIndex > 0) restoreHistory(state.historyIndex - 1); }
  function redo() { if (state.historyIndex < state.history.length - 1) restoreHistory(state.historyIndex + 1); }

  function screenPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function toWorld(point) { return { x: (point.x - state.viewport.x) / state.viewport.zoom, y: (point.y - state.viewport.y) / state.viewport.zoom }; }
  function toScreen(point) { return { x: state.viewport.x + point.x * state.viewport.zoom, y: state.viewport.y + point.y * state.viewport.zoom }; }
  function inWorldContext() { ctx.save(); ctx.translate(state.viewport.x, state.viewport.y); ctx.scale(state.viewport.zoom, state.viewport.zoom); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    state.canvas = { width: rect.width, height: rect.height, dpr };
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    if (state.historyIndex < 0) { state.viewport.x = rect.width / 2; state.viewport.y = rect.height / 2; pushHistory(false); }
    render();
  }

  function atomById(id) { return state.atoms.find((atom) => atom.id === id); }
  function bondAtoms(bond) { return [atomById(bond.a), atomById(bond.b)]; }
  function bondsFor(atomId) { return state.bonds.filter((bond) => bond.a === atomId || bond.b === atomId); }
  function valenceFor(atom) { return bondsFor(atom.id).reduce((total, bond) => total + (bond.style === 'normal' ? bond.order : 1), 0); }
  function implicitHydrogens(atom) {
    if (!state.assist.implicitHydrogens) return 0;
    const target = ELEMENTS[atom.element]?.valence;
    if (!target) return 0;
    return Math.max(0, Math.min(4, target - valenceFor(atom) - Math.max(0, atom.charge || 0)));
  }
  function formattedAtom(atom) {
    const hiddenCarbon = atom.element === 'C' && !atom.explicit && !(atom.charge);
    if (hiddenCarbon) return '';
    return atom.element;
  }
  function subscript(value) { return String(value).replace(/[0-9]/g, (n) => '₀₁₂₃₄₅₆₇₈₉'[Number(n)]); }
  function superscript(value) { const symbol = value > 0 ? '⁺' : '⁻'; const magnitude = Math.abs(value); return `${magnitude > 1 ? String(magnitude).replace(/[0-9]/g, (n) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(n)]) : ''}${symbol}`; }
  function automaticAtomText(atom) {
    const core = formattedAtom(atom); if (!core) return '';
    const count = implicitHydrogens(atom); const hydrogen = count > 0 && atom.element !== 'H' ? `H${count > 1 ? subscript(count) : ''}` : '';
    if (!hydrogen) return core;
    const direction = chooseDirection(atom);
    if (Math.abs(direction.y) > .55) return direction.y < 0 ? `${hydrogen}\n${core}` : `${core}\n${hydrogen}`;
    return direction.x < 0 ? `${hydrogen}${core}` : `${core}${hydrogen}`;
  }
  function atomTextValue(atom) { return typeof atom.labelOverride === 'string' ? atom.labelOverride : automaticAtomText(atom); }
  function createAtom(point, element = 'C', explicit = false) { const atom = { id: uid('atom'), x: round(point.x), y: round(point.y), element, explicit, charge: 0, chargeStyle: 'plain' }; state.atoms.push(atom); return atom; }
  function newBond(a, b, order = state.bondOrder, style = state.bondStyle) {
    if (a.id === b.id) return null;
    const existing = state.bonds.find((bond) => (bond.a === a.id && bond.b === b.id) || (bond.a === b.id && bond.b === a.id));
    if (existing) { existing.order = order; existing.style = style; return existing; }
    const bond = { id: uid('bond'), a: a.id, b: b.id, order, style }; state.bonds.push(bond); return bond;
  }
  function closestAtom(point, radius = 11 / state.viewport.zoom, ignoreId = null) {
    let candidate = null; let best = radius;
    state.atoms.forEach((atom) => { if (atom.id !== ignoreId) { const d = distance(point, atom); if (d <= best) { candidate = atom; best = d; } } });
    return candidate;
  }
  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x; const dy = b.y - a.y; const len = dx * dx + dy * dy;
    const t = len ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / len, 0, 1) : 0;
    return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
  }
  function closestBond(point) {
    let candidate = null; let best = 5.5 / state.viewport.zoom;
    state.bonds.forEach((bond) => { const [a, b] = bondAtoms(bond); if (!a || !b) return;bondVisualSegments(bond,a,b).forEach((segment)=>{const d=distanceToSegment(point,segment.a,segment.b);if(d<=best){candidate=bond;best=d;}}); });
    return candidate;
  }
  function bondBounds(bond){const[a,b]=bondAtoms(bond);if(!a||!b)return null;let points=[];if(['wedge','hollow','hash'].includes(bond.style)){const p=perpendicular(a,b,wedgeWidth(a,b));points=[a,{x:b.x+p.x,y:b.y+p.y},{x:b.x-p.x,y:b.y-p.y}];}else bondVisualSegments(bond,a,b).forEach((segment)=>points.push(segment.a,segment.b));const pad=2/state.viewport.zoom;return{x1:Math.min(...points.map(point=>point.x))-pad,y1:Math.min(...points.map(point=>point.y))-pad,x2:Math.max(...points.map(point=>point.x))+pad,y2:Math.max(...points.map(point=>point.y))+pad};}
  function decorationBounds(decoration) {
    if (decoration.type === 'arrow') { const points=arrowPoints(decoration);if(!points.length)return{x1:0,y1:0,x2:0,y2:0};const padding=14;return { x1: Math.min(...points.map(point=>point.x)) - padding, y1: Math.min(...points.map(point=>point.y)) - padding, x2: Math.max(...points.map(point=>point.x)) + padding, y2: Math.max(...points.map(point=>point.y)) + padding }; }
    if (decoration.type === 'bracket') return { x1: Math.min(decoration.x1, decoration.x2) - 7, y1: Math.min(decoration.y1, decoration.y2) - 7, x2: Math.max(decoration.x1, decoration.x2) + 7, y2: Math.max(decoration.y1, decoration.y2) + 7 };
    if (decoration.type === 'text') {
      ctx.save(); ctx.font = `${decoration.size}px ${TEXT_FONT}`;
      const lines=String(decoration.value||' ').split(/\r?\n/);const width=Math.max(8,...lines.map(line=>ctx.measureText(line||' ').width));ctx.restore();const height=decoration.size+(lines.length-1)*decoration.size*1.2;const left=decoration.textAlign==='center'?decoration.x-width/2:decoration.x;const top=decoration.textBaseline==='middle'?decoration.y-height/2:decoration.y-decoration.size;
      return { x1: left - 4, y1: top - 4, x2: left + width + 4, y2: top + height + 7 };
    }
    return { x1: decoration.x - 12, y1: decoration.y - 12, x2: decoration.x + 12, y2: decoration.y + 12 };
  }
  function closestDecoration(point) {
    for (let i = state.decorations.length - 1; i >= 0; i -= 1) { const d = state.decorations[i]; const b = decorationBounds(d); if (point.x >= b.x1 && point.x <= b.x2 && point.y >= b.y1 && point.y <= b.y2) return d; }
    return null;
  }
  function clearSelection() { state.selected.atoms.clear(); state.selected.bonds.clear(); state.selected.decorations.clear(); }
  function selectAll(showMessage = true) {
    clearSelection();
    state.atoms.forEach((atom) => state.selected.atoms.add(atom.id));
    state.bonds.forEach((bond) => state.selected.bonds.add(bond.id));
    state.decorations.forEach((decoration) => state.selected.decorations.add(decoration.id));
    const selected = state.atoms.length + state.bonds.length + state.decorations.length;
    if (selected) setTool('select', document.querySelector('.tool[data-tool="select"]'));
    else render();
    if (showMessage) showToast(selected ? `已全选当前画布中的 ${selected} 个对象` : '当前画布没有可选择的对象');
    return selected > 0;
  }
  function selectedAtomIds() { return [...state.selected.atoms]; }
  function transformAtomIds() {
    const ids = new Set(state.selected.atoms);
    state.bonds.forEach((bond) => { if (state.selected.bonds.has(bond.id)) { ids.add(bond.a); ids.add(bond.b); } });
    return ids;
  }
  function selectionBounds() {
    const points = [];
    transformAtomIds().forEach((id) => { const atom = atomById(id); if (atom) points.push({ x: atom.x, y: atom.y }); });
    state.selected.decorations.forEach((id) => {
      const decoration = state.decorations.find((item) => item.id === id);
      if (!decoration) return;
      const b = decorationBounds(decoration);
      points.push({ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 });
    });
    if (!points.length) return null;
    return { x1: Math.min(...points.map((point) => point.x)), y1: Math.min(...points.map((point) => point.y)), x2: Math.max(...points.map((point) => point.x)), y2: Math.max(...points.map((point) => point.y)) };
  }
  function selectionPayload() {
    const atomIds = transformAtomIds();
    const atoms = state.atoms.filter((atom) => atomIds.has(atom.id)).map(clone);
    const bonds = state.bonds.filter((bond) => state.selected.bonds.has(bond.id)).map(clone);
    const decorations = state.decorations.filter((decoration) => state.selected.decorations.has(decoration.id)).map(clone);
    if (!atoms.length && !bonds.length && !decorations.length) return null;
    const bounds = selectionBounds();
    return { atoms, bonds, decorations, center: bounds ? { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 } : { x: 0, y: 0 } };
  }
  function copySelection(showMessage = true) {
    const payload = selectionPayload();
    if (!payload) { if (showMessage) showToast('请先选择要复制的对象'); return false; }
    state.clipboard = payload; state.pasteSerial = 0;
    if (showMessage) showToast('已复制选中对象');
    return true;
  }
  function cutSelection() { if (copySelection(false)) { deleteSelection(); showToast('已剪切选中对象'); } }
  function pasteSelection() {
    if (!state.clipboard) { showToast('剪贴板中没有 NaDraw 对象'); return; }
    state.pasteSerial += 1; const offset = (12 + Math.min(24, state.pasteSerial * 4)) / state.viewport.zoom;
    const map = new Map(); const pastedAtoms = [];
    state.clipboard.atoms.forEach((source) => { const atom = clone(source); const oldId = atom.id; atom.id = uid('atom'); atom.x += offset; atom.y += offset; map.set(oldId, atom.id); pastedAtoms.push(atom); state.atoms.push(atom); });
    const pastedBonds = [];
    state.clipboard.bonds.forEach((source) => { if (!map.has(source.a) || !map.has(source.b)) return; const bond = clone(source); bond.id = uid('bond'); bond.a = map.get(source.a); bond.b = map.get(source.b); pastedBonds.push(bond); state.bonds.push(bond); });
    const pastedDecorations = state.clipboard.decorations.map((source) => { const decoration = clone(source); decoration.id = uid('dec'); moveDecoration(decoration, offset, offset); state.decorations.push(decoration); return decoration; });
    clearSelection(); pastedAtoms.forEach((atom) => state.selected.atoms.add(atom.id)); pastedBonds.forEach((bond) => state.selected.bonds.add(bond.id)); pastedDecorations.forEach((decoration) => state.selected.decorations.add(decoration.id));
    pushHistory(); render(); showToast('已粘贴，可直接拖动到目标位置');
  }
  function transformFrame() {
    const bounds = selectionBounds();
    if (!bounds) return null;
    const minimum = 18 / state.viewport.zoom;
    const center = { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 };
    const halfWidth = Math.max((bounds.x2 - bounds.x1) / 2, minimum / 2);
    const halfHeight = Math.max((bounds.y2 - bounds.y1) / 2, minimum / 2);
    const pad = 9 / state.viewport.zoom;
    return { x1: center.x - halfWidth - pad, y1: center.y - halfHeight - pad, x2: center.x + halfWidth + pad, y2: center.y + halfHeight + pad, center };
  }
  function frameHandlePoint(frame, handle) {
    const x = handle.includes('w') ? frame.x1 : handle.includes('e') ? frame.x2 : frame.center.x;
    const y = handle.includes('n') ? frame.y1 : handle.includes('s') ? frame.y2 : frame.center.y;
    return { x, y };
  }
  function transformHandles(frame) {
    const textOnly = !state.selected.atoms.size && !state.selected.bonds.size && state.selected.decorations.size === 1 && state.decorations.find((item) => state.selected.decorations.has(item.id))?.type === 'text';
    return (textOnly ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']).map((handle) => ({ handle, point: frameHandlePoint(frame, handle) }));
  }
  function hitTransformHandle(point) {
    const frame = transformFrame();
    if (!frame) return null;
    const hitRadius = 8 / state.viewport.zoom;
    const rotatePoint = { x: frame.center.x, y: frame.y1 - 22 / state.viewport.zoom };
    if (distance(point, rotatePoint) <= hitRadius) return { mode: 'rotate', frame, point: rotatePoint };
    const control = transformHandles(frame).find((item) => distance(point, item.point) <= hitRadius);
    return control ? { mode: 'scale', handle: control.handle, frame, point: control.point } : null;
  }
  function rotatePointAround(point, center, radians) {
    const dx = point.x - center.x; const dy = point.y - center.y;
    return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
  }
  function mapSelectedObjects(interaction, mapper) {
    state.atoms = clone(interaction.atoms);
    state.bonds = clone(interaction.bonds);
    state.decorations = clone(interaction.decorations);
    const atomIds = new Set(interaction.atomIds);
    const decorationIds = new Set(interaction.decorationIds);
    state.atoms.forEach((atom) => { if (atomIds.has(atom.id)) Object.assign(atom, mapper({ x: atom.x, y: atom.y })); });
    state.decorations.forEach((decoration) => {
      if (!decorationIds.has(decoration.id)) return;
      if (decoration.type === 'arrow' && Array.isArray(decoration.points)) {
        decoration.points=decoration.points.map((point)=>mapper(point));
      } else if (decoration.type === 'arrow' || decoration.type === 'bracket') {
        const first = mapper({ x: decoration.x1, y: decoration.y1 });
        const second = mapper({ x: decoration.x2, y: decoration.y2 });
        decoration.x1 = first.x; decoration.y1 = first.y;
        decoration.x2 = second.x; decoration.y2 = second.y;
      } else Object.assign(decoration, mapper({ x: decoration.x, y: decoration.y }));
    });
  }
  function scaleSelection(interaction, point) {
    const opposite = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };
    const anchor = frameHandlePoint(interaction.frame, opposite[interaction.handle]);
    const start = frameHandlePoint(interaction.frame, interaction.handle);
    const affectsX = interaction.handle !== 'n' && interaction.handle !== 's';
    const affectsY = interaction.handle !== 'e' && interaction.handle !== 'w';
    const rawX = affectsX ? (point.x - anchor.x) / (start.x - anchor.x) : 1;
    const rawY = affectsY ? (point.y - anchor.y) / (start.y - anchor.y) : 1;
    const scaleX = clamp(rawX, .12, 8); const scaleY = clamp(rawY, .12, 8);
    mapSelectedObjects(interaction, (item) => ({ x: anchor.x + (item.x - anchor.x) * scaleX, y: anchor.y + (item.y - anchor.y) * scaleY }));
    const decorationIds = new Set(interaction.decorationIds); const sizeScale = Math.sqrt(Math.abs(scaleX * scaleY));
    state.decorations.forEach((decoration) => {
      if (!decorationIds.has(decoration.id) || decoration.type !== 'text') return;
      const original = interaction.decorations.find((item) => item.id === decoration.id);
      if (original) decoration.size = clamp(original.size * sizeScale, 8, 96);
    });
  }
  function rotateSelection(interaction, point) {
    const angle = Math.atan2(point.y - interaction.frame.center.y, point.x - interaction.frame.center.x) - interaction.startAngle;
    mapSelectedObjects(interaction, (item) => rotatePointAround(item, interaction.frame.center, angle));
  }
  function chooseDirection(atom) {
    const bonds = bondsFor(atom.id);
    if (!state.assist.labelAvoidance || bonds.length === 0) return { x: 1, y: -0.25 };
    const candidates = [[1,0],[.7,-.7],[0,-1],[-.7,-.7],[-1,0],[-.7,.7],[0,1],[.7,.7]].map(([x,y]) => normalize({x,y}));
    const vectors = bonds.map((bond) => { const other = atomById(bond.a === atom.id ? bond.b : bond.a); return normalize({ x: other.x - atom.x, y: other.y - atom.y }); });
    if (vectors.length === 1) return normalize({ x: -vectors[0].x, y: -vectors[0].y });
    return candidates.reduce((best, candidate) => {
      const score = Math.min(...vectors.map((vector) => 1 - (candidate.x * vector.x + candidate.y * vector.y)));
      return score > best.score ? { direction: candidate, score } : best;
    }, { direction: candidates[0], score: -Infinity }).direction;
  }
  function atomLabelLayout(atom) {
    const value=atomTextValue(atom);if(!value)return {value:'',runs:[],bounds:null};
    const direction=chooseDirection(atom);const lines=value.split(/\r?\n/);const automaticSize=clamp(state.bondLength*.55,12,64);const fontSize=clamp(Number(atom.labelSize)||automaticSize,10,64);const lineHeight=fontSize*1.08;const core=formattedAtom(atom)||atom.element;
    ctx.save();ctx.font=`${fontSize}px ${CHEM_FONT}`;const coreWidth=ctx.measureText(core).width;
    const runs=[];
    const measuredBounds=(line,x,y,align)=>{const metrics=ctx.measureText(line||' ');const width=Math.max(7,metrics.width);const left=align==='right'?x-width:align==='center'?x-width/2:x;const glyphHeight=(metrics.actualBoundingBoxAscent||fontSize*.7)+(metrics.actualBoundingBoxDescent||fontSize*.2);return{x1:left-.9,y1:y-glyphHeight/2-.7,x2:left+width+.9,y2:y+glyphHeight/2+.7};};
    if(lines.length===1){const line=lines[0];const align=direction.x<-.45?'right':direction.x>.45?'left':'center';const x=align==='left'?atom.x-coreWidth/2:align==='right'?atom.x+coreWidth/2:atom.x;runs.push({text:line,x,y:atom.y,align,baseline:'middle',bounds:measuredBounds(line,x,atom.y,align)});}
    else{const coreLine=direction.y<0?lines.length-1:0;lines.forEach((line,index)=>{const y=atom.y+(index-coreLine)*lineHeight;runs.push({text:line,x:atom.x,y,align:'center',baseline:'middle',bounds:measuredBounds(line,atom.x,y,'center')});});}
    ctx.restore();const bounds={x1:Math.min(...runs.map(run=>run.bounds.x1)),y1:Math.min(...runs.map(run=>run.bounds.y1)),x2:Math.max(...runs.map(run=>run.bounds.x2)),y2:Math.max(...runs.map(run=>run.bounds.y2))};return {value,runs,bounds,fontSize,color:atom.labelColor||'#111111'};
  }
  function atomLabelHit(point) {
    for (let index = state.atoms.length - 1; index >= 0; index -= 1) {
      const atom = state.atoms[index]; const layout = atomLabelLayout(atom);
      const b=layout.bounds;if(b&&point.x>=b.x1&&point.x<=b.x2&&point.y>=b.y1&&point.y<=b.y2)return {atom,part:'atom'};
    }
    return null;
  }

  function drawGrid() {
    const { width, height } = state.canvas;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    const spacing = 18 * state.viewport.zoom;
    if (state.grid && spacing >= 6) { ctx.strokeStyle = '#eeeeee'; ctx.lineWidth = 1; ctx.beginPath();for (let x = mod(state.viewport.x, spacing); x <= width; x += spacing) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, height); }for (let y = mod(state.viewport.y, spacing); y <= height; y += spacing) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(width, Math.round(y) + .5); }ctx.stroke(); }
    const ox=state.viewport.x,oy=state.viewport.y;if(ox>=-10&&ox<=width+10&&oy>=-10&&oy<=height+10){ctx.save();ctx.strokeStyle='#a9a9a9';ctx.fillStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ox-7,oy);ctx.lineTo(ox+7,oy);ctx.moveTo(ox,oy-7);ctx.lineTo(ox,oy+7);ctx.stroke();ctx.beginPath();ctx.arc(ox,oy,2.4,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
  }
  function drawLine(a, b, width = 1.55, color = '#111111') { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function perpendicular(a, b, amount) { const v = normalize({ x: b.x - a.x, y: b.y - a.y }); return { x: -v.y * amount, y: v.x * amount }; }
  function bondScale(a, b) { return Math.max(.12, distance(a, b) / Math.max(state.bondLength, 1)); }
  function wedgeWidth(a, b) { return Math.max(.35, distance(a, b) * .13); }
  function drawHashedWedge(a, b, color) {
    const baseHalfWidth = wedgeWidth(a, b); const scale = bondScale(a, b);
    const normal = perpendicular(a, b, 1);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(.55, .85 * scale);
    for (let index = 1; index <= 7; index += 1) {
      const t = index / 8.5;
      const midpoint = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const half = baseHalfWidth * t;
      ctx.beginPath(); ctx.moveTo(midpoint.x + normal.x * half, midpoint.y + normal.y * half); ctx.lineTo(midpoint.x - normal.x * half, midpoint.y - normal.y * half); ctx.stroke();
    }
  }
  function ringPathWithoutBond(bond) {
    const queue = [bond.a]; const parents = new Map([[bond.a, null]]);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (current === bond.b) break;
      state.bonds.forEach((candidate) => {
        if (candidate.id === bond.id) return;
        const next = candidate.a === current ? candidate.b : candidate.b === current ? candidate.a : null;
        if (next && !parents.has(next)) { parents.set(next, current); queue.push(next); }
      });
    }
    if (!parents.has(bond.b)) return null;
    const path = [];
    for (let id = bond.b; id !== null; id = parents.get(id)) path.unshift(id);
    return path.length >= 3 ? path : null;
  }
  function insetOffsetSegment(a, b, offset, inset) {
    const u = normalize({ x: b.x - a.x, y: b.y - a.y });
    return { a: { x: a.x + u.x * inset + offset.x, y: a.y + u.y * inset + offset.y }, b: { x: b.x - u.x * inset + offset.x, y: b.y - u.y * inset + offset.y } };
  }
  function inwardDoubleSegments(a,b,center){const scale=bondScale(a,b);const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};let offset=perpendicular(a,b,4.25*scale);if(offset.x*(center.x-midpoint.x)+offset.y*(center.y-midpoint.y)<0)offset={x:-offset.x,y:-offset.y};const secondary=insetOffsetSegment(a,b,offset,Math.min(3.2*scale,distance(a,b)*.18));return[{a,b,width:1.55},{...secondary,width:1.4}];}
  function adjacentBonds(atom,bond){return atom?.id?bondsFor(atom.id).filter((candidate)=>candidate.id!==bond?.id):[];}
  function otherAtomFor(bond,atom){return atomById(bond.a===atom.id?bond.b:bond.a);}
  function preferredDoubleSide(bond,a,b,normal){
    const connected=[...adjacentBonds(a,bond).map((candidate)=>[a,candidate]),...adjacentBonds(b,bond).map((candidate)=>[b,candidate])];
    if(!connected.length)return 1;
    const penalty=(side)=>connected.reduce((total,[atom,candidate])=>{const other=otherAtomFor(candidate,atom);if(!other)return total;const vector=normalize({x:other.x-atom.x,y:other.y-atom.y});return total+Math.max(0,(vector.x*normal.x+vector.y*normal.y)*side);},0);
    return penalty(1)<=penalty(-1)?1:-1;
  }
  const DOUBLE_LAYOUTS = ['center', 'left', 'right'];
  function resolvedDoubleLayout(bond, a, b) {
    if (DOUBLE_LAYOUTS.includes(bond.doubleLayout)) return bond.doubleLayout;
    const normal = perpendicular(a, b, 1);
    const path = bond.id ? ringPathWithoutBond(bond) : null;
    if (path) {
      const atoms = path.map(atomById).filter(Boolean);
      const center = atoms.reduce((sum, atom) => ({ x: sum.x + atom.x / atoms.length, y: sum.y + atom.y / atoms.length }), { x: 0, y: 0 });
      return normal.x * (center.x - (a.x + b.x) / 2) + normal.y * (center.y - (a.y + b.y) / 2) >= 0 ? 'left' : 'right';
    }
    if (!adjacentBonds(a, bond).length && !adjacentBonds(b, bond).length) return 'center';
    return preferredDoubleSide(bond, a, b, normal) > 0 ? 'left' : 'right';
  }
  function centeredDoubleSegments(a, b, scale) {
    const offset = perpendicular(a, b, 2.15 * scale);
    return [1, -1].map((side) => ({
      a: { x: a.x + offset.x * side, y: a.y + offset.y * side },
      b: { x: b.x + offset.x * side, y: b.y + offset.y * side }, width: 1.45
    }));
  }
  function bondVisualSegments(bond,a,b,preview=false){
    if(!a||!b)return[];if(bond.style!=='normal'||bond.order===1)return[{a,b,width:1.55}];const scale=bondScale(a,b);const normal=perpendicular(a,b,1);
    if(bond.order===3){const gap=3.35*scale;return[{a,b,width:1.35},{a:{x:a.x+normal.x*gap,y:a.y+normal.y*gap},b:{x:b.x+normal.x*gap,y:b.y+normal.y*gap},width:1.3},{a:{x:a.x-normal.x*gap,y:a.y-normal.y*gap},b:{x:b.x-normal.x*gap,y:b.y-normal.y*gap},width:1.3}];}
    if(bond.order!==2)return[{a,b,width:1.55}];
    // Explicit layout is a drawing preference; atom endpoints and bond order never change.
    if (DOUBLE_LAYOUTS.includes(bond.doubleLayout)) {
      if (bond.doubleLayout === 'center') return centeredDoubleSegments(a, b, scale);
      const side = bond.doubleLayout === 'left' ? 1 : -1;
      const offset = { x: normal.x * 4.25 * scale * side, y: normal.y * 4.25 * scale * side };
      return [{ a, b, width: 1.55 }, { ...insetOffsetSegment(a, b, offset, Math.min(4 * scale, distance(a, b) * .22)), width: 1.4 }];
    }
    const ringPath=!preview&&bond.id?ringPathWithoutBond(bond):null;
    if(ringPath){const ringAtoms=ringPath.map(atomById).filter(Boolean);const center=ringAtoms.reduce((sum,atom)=>({x:sum.x+atom.x,y:sum.y+atom.y}),{x:0,y:0});center.x/=ringAtoms.length;center.y/=ringAtoms.length;return inwardDoubleSegments(a,b,center);}
    const atA=preview?[]:adjacentBonds(a,bond),atB=preview?[]:adjacentBonds(b,bond);
    if(!atA.length&&!atB.length)return centeredDoubleSegments(a,b,scale);
    const side=preferredDoubleSide(bond,a,b,normal);const offset={x:normal.x*4.25*scale*side,y:normal.y*4.25*scale*side};const unit=normalize({x:b.x-a.x,y:b.y-a.y});const insetA=atA.length?Math.min(4*scale,distance(a,b)*.22):0;const insetB=atB.length?Math.min(4*scale,distance(a,b)*.22):0;const secondary={a:{x:a.x+unit.x*insetA+offset.x,y:a.y+unit.y*insetA+offset.y},b:{x:b.x-unit.x*insetB+offset.x,y:b.y-unit.y*insetB+offset.y}};
    return[{a,b,width:1.55},{...secondary,width:1.4}];
  }
  function drawBond(bond) {
    const [a, b] = bondAtoms(bond); if (!a || !b) return;
    const selected = state.selected.bonds.has(bond.id); const color = selected ? '#de2934' : '#111111';
    if (bond.style === 'wedge' || bond.style === 'hollow') { const p = perpendicular(a, b, wedgeWidth(a, b)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + p.x, b.y + p.y); ctx.lineTo(b.x - p.x, b.y - p.y); ctx.closePath(); if(bond.style==='hollow'){ctx.strokeStyle=color;ctx.lineWidth=Math.max(.8,1.35*bondScale(a,b));ctx.stroke();}else{ctx.fillStyle=color;ctx.fill();} return; }
    if (bond.style === 'hash') { drawHashedWedge(a, b, color); return; }
    bondVisualSegments(bond,a,b).forEach((segment)=>drawLine(segment.a,segment.b,selected?Math.max(2,segment.width):segment.width,color));
  }
  function arrowHead(tip, from, color='#111') { const a=Math.atan2(tip.y-from.y,tip.x-from.x), size=7.5; ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-Math.cos(a-.47)*size,tip.y-Math.sin(a-.47)*size);ctx.lineTo(tip.x-Math.cos(a+.47)*size,tip.y-Math.sin(a+.47)*size);ctx.closePath();ctx.fill(); }
  function fishhookHead(tip, from, color='#111') {
    const angle = Math.atan2(tip.y - from.y, tip.x - from.x); const size = 7.5;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.45; ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo(tip.x - Math.cos(angle - .24) * size * .55, tip.y - Math.sin(angle - .24) * size * .55, tip.x - Math.cos(angle - .55) * size, tip.y - Math.sin(angle - .55) * size);
    ctx.stroke(); ctx.restore();
  }
  function arrowPoints(d){if(Array.isArray(d.points)&&d.points.length)return d.points;return Number.isFinite(d.x1)&&Number.isFinite(d.y1)&&Number.isFinite(d.x2)&&Number.isFinite(d.y2)?[{x:d.x1,y:d.y1},{x:d.x2,y:d.y2}]:[];}
  function arrowMidpointAndTangent(d){
    const points=arrowPoints(d);if(points.length<2)return null;
    if((d.pathMode||d.mode)==='curve'&&points.length>=3){const [p0,p1,p2]=points;const t=.5,one=1-t;return{point:{x:one*one*p0.x+2*one*t*p1.x+t*t*p2.x,y:one*one*p0.y+2*one*t*p1.y+t*t*p2.y},tangent:normalize({x:2*one*(p1.x-p0.x)+2*t*(p2.x-p1.x),y:2*one*(p1.y-p0.y)+2*t*(p2.y-p1.y)})};}
    const lengths=[];let total=0;for(let index=1;index<points.length;index+=1){const length=distance(points[index-1],points[index]);lengths.push(length);total+=length;}let remaining=total/2;for(let index=0;index<lengths.length;index+=1){if(remaining<=lengths[index]||index===lengths.length-1){const ratio=lengths[index]?remaining/lengths[index]:0;const a=points[index],b=points[index+1];return{point:{x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio},tangent:normalize({x:b.x-a.x,y:b.y-a.y})};}remaining-=lengths[index];}return null;
  }
  function drawArrow(d, selected = false) {
    const points=arrowPoints(d);if(points.length<2)return;const color=selected?'#de2934':'#111';const mode=d.pathMode||d.mode||'straight';ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.55;if((d.lineStyle||'solid')==='dashed')ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    if(mode==='curve'&&points.length>=3)ctx.quadraticCurveTo(points[1].x,points[1].y,points[2].x,points[2].y);else points.slice(1).forEach((point)=>ctx.lineTo(point.x,point.y));ctx.stroke();ctx.setLineDash([]);
    const tip=points[points.length-1];const from=mode==='curve'&&points.length>=3?points[1]:points[points.length-2];if((d.headStyle||d.head||((d.variant==='fishhook')?'fishhook':'full'))==='fishhook')fishhookHead(tip,from,color);else arrowHead(tip,from,color);
    ctx.restore();
  }
  function drawBracket(d, selected=false) {
    const x1=Math.min(d.x1,d.x2),x2=Math.max(d.x1,d.x2),y1=Math.min(d.y1,d.y2),y2=Math.max(d.y1,d.y2); const color=selected?'#de2934':'#111';
    ctx.save(); ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.45;
    if(d.style==='curly'){
      const height=Math.max(30,y2-y1);const middle=(y1+y2)/2;const shoulder=Math.min(24,height*.18);const hook=Math.min(10,height*.075);
      const brace=(x,side)=>{ctx.beginPath();ctx.moveTo(x+side*hook,y1);ctx.bezierCurveTo(x+side*2,y1,x+side*2,y1+shoulder*.35,x+side*2,y1+shoulder);ctx.bezierCurveTo(x+side*2,middle-shoulder,x+side*1,middle-7,x-side*hook,middle);ctx.bezierCurveTo(x+side*1,middle+7,x+side*2,middle+shoulder,x+side*2,y2-shoulder);ctx.bezierCurveTo(x+side*2,y2-shoulder*.35,x+side*2,y2,x+side*hook,y2);ctx.stroke();};
      brace(x1,1);brace(x2,-1);
    }else{
      ctx.beginPath();if(d.style==='square'){ctx.moveTo(x1+7,y1);ctx.lineTo(x1,y1);ctx.lineTo(x1,y2);ctx.lineTo(x1+7,y2);ctx.moveTo(x2-7,y1);ctx.lineTo(x2,y1);ctx.lineTo(x2,y2);ctx.lineTo(x2-7,y2);}else{ctx.moveTo(x1+7,y1);ctx.quadraticCurveTo(x1,y1,x1,y1+7);ctx.lineTo(x1,y2-7);ctx.quadraticCurveTo(x1,y2,x1+7,y2);ctx.moveTo(x2-7,y1);ctx.quadraticCurveTo(x2,y1,x2,y1+7);ctx.lineTo(x2,y2-7);ctx.quadraticCurveTo(x2,y2,x2-7,y2);}ctx.stroke();
    }
    if(d.label){ctx.font='14px "Times New Roman"';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(d.label,x2+4,y2+3);}ctx.restore();
  }
  function fillRoundedMask(bounds,radius=2){const width=Math.max(1,bounds.x2-bounds.x1),height=Math.max(1,bounds.y2-bounds.y1);ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(bounds.x1,bounds.y1,width,height,Math.min(radius,width/2,height/2));else ctx.rect(bounds.x1,bounds.y1,width,height);ctx.fill();}
  function drawTextBlock(d,selected=false,alpha=1){ctx.save();ctx.globalAlpha*=alpha;ctx.font=`${d.size}px ${TEXT_FONT}`;ctx.textAlign=d.textAlign||'left';ctx.textBaseline=d.textBaseline||'alphabetic';const lines=String(d.value||'').split(/\r?\n/);const lineHeight=d.size*1.18;const startY=ctx.textBaseline==='middle'?d.y-(lines.length-1)*lineHeight/2:d.y;if(ctx.textBaseline==='middle'){const width=Math.max(6,...lines.map((line)=>ctx.measureText(line||' ').width));const height=d.size*.96+(lines.length-1)*lineHeight;ctx.fillStyle='#fff';fillRoundedMask({x1:d.x-width/2-1.2,y1:d.y-height/2-1,x2:d.x+width/2+1.2,y2:d.y+height/2+1},2.2);}ctx.fillStyle=selected?'#de2934':d.color;lines.forEach((line,index)=>ctx.fillText(line,d.x,startY+index*lineHeight));ctx.restore();}
  function drawDecoration(d) { const selected=state.selected.decorations.has(d.id);if(d.type==='arrow')drawArrow(d,selected);if(d.type==='bracket')drawBracket(d,selected);if(d.type==='mark'){ctx.strokeStyle=selected?'#de2934':'#111';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.5;if(d.style==='cross'){ctx.beginPath();ctx.moveTo(d.x-4,d.y-4);ctx.lineTo(d.x+4,d.y+4);ctx.moveTo(d.x+4,d.y-4);ctx.lineTo(d.x-4,d.y+4);ctx.stroke();}else{ctx.beginPath();ctx.arc(d.x,d.y,2.8,0,Math.PI*2);ctx.fill();}}if(d.type==='text')drawTextBlock(d,selected);if(d.type==='charge'){ctx.save();ctx.fillStyle=selected?'#de2934':'#111';ctx.strokeStyle=ctx.fillStyle;ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.textBaseline='middle';if(d.style?.startsWith('circled')){ctx.beginPath();ctx.arc(d.x,d.y,9,0,Math.PI*2);ctx.stroke();}ctx.fillText(d.value==='minus'?'−':'+',d.x,d.y+.5);ctx.restore();}if(d.type==='transition'){ctx.save();ctx.fillStyle=selected?'#de2934':'#111';ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.font='15px "Cambria Math", "Times New Roman", serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText('‡',d.x,d.y);ctx.fillText('‡',d.x,d.y);ctx.restore();} }
  function drawAtomLabels() {
    state.atoms.forEach((atom) => {
      const layout = atomLabelLayout(atom); if (!layout.value) return;ctx.save();ctx.font=`${layout.fontSize}px ${CHEM_FONT}`;
      if(state.assist.labelAvoidance&&layout.bounds){ctx.fillStyle='#fff';fillRoundedMask(layout.bounds,Math.min(2.4,layout.fontSize*.2));}
      ctx.fillStyle=state.selected.atoms.has(atom.id)?'#de2934':layout.color;layout.runs.forEach(run=>{ctx.textAlign=run.align;ctx.textBaseline=run.baseline;ctx.fillText(run.text,run.x,run.y);});
      if (atom.charge) {
        const charge = superscript(atom.charge); const x = (layout.bounds?.x2||atom.x)+5; const y = (layout.bounds?.y1||atom.y)-2;
        ctx.font = '13px "Times New Roman", serif';ctx.textAlign='center';ctx.textBaseline='middle';
        if(atom.chargeStyle?.startsWith('circled')){ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1;ctx.stroke();}
        ctx.fillText(charge,x,y);
      }
      ctx.restore();
    });
  }
  function drawSelectionsAndWarnings() {
    ctx.save(); state.atoms.forEach((atom)=>{if(state.selected.atoms.has(atom.id)){ctx.strokeStyle='#de2934';ctx.lineWidth=1.1;ctx.setLineDash([3,2]);ctx.beginPath();ctx.arc(atom.x,atom.y,8,0,Math.PI*2);ctx.stroke();}if(state.assist.valenceCheck){const limit=ELEMENTS[atom.element]?.valence||8;if(valenceFor(atom)>limit){ctx.strokeStyle='#de2934';ctx.lineWidth=1.35;ctx.setLineDash([3,2]);ctx.strokeRect(atom.x-9,atom.y-9,18,18);}}});ctx.restore();
  }
  function drawTransformControls() {
    const frame = transformFrame(); if (!frame) return;
    const unit = 1 / state.viewport.zoom; const handleSize = 6 * unit;
    ctx.save(); ctx.strokeStyle = '#de2934'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.1 * unit; ctx.setLineDash([3 * unit, 2 * unit]);
    ctx.strokeRect(frame.x1, frame.y1, frame.x2 - frame.x1, frame.y2 - frame.y1);
    ctx.setLineDash([]); const rotate = { x: frame.center.x, y: frame.y1 - 22 * unit };
    ctx.beginPath(); ctx.moveTo(frame.center.x, frame.y1); ctx.lineTo(rotate.x, rotate.y + 6 * unit); ctx.stroke();
    transformHandles(frame).forEach(({ point }) => { ctx.fillRect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize); ctx.strokeRect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize); });
    ctx.beginPath(); ctx.arc(rotate.x, rotate.y, 5 * unit, -.35, Math.PI * 1.52); ctx.stroke();
    const arrow = { x: rotate.x + Math.cos(-.35) * 5 * unit, y: rotate.y + Math.sin(-.35) * 5 * unit };
    ctx.fillStyle = '#de2934'; ctx.beginPath(); ctx.moveTo(arrow.x, arrow.y); ctx.lineTo(arrow.x - 4 * unit, arrow.y - 1 * unit); ctx.lineTo(arrow.x - 1 * unit, arrow.y + 3 * unit); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function chainPoints(start, end) {
    const baseAngle = angleSnapped(start, end);
    const forwardStep = state.bondLength * Math.cos(Math.PI / 6);
    const count = Math.max(1, Math.round(distance(start, end) / forwardStep));
    const points = []; let current = { x: start.x, y: start.y };
    for (let index = 0; index < count; index += 1) {
      const direction = baseAngle + (index % 2 === 0 ? -Math.PI / 6 : Math.PI / 6);
      current = { x: current.x + Math.cos(direction) * state.bondLength, y: current.y + Math.sin(direction) * state.bondLength };
      points.push(current);
    }
    return points;
  }
  function drawTemplatePreview(point){
    const geometry=templateGeometry(state.template,point),map=new Map(geometry.atoms.map((atom)=>[atom.id,atom]));const center=geometry.atoms.reduce((sum,atom)=>({x:sum.x+atom.x/geometry.atoms.length,y:sum.y+atom.y/geometry.atoms.length}),{x:0,y:0});geometry.bonds.forEach((bond)=>{const a=map.get(bond.a),b=map.get(bond.b);if(state.template==='benzene'&&bond.order===2)inwardDoubleSegments(a,b,center).forEach((segment)=>drawLine(segment.a,segment.b,segment.width,'#111'));else drawPreviewBond(a,b,bond.order,bond.style);});ctx.save();const fontSize=clamp(state.bondLength*.55,12,64);ctx.font=`${fontSize}px ${CHEM_FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';geometry.atoms.filter((atom)=>atom.explicit).forEach((atom)=>{const metrics=ctx.measureText(atom.element),height=(metrics.actualBoundingBoxAscent||fontSize*.7)+(metrics.actualBoundingBoxDescent||fontSize*.2);ctx.fillStyle='#fff';fillRoundedMask({x1:atom.x-metrics.width/2-1,y1:atom.y-height/2-.8,x2:atom.x+metrics.width/2+1,y2:atom.y+height/2+.8},2);ctx.fillStyle='#111';ctx.fillText(atom.element,atom.x,atom.y);});ctx.restore();
  }
  function drawPlacementPreview(){
    if(!state.pointerInside||state.interaction)return;const point=state.cursor;if(state.tool==='template')drawTemplatePreview(point);
    if(state.tool==='mark'){const snap=snapAnnotationPoint(point,true);if(snap.snapped){ctx.save();ctx.globalAlpha*=.35;drawDecoration({id:'preview-raw',type:'mark',x:point.x,y:point.y,style:state.mark});ctx.restore();}drawDecoration({id:'preview',type:'mark',x:snap.point.x,y:snap.point.y,style:state.mark});}
    if(state.tool==='charge'){const atom=state.assist.snapAtoms?closestAtom(point,connectionRadius()):null,snap=snapAnnotationPoint(point,true),previewPoint=atom?{x:atom.x+9/state.viewport.zoom,y:atom.y-9/state.viewport.zoom}:snap.point;if(atom||snap.snapped){ctx.save();ctx.globalAlpha*=.35;const raw={id:'preview-raw',type:state.chargeStyle==='transition'?'transition':'charge',x:point.x,y:point.y,value:state.chargeStyle.includes('minus')?'minus':'plus',style:state.chargeStyle.startsWith('circled')?state.chargeStyle:'plain'};drawDecoration(raw);ctx.restore();}const preview={id:'preview',type:state.chargeStyle==='transition'?'transition':'charge',x:previewPoint.x,y:previewPoint.y,value:state.chargeStyle.includes('minus')?'minus':'plus',style:state.chargeStyle.startsWith('circled')?state.chargeStyle:'plain'};drawDecoration(preview);if(atom){ctx.save();ctx.strokeStyle='#de2934';ctx.lineWidth=1/state.viewport.zoom;ctx.setLineDash([3/state.viewport.zoom,2/state.viewport.zoom]);ctx.beginPath();ctx.arc(atom.x,atom.y,8/state.viewport.zoom,0,Math.PI*2);ctx.stroke();ctx.restore();}}
  }
  function drawMoveSnapGhost(interaction){
    const snap=interaction.endpointSnap;if(!snap)return;const atomIds=new Set(interaction.atomIds||[]);ctx.save();ctx.translate(snap.dx,snap.dy);ctx.globalAlpha*=.42;state.bonds.forEach((bond)=>{if(atomIds.has(bond.a)&&atomIds.has(bond.b)){const [a,b]=bondAtoms(bond);drawPreviewBond(a,b,bond.order,bond.style,bond);}});state.decorations.filter((decoration)=>(interaction.decorationIds||[]).includes(decoration.id)).forEach(drawDecoration);ctx.font=`${clamp(state.bondLength*.55,12,64)}px ${CHEM_FONT}`;ctx.fillStyle='#111';ctx.textAlign='center';ctx.textBaseline='middle';state.atoms.filter((atom)=>atomIds.has(atom.id)&&atomTextValue(atom)).forEach((atom)=>ctx.fillText(atomTextValue(atom),atom.x,atom.y));ctx.restore();const target=atomById(snap.targetId);if(target){ctx.save();ctx.strokeStyle='#de2934';ctx.lineWidth=1.2/state.viewport.zoom;ctx.setLineDash([3/state.viewport.zoom,2/state.viewport.zoom]);ctx.beginPath();ctx.arc(target.x,target.y,9/state.viewport.zoom,0,Math.PI*2);ctx.stroke();ctx.restore();}
  }
  function drawAlignmentGuides(interaction){
    if(!interaction.guides?.length)return;ctx.save();ctx.strokeStyle='#4b8fdf';ctx.lineWidth=1/state.viewport.zoom;ctx.setLineDash([5/state.viewport.zoom,4/state.viewport.zoom]);interaction.guides.forEach((guide)=>{ctx.beginPath();if(guide.axis==='vertical'){ctx.moveTo(guide.value,guide.from);ctx.lineTo(guide.value,guide.to);}else{ctx.moveTo(guide.from,guide.value);ctx.lineTo(guide.to,guide.value);}ctx.stroke();});ctx.restore();
  }
  function drawPreview() {
    const i=state.interaction,draft=state.arrowDraft,placement=state.pointerInside&&!i&&['template','mark','charge'].includes(state.tool);if(!i&&!draft&&!placement)return;ctx.save();ctx.globalAlpha=.48;
    if(i?.kind==='bond'){const a=i.sourceAtom||i.start,end=i.end||i.start;if(i.previewTargetId&&i.rawEnd){const raw=pointAt(i.start,i.rawEnd);ctx.save();ctx.globalAlpha*=.42;drawPreviewBond(a,raw,i.previewOrder||state.bondOrder,i.previewStyle||state.bondStyle);ctx.restore();}drawPreviewBond(a,end,i.previewOrder||state.bondOrder,i.previewStyle||state.bondStyle);if(i.previewTargetId){ctx.globalAlpha=.9;ctx.strokeStyle='#de2934';ctx.lineWidth=1.3/state.viewport.zoom;ctx.setLineDash([3/state.viewport.zoom,2/state.viewport.zoom]);ctx.beginPath();ctx.arc(end.x,end.y,8/state.viewport.zoom,0,Math.PI*2);ctx.stroke();}}
    if(i?.kind==='chain'){let p=i.start;chainPoints(i.start,i.end).forEach((q)=>{drawPreviewBond(p,q,1,'normal');p=q;});}
    if(i?.kind==='arrow-straight')drawArrow({type:'arrow',points:[i.start,i.end],pathMode:'straight',lineStyle:state.arrow.line,headStyle:state.arrow.head},false);
    if(draft){const points=[...draft.points];if(draft.hover&&(!points.length||distance(points[points.length-1],draft.hover)>.1))points.push(draft.hover);if(draft.mode==='curve'&&points.length===2){ctx.setLineDash([3,3]);drawLine(points[0],points[1],1.2,'#555');ctx.setLineDash([]);}else if(points.length>=2)drawArrow({type:'arrow',points,pathMode:draft.mode,lineStyle:state.arrow.line,headStyle:state.arrow.head},false);}
    if(i?.kind==='bracket'){drawBracket({type:'bracket',x1:i.start.x,y1:i.start.y,x2:i.end.x,y2:i.end.y,style:state.bracket},false);ctx.save();ctx.globalAlpha=1;ctx.fillStyle='#de2934';[i.start,i.end].forEach((point)=>ctx.fillRect(point.x-2/state.viewport.zoom,point.y-2/state.viewport.zoom,4/state.viewport.zoom,4/state.viewport.zoom));ctx.restore();}
    if(i?.kind==='text-placement'){if(i.snapped&&i.rawEnd)drawTextBlock({x:i.rawEnd.x,y:i.rawEnd.y,value:state.text.value,size:state.text.size,color:state.text.color,textAlign:'left',textBaseline:'alphabetic'},false,.28);drawTextBlock({x:i.end.x,y:i.end.y,value:state.text.value,size:state.text.size,color:i.snapped?'#de2934':state.text.color,textAlign:i.snapAnchor?.textAlign||'left',textBaseline:i.snapAnchor?.textBaseline||'alphabetic'},false,i.snapped?.82:.38);if(i.snapped){ctx.globalAlpha=.9;ctx.strokeStyle='#de2934';ctx.lineWidth=1/state.viewport.zoom;ctx.setLineDash([3/state.viewport.zoom,2/state.viewport.zoom]);ctx.beginPath();ctx.arc(i.end.x,i.end.y,7/state.viewport.zoom,0,Math.PI*2);ctx.stroke();}}
    if(i?.kind==='move'&&i.textSnap){const decoration=state.decorations.find(item=>item.id===i.textSnap.decorationId);if(decoration){drawTextBlock({...decoration,x:i.textSnap.point.x,y:i.textSnap.point.y,color:'#de2934',textAlign:i.textSnap.anchor?.textAlign||'left',textBaseline:i.textSnap.anchor?.textBaseline||'alphabetic'},false,.72);ctx.globalAlpha=.9;ctx.strokeStyle='#de2934';ctx.lineWidth=1;ctx.setLineDash([3,2]);ctx.beginPath();ctx.arc(i.textSnap.point.x,i.textSnap.point.y,7/state.viewport.zoom,0,Math.PI*2);ctx.stroke();}}
    if(i?.kind==='move'){drawMoveSnapGhost(i);drawAlignmentGuides(i);}
    if(placement)drawPlacementPreview();
    if(i?.kind==='lasso'){const x=Math.min(i.start.x,i.end.x),y=Math.min(i.start.y,i.end.y),w=Math.abs(i.end.x-i.start.x),h=Math.abs(i.end.y-i.start.y);ctx.fillStyle='rgba(222,41,52,.07)';ctx.strokeStyle='#de2934';ctx.lineWidth=1;ctx.setLineDash([3,2]);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}ctx.restore();
  }
  function drawPreviewBond(a,b,order,style,bond=null){const color='#111';if(style==='wedge'||style==='hollow'){const p=perpendicular(a,b,wedgeWidth(a,b));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x+p.x,b.y+p.y);ctx.lineTo(b.x-p.x,b.y-p.y);ctx.closePath();if(style==='hollow'){ctx.strokeStyle=color;ctx.lineWidth=Math.max(.8,1.35*bondScale(a,b));ctx.stroke();}else{ctx.fillStyle=color;ctx.fill();}return;}if(style==='hash'){drawHashedWedge(a,b,color);return;}bondVisualSegments(bond||{order,style},a,b,!bond).forEach((segment)=>drawLine(segment.a,segment.b,segment.width,color));}
  function render() {
    const {dpr,width,height}=state.canvas;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);drawGrid();inWorldContext();state.bonds.forEach(drawBond);state.decorations.forEach(drawDecoration);drawPreview();drawSelectionsAndWarnings();drawAtomLabels();drawTransformControls();ctx.restore();updateChrome();
  }

  function setTool(tool, button = null) {
    if(tool!=='arrow')state.arrowDraft=null;state.tool=tool;state.interaction=null;document.querySelectorAll('.tool').forEach((node)=>node.classList.toggle('active',node===button));document.querySelectorAll('.element-tool[data-element]').forEach((node)=>node.classList.toggle('active-element',tool==='element'&&node.dataset.element===state.element));hintNode.textContent=TOOL_HINTS[tool];
    if(tool==='text'){state.editingTextId=null;state.editingAtomId=null;state.text.value=TEXT_PLACEHOLDER;textPopover.hidden=true;}render();
  }
  function setElement(element){state.element=element;setTool('element');document.querySelectorAll('.element-tool[data-element]').forEach((node)=>node.classList.toggle('active-element',node.dataset.element===element));showToast(`已选择元素：${element}`);}
  function closePopups(except=null){[arrowPopover,templatePopover,chargePopover,bracketPopover,markPopover,textPopover].forEach((panel)=>{if(panel!==except)panel.hidden=true;});}
  function openPopup(panel){closePopups(panel);panel.hidden=false;}
  function showTutorialPage(target){const nextIndex=typeof target==='number'?clamp(target,0,tutorialPages.length-1):Math.max(0,tutorialPages.findIndex((page)=>page.dataset.tutorialPage===target));tutorialPageIndex=nextIndex;tutorialPages.forEach((page,index)=>{page.hidden=index!==nextIndex;page.classList.toggle('active',index===nextIndex);});tutorialNavButtons.forEach((button,index)=>button.classList.toggle('active',index===nextIndex));document.getElementById('tutorial-progress').textContent=`${nextIndex+1} / ${tutorialPages.length}`;document.getElementById('tutorial-prev').disabled=nextIndex===0;const nextButton=document.getElementById('tutorial-next');nextButton.textContent=nextIndex===tutorialPages.length-1?'完成':'下一步';nextButton.classList.toggle('primary',true);document.getElementById('tutorial-pages').scrollTop=0;}
  function openTutorial(){hideContext();closePopups();periodicPanel.hidden=true;assistPanel.hidden=true;document.getElementById('assist-toggle').classList.remove('open');tutorialOverlay.hidden=false;document.getElementById('tutorial-toggle').classList.add('open');showTutorialPage(tutorialPageIndex);}
  function closeTutorial(){tutorialOverlay.hidden=true;document.getElementById('tutorial-toggle').classList.remove('open');}
  function stepTutorial(delta){if(delta>0&&tutorialPageIndex===tutorialPages.length-1){closeTutorial();return;}showTutorialPage(tutorialPageIndex+delta);}
  function currentTextDecoration(){return state.editingTextId?state.decorations.find((item)=>item.id===state.editingTextId):null;}
  function positionTextEditor(target) {
    if (!target) { textPopover.style.left='106px'; textPopover.style.top='57px'; return; }
    const world = target.type === 'text' ? {x:target.x,y:target.y} : {x:target.x,y:target.y}; const screen=toScreen(world);
    const width=textPopover.offsetWidth||388,height=textPopover.offsetHeight||430;
    const right=screen.x+88,left=right+width<=state.canvas.width-8?right:screen.x-width-88;
    textPopover.style.left=`${clamp(left,6,Math.max(6,state.canvas.width-width-8))}px`;
    textPopover.style.top=`${clamp(screen.y+14,31,Math.max(31,state.canvas.height-height-8))}px`;
  }
  function openTextEditor(target=null){
    const input=document.getElementById('text-input');const title=document.getElementById('text-editor-title');
    state.editingTextId=null;state.editingAtomId=null;
    if(target?.type==='text'){state.editingTextId=target.id;state.text={value:target.value,size:target.size,color:target.color};title.textContent=target.draft?'新建文字':'编辑画布文字';clearSelection();state.selected.decorations.add(target.id);}
    else if(target?.id&&target.element){state.editingAtomId=target.id;state.text={value:atomTextValue(target),size:target.labelSize||clamp(state.bondLength*.55,12,64),color:target.labelColor||'#111111'};title.textContent='编辑化学文本';}
    else title.textContent='新建文字';
    input.value=state.text.value;document.getElementById('font-size').value=state.text.size;document.getElementById('font-color').value=state.text.color;openPopup(textPopover);positionTextEditor(target);render();requestAnimationFrame(()=>{input.focus();input.select();});
  }
  function updateEditedText(){
    const input=document.getElementById('text-input');state.text.value=input.value;const text=currentTextDecoration();
    if(text){text.value=state.text.value;text.size=state.text.size;text.color=state.text.color;if(text.value!==TEXT_PLACEHOLDER)delete text.draft;pushHistory();render();return;}
    if(state.editingAtomId){const atom=atomById(state.editingAtomId);if(!atom)return;const value=state.text.value;atom.labelOverride=value;atom.labelSize=state.text.size;atom.labelColor=state.text.color;atom.explicit=true;delete atom.hydrogenLabel;const matches=value.match(/Cl|Br|Si|Li|Na|Mg|Ca|Al|[HBCNOFPSIK]/g)||[];const next=matches.find(symbol=>symbol!=='H')||matches[0];if(next&&ELEMENTS[next])atom.element=next;pushHistory();render();}
  }
  function applyTextFormat(kind){const input=document.getElementById('text-input');const start=input.selectionStart??0,end=input.selectionEnd??start;if(start===end)return showToast('请先选择要转换的文字');const convert=(value,table)=>[...value].map((character)=>table[character]||character).join('');const sub={0:'₀',1:'₁',2:'₂',3:'₃',4:'₄',5:'₅',6:'₆',7:'₇',8:'₈',9:'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎'};const sup={0:'⁰',1:'¹',2:'²',3:'³',4:'⁴',5:'⁵',6:'⁶',7:'⁷',8:'⁸',9:'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾'};input.setRangeText(convert(input.value.slice(start,end),kind==='subscript'?sub:sup),start,end,'select');updateEditedText();}
  function insertTextSymbol(symbol){const input=document.getElementById('text-input');const start=input.selectionStart??input.value.length;const end=input.selectionEnd??start;input.setRangeText(symbol,start,end,'end');updateEditedText();input.focus();}
  function finishTextEditing(){const text=currentTextDecoration();if(text&&(!text.value.trim()||text.value===TEXT_PLACEHOLDER)){state.decorations=state.decorations.filter((item)=>item.id!==text.id);state.selected.decorations.delete(text.id);pushHistory();}else if(text)delete text.draft;textPopover.hidden=true;state.editingTextId=null;state.editingAtomId=null;if(!state.assist.batchText)setTool('select',document.querySelector('.tool[data-tool="select"]'));else{state.text.value=TEXT_PLACEHOLDER;render();}}
  function showToast(message){toastNode.textContent=message;toastNode.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toastNode.classList.remove('show'),1800);}
  function updateChrome(){document.getElementById('undo').disabled=state.historyIndex<=0;document.getElementById('redo').disabled=state.historyIndex>=state.history.length-1;document.getElementById('bond-length').value=state.bondLength;document.getElementById('font-size').value=state.text.size;document.getElementById('grid-toggle').classList.toggle('active',state.grid);syncActiveDocument();renderDocumentTabs();document.getElementById('status-tool').textContent=`工具：${({select:'选择',pan:'平移',bond:`${state.bondOrder}键`,chain:'碳链',template:'模板',arrow:'箭头',charge:'电荷',bracket:'括号',mark:'点位',text:'文字',element:`元素 ${state.element}`})[state.tool]||state.tool}`;const assists=[];if(state.assist.fixedLength)assists.push('键长');if(state.assist.snapAtoms)assists.push('端点吸附');if(state.assist.textSnap)assists.push('文本吸附');if(state.assist.smartGuides)assists.push('对齐线');if(state.assist.implicitHydrogens)assists.push('补氢');document.getElementById('status-assist').textContent=assists.length?`辅助：${assists.join(' / ')} 已开启`:'辅助：均已关闭';document.getElementById('status-zoom').textContent=`${Math.round(state.viewport.zoom*100)}%`;document.getElementById('status-coord').textContent=`坐标：${round(state.cursor.x)}, ${round(state.cursor.y)}`;canvas.style.cursor=['pan','right-pan'].includes(state.interaction?.kind)?'grabbing':state.tool==='select'?'default':state.tool==='pan'?'grab':blackCrosshairCursor;}
  function syncAssistControls(){document.querySelectorAll('[data-assist]').forEach((input)=>{input.checked=Boolean(state.assist[input.dataset.assist]);});}

  function angleSnapped(start,end){let angle=Math.atan2(end.y-start.y,end.x-start.x);if(state.assist.snapAngles)angle=Math.round(angle/(Math.PI/12))*(Math.PI/12);return angle;}
  function directionSnappedPoint(start,end){const length=Math.max(1,distance(start,end));const angle=angleSnapped(start,end);return {x:round(start.x+Math.cos(angle)*length),y:round(start.y+Math.sin(angle)*length)};}
  function pointAt(start,end){const angle=angleSnapped(start,end);const len=state.assist.fixedLength?state.bondLength:Math.max(3,distance(start,end));return {x:round(start.x+Math.cos(angle)*len),y:round(start.y+Math.sin(angle)*len)};}
  function connectionRadius(extra=0){return (clamp(state.bondLength*1.1,26,44)+extra)/state.viewport.zoom;}
  function changeBondLength(nextLength){const next=clamp(Number(nextLength)||24,24,120);const previous=Math.max(1,state.bondLength);if(next===previous)return;const ratio=next/previous;state.atoms.forEach((atom)=>{if(Number.isFinite(Number(atom.labelSize)))atom.labelSize=round(clamp(Number(atom.labelSize)*ratio,10,64));});state.decorations.forEach((decoration)=>{if(decoration.type==='text')decoration.size=round(clamp(Number(decoration.size||14)*ratio,10,96));});state.text.size=round(clamp(Number(state.text.size||14)*ratio,10,64));state.bondLength=next;document.getElementById('font-size').value=state.text.size;pushHistory();render();}
  function applyExistingBondClick(bond) {
    if (state.bondStyle === 'normal' && state.bondOrder === 2 && bond.style === 'normal' && bond.order === 2) {
      const [a, b] = bondAtoms(bond);
      const current = resolvedDoubleLayout(bond, a, b);
      bond.doubleLayout = DOUBLE_LAYOUTS[(DOUBLE_LAYOUTS.indexOf(current) + 1) % DOUBLE_LAYOUTS.length];
      pushHistory(); render();
      showToast(`双键形态：${({ center: '居中等长', left: '一侧短线', right: '另一侧短线' })[bond.doubleLayout]}`);
      return;
    }
    if (state.bondStyle !== 'normal') { bond.style = state.bondStyle; bond.order = 1; }
    else if (state.bondOrder === 2) { bond.style = 'normal'; bond.order = 2; }
    else { bond.style = 'normal'; bond.order = (bond.order + state.bondOrder - 1) % 3 + 1; }
    if (bond.style !== 'normal' || bond.order !== 2) delete bond.doubleLayout;
    pushHistory(); render(); showToast(`已切换为${bond.order === 1 ? '单' : bond.order === 2 ? '双' : '三'}键`);
  }
  function beginBondInteraction(world) {
    const hitBond = closestBond(world);
    let hitBody = false;
    if (hitBond) {
      const [a, b] = bondAtoms(hitBond), dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? ((world.x - a.x) * dx + (world.y - a.y) * dy) / lengthSquared : 0;
      hitBody = t > .22 && t < .78;
    }
    // A generous connection radius must not swallow a click on a short bond's body.
    const source = !hitBody && state.assist.snapAtoms ? closestAtom(world, connectionRadius()) : null;
    return { kind: 'bond', start: source ? { x: source.x, y: source.y } : world, sourceAtom: source,
      hitBond, end: world, previewOrder: state.bondOrder, previewStyle: state.bondStyle };
  }
  function resolveBondEndpoint(interaction, rawEnd) {
    const source = interaction.sourceAtom;
    const target = state.assist.snapAtoms ? closestAtom(rawEnd, connectionRadius(), source?.id) : null;
    return { target, end: target ? { x: target.x, y: target.y } : pointAt(interaction.start, rawEnd) };
  }
  function commitBond(interaction){const rawEnd=interaction.rawEnd||interaction.end;const delta=distance(interaction.start,rawEnd);if(delta<4&&interaction.hitBond&&!interaction.sourceAtom){applyExistingBondClick(interaction.hitBond);return;}if(delta<4)return;let source=interaction.sourceAtom;const resolved=resolveBondEndpoint(interaction,rawEnd);let target=resolved.target;const end=resolved.end;if(!source)source=createAtom(interaction.start,'C',false);if(!target)target=createAtom(end,'C',false);const bond=newBond(source,target,state.bondOrder,state.bondStyle);if(bond)pushHistory();render();}
  function commitChain(interaction){let first=interaction.sourceAtom||createAtom(interaction.start,'C',false);const points=chainPoints({x:first.x,y:first.y},interaction.end);points.forEach((point,index)=>{const atom=(index===points.length-1&&state.assist.snapAtoms?closestAtom(interaction.end,connectionRadius(),first.id):null)||createAtom(point,'C',false);newBond(first,atom,1,'normal');first=atom;});pushHistory();render();}
  function placeElement(point){const atom=state.assist.snapAtoms?closestAtom(point,connectionRadius(1)):null;if(atom){atom.element=state.element;atom.explicit=true;atom.charge=atom.charge||0;delete atom.labelOverride;delete atom.hydrogenLabel;pushHistory();render();showToast(`${state.element} 已附着到原子端点`);return;}const newAtom=createAtom(point,state.element,true);pushHistory();render();showToast(`已放置元素：${newAtom.element}`);}
  function templateGeometry(template, point) {
    const L=state.bondLength,atoms=[],bonds=[];const add=(x,y,element='C',explicit=false)=>{const atom={id:`g${atoms.length}`,x,y,element,explicit,charge:0,chargeStyle:'plain'};atoms.push(atom);return atom;};const connect=(first,second,order=1)=>bonds.push({id:`gb${bonds.length}`,a:first.id,b:second.id,order,style:'normal'});const regularRing={cyclopropane:3,cyclobutane:4,pentagon:5,hexagon:6,cycloheptane:7,cyclooctane:8,benzene:6};
    if(regularRing[template]){const sides=regularRing[template];const radius=L/(2*Math.sin(Math.PI/sides));for(let n=0;n<sides;n+=1){const angle=-Math.PI/2+n*(Math.PI*2/sides);add(Math.cos(angle)*radius,Math.sin(angle)*radius);}for(let n=0;n<sides;n+=1)connect(atoms[n],atoms[(n+1)%sides],template==='benzene'&&n%2===0?2:1);}
    else if(template==='chair-left'||template==='chair-right'){
      const mirror=template==='chair-right'?-1:1;const source=[[170.5,-56.5],[193.7,-50.3],[216.9,-56.5],[158.5,-35.7],[181.7,-41.9],[204.9,-35.7]];const center={x:187.7,y:-46.27};source.forEach(([x,y])=>add((x-center.x)/24*L*mirror,(y-center.y)/24*L));[[0,1],[1,2],[0,3],[3,4],[4,5],[2,5]].forEach(([a,b])=>connect(atoms[a],atoms[b]));
    }else if(template==='ethyl-acetate'){
      const methyl=add(0,0),carbonyl=add(L*.866,-L*.5),carbonylO=add(L*.866,-L*1.5,'O',true),esterO=add(L*1.732,0,'O',true),methylene=add(L*2.598,-L*.5),terminal=add(L*3.464,0);connect(methyl,carbonyl);connect(carbonyl,carbonylO,2);connect(carbonyl,esterO);connect(esterO,methylene);connect(methylene,terminal);
    }
    if(!atoms.length)return {atoms:[],bonds:[]};const anchorAtom=atoms.reduce((left,atom)=>atom.x<left.x-.01||(Math.abs(atom.x-left.x)<.01&&atom.y<left.y)?atom:left,atoms[0]);const dx=point.x-anchorAtom.x,dy=point.y-anchorAtom.y;atoms.forEach((atom)=>{atom.x=round(atom.x+dx);atom.y=round(atom.y+dy);});return {atoms,bonds};
  }
  function addTemplate(point){
    const geometry=templateGeometry(state.template,point);if(!geometry.atoms.length)return;const map=new Map();geometry.atoms.forEach((source)=>{const atom=createAtom(source,source.element,source.explicit);map.set(source.id,atom);});geometry.bonds.forEach((source)=>newBond(map.get(source.a),map.get(source.b),source.order,source.style));pushHistory();render();
  }
  function snapAnnotationPoint(point,detailed=false,includeBondEndpoints=false) {
    if (!state.assist.textSnap) return detailed?{point,snapped:false,anchor:null}:point;
    const anchors = [];
    if(includeBondEndpoints){state.atoms.forEach((atom)=>{if(bondsFor(atom.id).length)anchors.push({x:atom.x,y:atom.y,kind:`bond-endpoint:${atom.id}`,textAlign:'center',textBaseline:'middle',radius:clamp(state.bondLength*1.35,32,52)/state.viewport.zoom});});}
    state.decorations.forEach((decoration) => {
      if (decoration.type === 'bracket') {
        const x=Math.max(decoration.x1,decoration.x2)+13;anchors.push({x,y:Math.min(decoration.y1,decoration.y2)-7,kind:'bracket-upper-right',radius:clamp(state.bondLength*1.25,30,48)/state.viewport.zoom},{x,y:Math.max(decoration.y1,decoration.y2)+7,kind:'bracket-lower-right',radius:clamp(state.bondLength*1.25,30,48)/state.viewport.zoom});
      }
    });
    const radius = clamp(state.bondLength*1.35,32,52) / state.viewport.zoom; let nearest = null; let best = Infinity;
    anchors.forEach((anchor) => { const d = distance(point, anchor);if(d<=(anchor.radius||radius)&&d<best){nearest=anchor;best=d;} });
    const resolved=nearest?{x:nearest.x,y:nearest.y}:point;return detailed?{point:resolved,snapped:Boolean(nearest),anchor:nearest}:resolved;
  }
  function addCharge(point){const snapped=snapAnnotationPoint(point);if(state.chargeStyle==='transition'){state.decorations.push({id:uid('dec'),type:'transition',x:snapped.x,y:snapped.y});pushHistory();render();showToast('已放置过渡态标记');return;}const atom=state.assist.snapAtoms?closestAtom(point,connectionRadius()):null;const minus=state.chargeStyle.includes('minus');const circled=state.chargeStyle.startsWith('circled');if(atom){atom.charge=minus?-1:1;atom.chargeStyle=circled?`circled-${minus?'minus':'plus'}`:'plain';atom.explicit=atom.explicit||atom.element==='C';pushHistory();render();showToast(minus?'已标记负电':'已标记正电');}else{state.decorations.push({id:uid('dec'),type:'charge',x:snapped.x,y:snapped.y,value:minus?'minus':'plus',style:circled?`circled-${minus?'minus':'plus'}`:'plain'});pushHistory();render();}}
  function addBracketFromSelection(){const b=selectionBounds();if(!b)return false;const pad=8/state.viewport.zoom;state.decorations.push({id:uid('dec'),type:'bracket',x1:b.x1-pad,y1:b.y1-pad,x2:b.x2+pad,y2:b.y2+pad,style:state.bracket,label:''});pushHistory();render();return true;}
  function addText(point,alreadySnapped=false,anchor=null){if(!state.text.value.trim())return;const resolved=alreadySnapped?{point,anchor}:snapAnnotationPoint(point,true,true);const decoration={id:uid('dec'),type:'text',draft:state.text.value===TEXT_PLACEHOLDER,x:resolved.point.x,y:resolved.point.y,value:state.text.value,size:state.text.size,color:state.text.color,snapAnchor:resolved.anchor?.kind||null,textAlign:resolved.anchor?.textAlign||'left',textBaseline:resolved.anchor?.textBaseline||'alphabetic'};state.decorations.push(decoration);clearSelection();state.selected.decorations.add(decoration.id);state.editingTextId=decoration.id;state.editingAtomId=null;pushHistory();openTextEditor(decoration);render();}
  function addMark(point){const snapped=snapAnnotationPoint(point);state.decorations.push({id:uid('dec'),type:'mark',x:snapped.x,y:snapped.y,style:state.mark});pushHistory();render();}

  function commitArrow(points,mode){if(points.length<2)return false;state.decorations.push({id:uid('dec'),type:'arrow',points:clone(points),pathMode:mode,lineStyle:state.arrow.line,headStyle:state.arrow.head});pushHistory();return true;}
  function commitArrowDraft(){const draft=state.arrowDraft;if(!draft)return false;const minimum=draft.mode==='curve'?3:2;const completed=draft.points.length>=minimum&&commitArrow(draft.points,draft.mode);state.arrowDraft=null;render();return completed;}
  function beginArrowPoint(world){const mode=state.arrow.mode;if(mode==='straight')return false;if(!state.arrowDraft||state.arrowDraft.mode!==mode){state.arrowDraft={mode,points:[world],hover:world};render();return true;}const draft=state.arrowDraft;const last=draft.points[draft.points.length-1];const next=mode==='polyline'?directionSnappedPoint(last,world):world;if(distance(last,next)>2)draft.points.push(next);draft.hover=next;if(mode==='curve'&&draft.points.length===3)commitArrowDraft();else render();return true;}

  function beginPointer(event){
    hideContext();closePopups();const screen=screenPoint(event),world=toWorld(screen);state.cursor=world;
    if(event.button===2){state.interaction={kind:'right-pan-pending',screen,startScreen:screen,startedAt:performance.now()};canvas.setPointerCapture(event.pointerId);return;}
    if(event.button===1||state.spaceDown||state.tool==='pan'){state.interaction={kind:'pan',screen};canvas.setPointerCapture(event.pointerId);return;}if(event.button!==0)return;
    if(state.tool==='select'){
      const control=hitTransformHandle(world);if(control){const frame=control.frame;state.interaction={kind:'transform',mode:control.mode,handle:control.handle,frame,start:world,startAngle:Math.atan2(world.y-frame.center.y,world.x-frame.center.x),atomIds:[...transformAtomIds()],decorationIds:[...state.selected.decorations],atoms:clone(state.atoms),bonds:clone(state.bonds),decorations:clone(state.decorations)};canvas.setPointerCapture(event.pointerId);return;}
      const labelHit=atomLabelHit(world),atom=labelHit?.atom||closestAtom(world,9/state.viewport.zoom),bond=!atom&&closestBond(world),decoration=!atom&&!bond&&closestDecoration(world);
      if(atom||bond||decoration){const alreadySelected=atom?state.selected.atoms.has(atom.id):bond?state.selected.bonds.has(bond.id):state.selected.decorations.has(decoration.id);if(!event.shiftKey&&!alreadySelected)clearSelection();if(atom)state.selected.atoms.add(atom.id);if(bond)state.selected.bonds.add(bond.id);if(decoration)state.selected.decorations.add(decoration.id);state.interaction={kind:'move',start:world,atomIds:[...transformAtomIds()],decorationIds:[...state.selected.decorations],atoms:clone(state.atoms),bonds:clone(state.bonds),decorations:clone(state.decorations),guides:[],endpointSnap:null};canvas.setPointerCapture(event.pointerId);render();}
      else{if(!event.shiftKey)clearSelection();state.interaction={kind:'lasso',start:world,end:world};canvas.setPointerCapture(event.pointerId);render();}return;
    }
    if(state.tool==='bond'){state.interaction=beginBondInteraction(world);canvas.setPointerCapture(event.pointerId);return;}
    if(state.tool==='chain'){const source=state.assist.snapAtoms?closestAtom(world,connectionRadius()):null;state.interaction={kind:'chain',start:source?{x:source.x,y:source.y}:world,sourceAtom:source,end:world};canvas.setPointerCapture(event.pointerId);return;}
    if(state.tool==='arrow'){if(state.arrow.mode==='straight'){state.interaction={kind:'arrow-straight',start:world,end:world};canvas.setPointerCapture(event.pointerId);}else beginArrowPoint(world);return;}
    if(state.tool==='bracket'){if(transformAtomIds().size&&addBracketFromSelection())return;state.interaction={kind:'bracket',start:world,end:world};canvas.setPointerCapture(event.pointerId);return;}
    if(state.tool==='text'){const labelHit=atomLabelHit(world),decoration=closestDecoration(world);if(labelHit){openTextEditor(labelHit.atom);return;}if(decoration?.type==='text'){openTextEditor(decoration);return;}state.text.value=TEXT_PLACEHOLDER;const snap=snapAnnotationPoint(world,true,true);state.interaction={kind:'text-placement',start:world,rawEnd:world,end:snap.point,snapped:snap.snapped,snapAnchor:snap.anchor};canvas.setPointerCapture(event.pointerId);render();return;}
    if(state.tool==='element')return placeElement(world);if(state.tool==='template')return addTemplate(world);if(state.tool==='charge')return addCharge(world);if(state.tool==='mark')return addMark(world);
  }
  function movePointer(event){
    const screen=screenPoint(event);const world=toWorld(screen);state.cursor=world;const i=state.interaction;
    if(!i){if(state.arrowDraft){const draft=state.arrowDraft;const last=draft.points[draft.points.length-1];draft.hover=draft.mode==='polyline'?directionSnappedPoint(last,world):world;}render();return;}
    if(i.kind==='right-pan-pending'){const moved=distance(screen,i.startScreen);if(moved>3||(moved>1&&performance.now()-i.startedAt>180)){i.kind='right-pan';state.suppressContextOnce=true;}else return;}
    if(i.kind==='pan'||i.kind==='right-pan'){state.viewport.x+=screen.x-i.screen.x;state.viewport.y+=screen.y-i.screen.y;i.screen=screen;}
    else if(i.kind==='move'){
      const dx=world.x-i.start.x,dy=world.y-i.start.y;state.atoms=clone(i.atoms);state.bonds=clone(i.bonds);state.decorations=clone(i.decorations);
      moveInteractionObjects(i,dx,dy);const selectedTexts=state.decorations.filter((dec)=>(i.decorationIds||[]).includes(dec.id)&&dec.type==='text');i.textSnap=null;i.guides=[];i.endpointSnap=null;
      selectedTexts.forEach((dec)=>{dec.snapAnchor=null;dec.textAlign='left';dec.textBaseline='alphabetic';});
      if(selectedTexts.length===1){const dec=selectedTexts[0];const snap=snapAnnotationPoint({x:dec.x,y:dec.y},true,true);if(snap.snapped)i.textSnap={decorationId:dec.id,point:snap.point,anchor:snap.anchor};}
      if(!i.textSnap)applySmartGuides(i);endpointSnapForMove(i);
    }
    else if(i.kind==='transform'){if(i.mode==='rotate')rotateSelection(i,world);else scaleSelection(i,world);}
    else if(i.kind==='bond'){i.rawEnd=world;const resolved=resolveBondEndpoint(i,world);i.end=resolved.end;i.previewTargetId=resolved.target?.id||null;}
    else if(i.kind==='arrow-straight'){i.rawEnd=world;i.end=directionSnappedPoint(i.start,world);}
    else if(i.kind==='text-placement'){const snap=snapAnnotationPoint(world,true,true);i.rawEnd=world;i.end=snap.point;i.snapped=snap.snapped;i.snapAnchor=snap.anchor;}
    else i.end=world;render();
  }
  function moveDecoration(d,dx,dy){if(d.type==='arrow'&&Array.isArray(d.points)){d.points.forEach((point)=>{point.x+=dx;point.y+=dy;});}else if(d.type==='arrow'||d.type==='bracket'){d.x1+=dx;d.x2+=dx;d.y1+=dy;d.y2+=dy;}else{d.x+=dx;d.y+=dy;}}
  function moveInteractionObjects(interaction,dx,dy){
    const atomIds=new Set(interaction.atomIds||[]),decorationIds=new Set(interaction.decorationIds||[]);state.atoms.forEach((atom)=>{if(atomIds.has(atom.id)){atom.x+=dx;atom.y+=dy;}});state.decorations.forEach((decoration)=>{if(decorationIds.has(decoration.id))moveDecoration(decoration,dx,dy);});
  }
  function atomGroupBounds(ids){const atoms=state.atoms.filter((atom)=>ids.has(atom.id));if(!atoms.length)return null;return{x1:Math.min(...atoms.map(atom=>atom.x)),y1:Math.min(...atoms.map(atom=>atom.y)),x2:Math.max(...atoms.map(atom=>atom.x)),y2:Math.max(...atoms.map(atom=>atom.y))};}
  function connectedAtomGroups(){
    const unseen=new Set(state.atoms.map((atom)=>atom.id)),groups=[];while(unseen.size){const first=unseen.values().next().value,ids=new Set([first]),queue=[first];unseen.delete(first);for(let index=0;index<queue.length;index+=1){const current=queue[index];bondsFor(current).forEach((bond)=>{const next=bond.a===current?bond.b:bond.a;if(unseen.has(next)){unseen.delete(next);ids.add(next);queue.push(next);}});}groups.push(ids);}return groups;
  }
  function alignmentReferences(interaction){
    const moving=new Set(interaction.atomIds||[]),selectedDecorations=new Set(interaction.decorationIds||[]),references=[];
    connectedAtomGroups().forEach((ids)=>{if([...ids].some((id)=>moving.has(id)))return;const bounds=atomGroupBounds(ids);if(bounds)references.push({x:(bounds.x1+bounds.x2)/2,y:(bounds.y1+bounds.y2)/2,bounds,kind:'structure'});});
    state.decorations.forEach((decoration)=>{if(selectedDecorations.has(decoration.id))return;const bounds=decorationBounds(decoration);if(decoration.type==='arrow'){const info=arrowMidpointAndTangent(decoration);if(info)references.push({x:info.point.x,y:info.point.y,bounds,kind:'arrow-center'});return;}references.push({x:(bounds.x1+bounds.x2)/2,y:(bounds.y1+bounds.y2)/2,bounds,kind:decoration.type});});return references;
  }
  function applySmartGuides(interaction){
    interaction.guides=[];if(!state.assist.smartGuides)return;let bounds=selectionBounds();if(!bounds)return;const threshold=16/state.viewport.zoom,references=alignmentReferences(interaction);const movingX=[bounds.x1,(bounds.x1+bounds.x2)/2,bounds.x2],movingY=[bounds.y1,(bounds.y1+bounds.y2)/2,bounds.y2];let bestX=null,bestY=null;
    references.forEach((reference)=>{const referenceX=[reference.bounds.x1,reference.x,reference.bounds.x2],referenceY=[reference.bounds.y1,reference.y,reference.bounds.y2];movingX.forEach((value)=>referenceX.forEach((target)=>{const delta=target-value;if(Math.abs(delta)<=threshold&&(!bestX||Math.abs(delta)<Math.abs(bestX.delta)))bestX={delta,value:target,reference};}));movingY.forEach((value)=>referenceY.forEach((target)=>{const delta=target-value;if(Math.abs(delta)<=threshold&&(!bestY||Math.abs(delta)<Math.abs(bestY.delta)))bestY={delta,value:target,reference};}));});
    const dx=bestX?.delta||0,dy=bestY?.delta||0;if(dx||dy)moveInteractionObjects(interaction,dx,dy);bounds=selectionBounds();
    if(bestX){const other=bestX.reference.bounds;interaction.guides.push({axis:'vertical',value:bestX.value,from:Math.min(bounds.y1,other.y1)-18/state.viewport.zoom,to:Math.max(bounds.y2,other.y2)+18/state.viewport.zoom});}
    if(bestY){const other=bestY.reference.bounds;interaction.guides.push({axis:'horizontal',value:bestY.value,from:Math.min(bounds.x1,other.x1)-18/state.viewport.zoom,to:Math.max(bounds.x2,other.x2)+18/state.viewport.zoom});}
  }
  function endpointSnapForMove(interaction){
    interaction.endpointSnap=null;if(!state.assist.snapAtoms)return;const moving=new Set(interaction.atomIds||[]);if(!moving.size)return;const eligibleSource=state.atoms.filter((atom)=>moving.has(atom.id)&&atom.element==='C'&&bondsFor(atom.id).length<=1&&bondsFor(atom.id).every((bond)=>moving.has(bond.a===atom.id?bond.b:bond.a)));const eligibleTarget=state.atoms.filter((atom)=>!moving.has(atom.id)&&atom.element==='C'&&bondsFor(atom.id).length<=1);const radius=clamp(state.bondLength*1.45,34,56)/state.viewport.zoom;let best=radius,pair=null;
    eligibleSource.forEach((source)=>eligibleTarget.forEach((target)=>{const already=bondsFor(source.id).some((bond)=>(bond.a===target.id||bond.b===target.id));if(already)return;const d=distance(source,target);if(d<=best){best=d;pair={source,target};}}));if(pair)interaction.endpointSnap={sourceId:pair.source.id,targetId:pair.target.id,dx:pair.target.x-pair.source.x,dy:pair.target.y-pair.source.y};
  }
  function mergeAtoms(sourceId,targetId){
    if(sourceId===targetId)return;state.bonds.forEach((bond)=>{if(bond.a===sourceId)bond.a=targetId;if(bond.b===sourceId)bond.b=targetId;});state.bonds=state.bonds.filter((bond)=>bond.a!==bond.b);const unique=new Map();state.bonds.forEach((bond)=>{const key=[bond.a,bond.b].sort().join('|');const existing=unique.get(key);if(!existing)unique.set(key,bond);else{existing.order=Math.max(existing.order,bond.order);if(existing.style==='normal')existing.style=bond.style;}});state.bonds=[...unique.values()];state.atoms=state.atoms.filter((atom)=>atom.id!==sourceId);state.selected.atoms.delete(sourceId);state.selected.atoms.add(targetId);
  }
  function endPointer(event){
    const i=state.interaction;if(!i)return;const finalWorld=toWorld(screenPoint(event));state.cursor=finalWorld;
    if(i.kind==='bond'){i.rawEnd=finalWorld;const resolved=resolveBondEndpoint(i,finalWorld);i.end=resolved.end;i.previewTargetId=resolved.target?.id||null;commitBond(i);}
    else if(i.kind==='chain'){i.end=finalWorld;if(distance(i.start,i.end)>4)commitChain(i);}
    else if(i.kind==='arrow-straight'){i.rawEnd=finalWorld;i.end=directionSnappedPoint(i.start,finalWorld);}
    else if(i.kind==='text-placement'){const snap=snapAnnotationPoint(finalWorld,true,true);i.rawEnd=finalWorld;i.end=snap.point;i.snapped=snap.snapped;i.snapAnchor=snap.anchor;addText(i.end,true,i.snapAnchor);}
    if(i.kind==='move'&&i.textSnap){const decoration=state.decorations.find(item=>item.id===i.textSnap.decorationId);if(decoration){decoration.x=i.textSnap.point.x;decoration.y=i.textSnap.point.y;decoration.snapAnchor=i.textSnap.anchor?.kind||null;decoration.textAlign=i.textSnap.anchor?.textAlign||'left';decoration.textBaseline=i.textSnap.anchor?.textBaseline||'alphabetic';}}
    if(i.kind==='move'&&i.endpointSnap){moveInteractionObjects(i,i.endpointSnap.dx,i.endpointSnap.dy);mergeAtoms(i.endpointSnap.sourceId,i.endpointSnap.targetId);showToast('端点已自动吸附并合并');}
    if(i.kind==='arrow-straight'&&distance(i.start,i.end)>4)commitArrow([i.start,i.end],'straight');
    if(i.kind==='bracket'&&distance(i.start,i.end)>4){state.decorations.push({id:uid('dec'),type:'bracket',x1:i.start.x,y1:i.start.y,x2:i.end.x,y2:i.end.y,style:state.bracket,label:''});pushHistory();}
    if(i.kind==='lasso'){const x1=Math.min(i.start.x,i.end.x),x2=Math.max(i.start.x,i.end.x),y1=Math.min(i.start.y,i.end.y),y2=Math.max(i.start.y,i.end.y);state.atoms.forEach((atom)=>{if(atom.x>=x1&&atom.x<=x2&&atom.y>=y1&&atom.y<=y2)state.selected.atoms.add(atom.id);});state.bonds.forEach((bond)=>{const b=bondBounds(bond);if(b&&b.x1>=x1&&b.x2<=x2&&b.y1>=y1&&b.y2<=y2)state.selected.bonds.add(bond.id);});state.decorations.forEach((decoration)=>{const b=decorationBounds(decoration);if(b.x1>=x1&&b.x2<=x2&&b.y1>=y1&&b.y2<=y2)state.selected.decorations.add(decoration.id);});}
    if(i.kind==='move'||i.kind==='transform')pushHistory();if(i.kind==='right-pan')setTimeout(()=>{state.suppressContextOnce=false;},450);state.interaction=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);render();
  }

  function deleteSelection(){if(!state.selected.atoms.size&&!state.selected.bonds.size&&!state.selected.decorations.size)return;const atomIds=state.selected.atoms;state.bonds=state.bonds.filter((bond)=>!atomIds.has(bond.a)&&!atomIds.has(bond.b)&&!state.selected.bonds.has(bond.id));state.atoms=state.atoms.filter((atom)=>!atomIds.has(atom.id));state.decorations=state.decorations.filter((d)=>!state.selected.decorations.has(d.id));clearSelection();pushHistory();render();showToast('已删除选中对象');}
  function hideContext(){contextMenu.hidden=true;contextMenu.innerHTML='';}
  function showContext(event){
    event.preventDefault();if(state.suppressContextOnce){state.suppressContextOnce=false;return;}closePopups();const screen=screenPoint(event),world=toWorld(screen);const labelHit=atomLabelHit(world);const atom=labelHit?.atom||closestAtom(world,10/state.viewport.zoom);const bond=!atom&&closestBond(world);const dec=!atom&&!bond&&closestDecoration(world);if(!atom&&!bond&&!dec)return;
    clearSelection();if(atom)state.selected.atoms.add(atom.id);if(bond)state.selected.bonds.add(bond.id);if(dec)state.selected.decorations.add(dec.id);render();
    const entries=[];
    if(atom)entries.push(['编辑化学文本','atom-edit'],['正电','atom-plus'],['负电','atom-minus'],['带圈正电','atom-circled-plus'],['带圈负电','atom-circled-minus'],['清除电荷','atom-charge-clear'],[atom.explicit?'隐藏碳标签':'显示元素标签','atom-label']);
    if(bond)entries.push(['单键','bond-1'],['双键','bond-2'],['三键','bond-3'],['实心楔形键','bond-wedge'],['空心楔形键','bond-hollow'],['虚线楔形键','bond-hash']);
    if(dec?.type==='text')entries.push(['编辑文字','text-edit']);
    if(dec?.type==='charge')entries.push(['切换为正电','dec-plus'],['切换为负电','dec-minus'],['切换为带圈正电','dec-circled-plus'],['切换为带圈负电','dec-circled-minus']);
    if(dec?.type==='mark')entries.push(['切换为圆点','mark-dot'],['切换为叉号','mark-cross']);
    entries.push(['','sep'],['删除','delete']);
    contextMenu.innerHTML=entries.map(([name,action])=>action==='sep'?'<hr>':`<button class="${action==='delete'?'danger':''}" data-context="${action}">${name}</button>`).join('');
    contextMenu.querySelectorAll('[data-context]').forEach((button)=>button.addEventListener('click',()=>{applyContext(button.dataset.context,atom,bond,dec);hideContext();}));contextMenu.hidden=false;contextMenu.style.left=`${clamp(screen.x,4,state.canvas.width-180)}px`;contextMenu.style.top=`${clamp(screen.y,4,state.canvas.height-210)}px`;
  }
  function applyContext(action,atom,bond,dec){
    if(action==='delete')return deleteSelection();
    if(action==='atom-edit'){openTextEditor(atom);return;}
    if(action==='text-edit'){openTextEditor(dec);return;}
    if(action==='atom-plus'||action==='atom-minus'||action==='atom-circled-plus'||action==='atom-circled-minus'){atom.charge=action.includes('minus')?-1:1;atom.chargeStyle=action.includes('circled')?`circled-${action.includes('minus')?'minus':'plus'}`:'plain';atom.explicit=atom.explicit||atom.element==='C';}
    if(action==='atom-charge-clear')atom.charge=0;
    if(action==='atom-label')atom.explicit=!atom.explicit;
    if(action.startsWith('bond-')){const kind=action.slice(5);bond.style=['wedge','hollow','hash'].includes(kind)?kind:'normal';bond.order=/^[123]$/.test(kind)?Number(kind):1;}
    if(action==='dec-plus'){dec.value='plus';dec.style='plain';}if(action==='dec-minus'){dec.value='minus';dec.style='plain';}if(action==='dec-circled-plus'){dec.value='plus';dec.style='circled-plus';}if(action==='dec-circled-minus'){dec.value='minus';dec.style='circled-minus';}
    if(action==='mark-dot')dec.style='dot';if(action==='mark-cross')dec.style='cross';pushHistory();render();
  }
  function editCanvasText(event){
    if(state.tool==='arrow'&&state.arrowDraft?.mode==='polyline'){event.preventDefault();commitArrowDraft();return;}
    if(state.tool!=='select')return;const world=toWorld(screenPoint(event));const labelHit=atomLabelHit(world);
    if(labelHit){event.preventDefault();openTextEditor(labelHit.atom);return;}
    const decoration=closestDecoration(world);if(decoration?.type==='text'){event.preventDefault();openTextEditor(decoration);}
  }

  function projectData(){return {format:'NaDraw',version:2,atoms:state.atoms,bonds:state.bonds,decorations:state.decorations,settings:{bondLength:state.bondLength,grid:state.grid,assist:state.assist,viewport:state.viewport,textStyle:state.text}};}
  async function saveProject(){const result=await window.nadraw.saveProject({project:projectData(),suggestedName:state.fileName});if(!result.canceled){state.fileName=result.filePath.split(/[\\/]/).pop();state.dirty=false;updateChrome();showToast(`工程已保存：${state.fileName}`);}}
  function importLegacyObjects(objects){const map=new Map();const findOrMake=(x,y)=>{const key=`${round(x)}-${round(y)}`;if(!map.has(key))map.set(key,createAtom({x,y},'C',false));return map.get(key);};objects.filter((o)=>o.type==='bond').forEach((o)=>newBond(findOrMake(o.x1,o.y1),findOrMake(o.x2,o.y2),o.order||1,o.style||'normal'));objects.filter((o)=>o.type==='text').forEach((o)=>state.decorations.push({id:uid('dec'),type:'text',x:o.x,y:o.y,value:o.value,size:o.size||18,color:o.color||'#111'}));}
  function normalizeProjectDecorations(decorations) {
    return (decorations || []).map((item) => item.type === 'orbital'
      ? { id: item.id || uid('dec'), type: 'text', x: item.x || 0, y: item.y || 0,
          value: '旧版图形（已移除）', size: 12, color: '#111111' }
      : item);
  }
  function loadProjectResult(result){
    if(result.canceled)return;
    if(result.error)return showToast(result.error);
    const project=result.project;
    if(!project)return showToast('工程文件无效');
    const openInNewTab=state.dirty||state.atoms.length>0||state.bonds.length>0||state.decorations.length>0||!/^未命名\d+\.(?:nad|chd)$/i.test(state.fileName);
    if(openInNewTab){syncActiveDocument();const document=blankDocument(nextUntitledName());documentWorkspace.documents.push(document);documentWorkspace.activeId=document.id;restoreDocument(document);}
    state.atoms=[];state.bonds=[];state.decorations=[];
    if(Array.isArray(project.atoms)&&Array.isArray(project.bonds)){state.atoms=project.atoms;state.bonds=project.bonds;state.decorations=normalizeProjectDecorations(project.decorations);}
    else if(Array.isArray(project.objects))importLegacyObjects(project.objects);
    else return showToast('不支持的工程格式');
    state.bondLength=project.settings?.bondLength||24;state.grid=Boolean(project.settings?.grid);state.assist={...state.assist,...(project.settings?.assist||{})};state.viewport=project.settings?.viewport||state.viewport;state.text={...state.text,...(project.settings?.textStyle||{size:clamp(state.bondLength*.55,12,64)})};state.fileName=result.filePath.split(/[\\/]/).pop();state.dirty=false;clearSelection();state.history=[];state.historyIndex=-1;pushHistory(false);syncAssistControls();render();showToast(`已打开：${state.fileName}`);
  }
  async function openProject(){loadProjectResult(await window.nadraw.openProject());}
  function mergeDocumentBounds(items){const valid=items.filter(Boolean);if(!valid.length)return null;return{x1:Math.min(...valid.map(item=>item.x1)),y1:Math.min(...valid.map(item=>item.y1)),x2:Math.max(...valid.map(item=>item.x2)),y2:Math.max(...valid.map(item=>item.y2))};}
  function documentContentBounds(){
    const items=[...state.bonds.map(bondBounds),...state.decorations.map(decorationBounds)];
    state.atoms.forEach((atom)=>{const layout=atomLabelLayout(atom);if(layout.bounds)items.push(layout.bounds);if(atom.charge){const x=(layout.bounds?.x2||atom.x)+5,y=(layout.bounds?.y1||atom.y)-2;items.push({x1:x-10,y1:y-10,x2:x+10,y2:y+10});}});
    return mergeDocumentBounds(items);
  }
  function croppedJpegData(bounds,padding=14){
    const worldWidth=Math.max(1,bounds.x2-bounds.x1+padding*2),worldHeight=Math.max(1,bounds.y2-bounds.y1+padding*2);const scale=Math.max(.35,Math.min(2,8192/worldWidth,8192/worldHeight));
    const output=document.createElement('canvas');output.width=Math.max(1,Math.ceil(worldWidth*scale));output.height=Math.max(1,Math.ceil(worldHeight*scale));const exportContext=output.getContext('2d');
    const previousContext=ctx,previousSelection=state.selected;state.selected={atoms:new Set(),bonds:new Set(),decorations:new Set()};ctx=exportContext;
    try{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,output.width,output.height);ctx.setTransform(scale,0,0,scale,(padding-bounds.x1)*scale,(padding-bounds.y1)*scale);state.bonds.forEach(drawBond);state.decorations.forEach(drawDecoration);drawAtomLabels();return output.toDataURL('image/jpeg',.96);}
    finally{ctx=previousContext;state.selected=previousSelection;render();}
  }
  function svgEscape(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function svgNumber(value){return Number(Number(value).toFixed(3));}
  function svgLine(a,b,width=1.55,color='#111111',dash=''){return`<line x1="${svgNumber(a.x)}" y1="${svgNumber(a.y)}" x2="${svgNumber(b.x)}" y2="${svgNumber(b.y)}" stroke="${svgEscape(color)}" stroke-width="${svgNumber(width)}"${dash?` stroke-dasharray="${dash}"`:''} stroke-linecap="round"/>`;}
  function svgBond(bond){
    const[a,b]=bondAtoms(bond);if(!a||!b)return'';if(bond.style==='wedge'||bond.style==='hollow'){const p=perpendicular(a,b,wedgeWidth(a,b)),points=`${svgNumber(a.x)},${svgNumber(a.y)} ${svgNumber(b.x+p.x)},${svgNumber(b.y+p.y)} ${svgNumber(b.x-p.x)},${svgNumber(b.y-p.y)}`;return bond.style==='hollow'?`<polygon points="${points}" fill="white" stroke="#111111" stroke-width="${svgNumber(Math.max(.8,1.35*bondScale(a,b)))}"/>`:`<polygon points="${points}" fill="#111111"/>`;}
    if(bond.style==='hash'){const normal=perpendicular(a,b,1),base=wedgeWidth(a,b);let result='';for(let index=1;index<=7;index+=1){const t=index/8.5,mid={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},half=base*t;result+=svgLine({x:mid.x+normal.x*half,y:mid.y+normal.y*half},{x:mid.x-normal.x*half,y:mid.y-normal.y*half},Math.max(.55,.85*bondScale(a,b)));}return result;}
    return bondVisualSegments(bond,a,b).map(segment=>svgLine(segment.a,segment.b,segment.width)).join('');
  }
  function svgArrowHead(tip,from,fishhook=false){const angle=Math.atan2(tip.y-from.y,tip.x-from.x),size=7.5;if(fishhook){const control={x:tip.x-Math.cos(angle-.24)*size*.55,y:tip.y-Math.sin(angle-.24)*size*.55},end={x:tip.x-Math.cos(angle-.55)*size,y:tip.y-Math.sin(angle-.55)*size};return`<path d="M ${svgNumber(tip.x)} ${svgNumber(tip.y)} Q ${svgNumber(control.x)} ${svgNumber(control.y)} ${svgNumber(end.x)} ${svgNumber(end.y)}" fill="none" stroke="#111111" stroke-width="1.45" stroke-linecap="round"/>`;}
    const left={x:tip.x-Math.cos(angle-.47)*size,y:tip.y-Math.sin(angle-.47)*size},right={x:tip.x-Math.cos(angle+.47)*size,y:tip.y-Math.sin(angle+.47)*size};return`<polygon points="${svgNumber(tip.x)},${svgNumber(tip.y)} ${svgNumber(left.x)},${svgNumber(left.y)} ${svgNumber(right.x)},${svgNumber(right.y)}" fill="#111111"/>`;}
  function svgArrow(decoration){const points=arrowPoints(decoration);if(points.length<2)return'';const mode=decoration.pathMode||decoration.mode||'straight';let path=`M ${svgNumber(points[0].x)} ${svgNumber(points[0].y)}`;if(mode==='curve'&&points.length>=3)path+=` Q ${svgNumber(points[1].x)} ${svgNumber(points[1].y)} ${svgNumber(points[2].x)} ${svgNumber(points[2].y)}`;else points.slice(1).forEach(point=>{path+=` L ${svgNumber(point.x)} ${svgNumber(point.y)}`;});const tip=points[points.length-1],from=mode==='curve'&&points.length>=3?points[1]:points[points.length-2],dash=(decoration.lineStyle||'solid')==='dashed'?'5 4':'';return`<path d="${path}" fill="none" stroke="#111111" stroke-width="1.55"${dash?` stroke-dasharray="${dash}"`:''} stroke-linecap="round" stroke-linejoin="round"/>${svgArrowHead(tip,from,(decoration.headStyle||decoration.head)==='fishhook'||decoration.variant==='fishhook')}`;}
  function svgBracket(decoration){
    const x1=Math.min(decoration.x1,decoration.x2),x2=Math.max(decoration.x1,decoration.x2),y1=Math.min(decoration.y1,decoration.y2),y2=Math.max(decoration.y1,decoration.y2);let paths='';
    if(decoration.style==='curly'){const height=Math.max(30,y2-y1),middle=(y1+y2)/2,shoulder=Math.min(24,height*.18),hook=Math.min(10,height*.075);const brace=(x,side)=>`M ${svgNumber(x+side*hook)} ${svgNumber(y1)} C ${svgNumber(x+side*2)} ${svgNumber(y1)} ${svgNumber(x+side*2)} ${svgNumber(y1+shoulder*.35)} ${svgNumber(x+side*2)} ${svgNumber(y1+shoulder)} C ${svgNumber(x+side*2)} ${svgNumber(middle-shoulder)} ${svgNumber(x+side)} ${svgNumber(middle-7)} ${svgNumber(x-side*hook)} ${svgNumber(middle)} C ${svgNumber(x+side)} ${svgNumber(middle+7)} ${svgNumber(x+side*2)} ${svgNumber(middle+shoulder)} ${svgNumber(x+side*2)} ${svgNumber(y2-shoulder)} C ${svgNumber(x+side*2)} ${svgNumber(y2-shoulder*.35)} ${svgNumber(x+side*2)} ${svgNumber(y2)} ${svgNumber(x+side*hook)} ${svgNumber(y2)}`;paths=`${brace(x1,1)} ${brace(x2,-1)}`;}
    else if(decoration.style==='square')paths=`M ${svgNumber(x1+7)} ${svgNumber(y1)} L ${svgNumber(x1)} ${svgNumber(y1)} L ${svgNumber(x1)} ${svgNumber(y2)} L ${svgNumber(x1+7)} ${svgNumber(y2)} M ${svgNumber(x2-7)} ${svgNumber(y1)} L ${svgNumber(x2)} ${svgNumber(y1)} L ${svgNumber(x2)} ${svgNumber(y2)} L ${svgNumber(x2-7)} ${svgNumber(y2)}`;
    else paths=`M ${svgNumber(x1+7)} ${svgNumber(y1)} Q ${svgNumber(x1)} ${svgNumber(y1)} ${svgNumber(x1)} ${svgNumber(y1+7)} L ${svgNumber(x1)} ${svgNumber(y2-7)} Q ${svgNumber(x1)} ${svgNumber(y2)} ${svgNumber(x1+7)} ${svgNumber(y2)} M ${svgNumber(x2-7)} ${svgNumber(y1)} Q ${svgNumber(x2)} ${svgNumber(y1)} ${svgNumber(x2)} ${svgNumber(y1+7)} L ${svgNumber(x2)} ${svgNumber(y2-7)} Q ${svgNumber(x2)} ${svgNumber(y2)} ${svgNumber(x2-7)} ${svgNumber(y2)}`;
    return`<path d="${paths}" fill="none" stroke="#111111" stroke-width="1.45"/>${decoration.label?`<text x="${svgNumber(x2+4)}" y="${svgNumber(y2+3)}" font-family="Times New Roman,serif" font-size="14">${svgEscape(decoration.label)}</text>`:''}`;
  }
  function svgTextDecoration(decoration){ctx.save();ctx.font=`${decoration.size}px ${TEXT_FONT}`;const lines=String(decoration.value||'').split(/\r?\n/),width=Math.max(6,...lines.map(line=>ctx.measureText(line||' ').width));ctx.restore();const align=decoration.textAlign||'left',anchor=align==='center'?'middle':align==='right'?'end':'start',baseline=decoration.textBaseline||'alphabetic',lineHeight=decoration.size*1.18,startY=baseline==='middle'?decoration.y-(lines.length-1)*lineHeight/2:decoration.y;let background='';if(baseline==='middle'){const height=decoration.size*.96+(lines.length-1)*lineHeight;background=`<rect x="${svgNumber(decoration.x-width/2-1.2)}" y="${svgNumber(decoration.y-height/2-1)}" width="${svgNumber(width+2.4)}" height="${svgNumber(height+2)}" rx="2" fill="white"/>`; }return`${background}<text font-family="Cambria Math,STIX Two Text,Times New Roman,Microsoft YaHei UI,serif" font-size="${svgNumber(decoration.size)}" fill="${svgEscape(decoration.color||'#111111')}" text-anchor="${anchor}" dominant-baseline="${baseline==='middle'?'central':'auto'}">${lines.map((line,index)=>`<tspan x="${svgNumber(decoration.x)}" y="${svgNumber(startY+index*lineHeight)}">${svgEscape(line)}</tspan>`).join('')}</text>`;}
  function svgDecoration(decoration){
    if(decoration.type==='arrow')return svgArrow(decoration);if(decoration.type==='bracket')return svgBracket(decoration);if(decoration.type==='text')return svgTextDecoration(decoration);
    if(decoration.type==='mark')return decoration.style==='cross'?`${svgLine({x:decoration.x-4,y:decoration.y-4},{x:decoration.x+4,y:decoration.y+4},1.5)}${svgLine({x:decoration.x+4,y:decoration.y-4},{x:decoration.x-4,y:decoration.y+4},1.5)}`:`<circle cx="${svgNumber(decoration.x)}" cy="${svgNumber(decoration.y)}" r="2.8" fill="#111111"/>`;
    if(decoration.type==='charge'){const circled=decoration.style?.startsWith('circled'),value=decoration.value==='minus'?'−':'+';return`${circled?`<circle cx="${svgNumber(decoration.x)}" cy="${svgNumber(decoration.y)}" r="9" fill="none" stroke="#111111"/>`:''}<text x="${svgNumber(decoration.x)}" y="${svgNumber(decoration.y+.5)}" font-family="Arial,sans-serif" font-size="16" font-weight="bold" text-anchor="middle" dominant-baseline="central">${value}</text>`;}
    if(decoration.type==='transition')return`<text x="${svgNumber(decoration.x)}" y="${svgNumber(decoration.y)}" font-family="Cambria Math,Times New Roman,serif" font-size="15" text-anchor="middle" dominant-baseline="central">‡</text>`;return'';
  }
  function svgAtomLabels(){let result='';state.atoms.forEach((atom)=>{const layout=atomLabelLayout(atom);if(!layout.value)return;if(state.assist.labelAvoidance&&layout.bounds){const b=layout.bounds;result+=`<rect x="${svgNumber(b.x1)}" y="${svgNumber(b.y1)}" width="${svgNumber(b.x2-b.x1)}" height="${svgNumber(b.y2-b.y1)}" rx="2" fill="white"/>`; }layout.runs.forEach(run=>{const anchor=run.align==='center'?'middle':run.align==='right'?'end':'start';result+=`<text x="${svgNumber(run.x)}" y="${svgNumber(run.y)}" font-family="Cambria Math,STIX Two Text,Times New Roman,Microsoft YaHei UI,serif" font-size="${svgNumber(layout.fontSize)}" fill="${svgEscape(layout.color)}" text-anchor="${anchor}" dominant-baseline="central">${svgEscape(run.text)}</text>`;});if(atom.charge){const charge=superscript(atom.charge),x=(layout.bounds?.x2||atom.x)+5,y=(layout.bounds?.y1||atom.y)-2;if(atom.chargeStyle?.startsWith('circled'))result+=`<circle cx="${svgNumber(x)}" cy="${svgNumber(y)}" r="8" fill="none" stroke="${svgEscape(layout.color)}"/>`;result+=`<text x="${svgNumber(x)}" y="${svgNumber(y)}" font-family="Cambria Math,Times New Roman,serif" font-size="13" fill="${svgEscape(layout.color)}" text-anchor="middle" dominant-baseline="central">${svgEscape(charge)}</text>`;}});return result;}
  function croppedSvgText(bounds,padding=14){const x=bounds.x1-padding,y=bounds.y1-padding,width=Math.max(1,bounds.x2-bounds.x1+padding*2),height=Math.max(1,bounds.y2-bounds.y1+padding*2);const content=`${state.bonds.map(svgBond).join('')}${state.decorations.map(svgDecoration).join('')}${svgAtomLabels()}`;return`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(width)}" height="${svgNumber(height)}" viewBox="${svgNumber(x)} ${svgNumber(y)} ${svgNumber(width)} ${svgNumber(height)}"><rect x="${svgNumber(x)}" y="${svgNumber(y)}" width="${svgNumber(width)}" height="${svgNumber(height)}" fill="white"/>${content}</svg>`;}
  async function exportImage(format='choose'){const bounds=documentContentBounds();if(!bounds)return showToast('画布中没有可导出的内容');const jpegDataUrl=croppedJpegData(bounds),svgText=croppedSvgText(bounds),extension=format==='svg'?'svg':'jpg';const result=await window.nadraw.exportImage({format,jpegDataUrl,svgText,suggestedName:state.fileName.replace(/\.(?:nad|chd)$/i,'')+'.'+extension});if(!result.canceled)showToast(`${result.format==='svg'?'SVG 矢量图':'JPG 图片'}已导出`);}
  function newProject(){syncActiveDocument();const document=blankDocument(nextUntitledName());documentWorkspace.documents.push(document);documentWorkspace.activeId=document.id;closePopups();hideContext();restoreDocument(document);pushHistory(false);syncAssistControls();render();showToast(`已新建：${state.fileName.replace(/\.(?:nad|chd)$/i,'')}`);}
  function runSmokeDoubleBondChecks() {
    state.atoms = []; state.bonds = []; state.decorations = []; clearSelection();
    state.history = []; state.historyIndex = -1; state.bondOrder = 2; state.bondStyle = 'normal';
    const a = createAtom({ x: 0, y: 0 }), b = createAtom({ x: 0, y: -24 });
    const bond = newBond(a, b, 2, 'normal'), endpoints = JSON.stringify([a, b]);
    pushHistory(false);
    const layouts = [], segments = [];
    for (let index = 0; index < 3; index += 1) {
      applyExistingBondClick(bond); layouts.push(bond.doubleLayout); segments.push(bondVisualSegments(bond, a, b));
    }
    const threeLayouts = layouts.join(',') === 'left,right,center' && bond.order === 2 &&
      state.bonds.length === 1 && JSON.stringify([a, b]) === endpoints && valenceFor(a) === 2;
    const left = segments[0], right = segments[1], center = segments[2];
    const geometry = distance(center[0].a, center[0].b) === 24 && distance(center[1].a, center[1].b) === 24 &&
      distance(left[0].a, a) === 0 && distance(right[0].a, a) === 0 &&
      distance(left[1].a, left[1].b) < 24 && distance(right[1].a, right[1].b) < 24 &&
      left[1].a.x > 0 && right[1].a.x < 0;
    undo(); const undone = state.bonds[0].doubleLayout === 'right';
    redo(); const undoRedo = undone && state.bonds[0].doubleLayout === 'center';
    let hitTesting = true, endpointsConnect = true;
    for (const zoom of [.25, 1, 4]) for (const snap of [true, false]) {
      state.viewport.zoom = zoom; state.assist.snapAtoms = snap;
      const active = state.bonds[0];
      const line = bondVisualSegments(active, a, b)[1];
      const point = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
      const interaction = beginBondInteraction(point), previous = active.doubleLayout;
      commitBond(interaction);
      hitTesting &&= !interaction.sourceAtom && active.order === 2 && active.doubleLayout !== previous && state.bonds.length === 1;
      if (snap) endpointsConnect &&= beginBondInteraction(a).sourceAtom?.id === a.id;
    }
    state.viewport.zoom = 1; state.assist.snapAtoms = true;
    let active = state.bonds[0]; active.order = 1; delete active.doubleLayout;
    applyExistingBondClick(active); const singleToDouble = active.order === 2;
    active.order = 3; delete active.doubleLayout; applyExistingBondClick(active);
    const doubleToolSetsOrder = singleToDouble && active.order === 2;
    state.bondOrder = 1; applyExistingBondClick(active); const singleToTriple = active.order === 3;
    applyExistingBondClick(active); const singleCycle = singleToTriple && active.order === 1;
    active.order = 2; state.bondOrder = 3; applyExistingBondClick(active);
    const tripleCycle = active.order === 2;
    state.atoms = []; state.bonds = []; state.template = 'benzene'; addTemplate({ x: 0, y: 0 });
    const ringBond = state.bonds.find((candidate) => candidate.order === 2), [ra, rb] = bondAtoms(ringBond);
    state.bondOrder = 2; const ringBefore = resolvedDoubleLayout(ringBond, ra, rb), valence = valenceFor(ra);
    const visited = new Set();
    for (let index = 0; index < 3; index += 1) { applyExistingBondClick(ringBond); visited.add(ringBond.doubleLayout); }
    const ringCycle = visited.size === 3 && ringBond.doubleLayout === ringBefore && ringBond.order === 2 && valenceFor(ra) === valence;
    const serialized = JSON.parse(JSON.stringify(projectData()));
    const persistence = serialized.bonds.find((candidate) => candidate.id === ringBond.id).doubleLayout === ringBond.doubleLayout;
    return { doubleBondThreeLayouts: threeLayouts, doubleBondGeometry: geometry, doubleBondUndoRedo: undoRedo,
      doubleBondBodyClick: hitTesting, doubleBondEndpointsConnect: endpointsConnect, doubleToolSetsOrder,
      otherBondCyclesPreserved: singleCycle && tripleCycle, doubleBondRingCycle: ringCycle, doubleBondPersistence: persistence };
  }
  function prepareSmokeDoubleBondVisual() {
    state.atoms = []; state.bonds = []; state.decorations = []; clearSelection();
    DOUBLE_LAYOUTS.forEach((layout, index) => {
      const x = 55 + index * 140, a = createAtom({ x, y: 48 }), b = createAtom({ x, y: 0 });
      const bond = newBond(a, b, 2, 'normal'); bond.doubleLayout = layout;
      newBond(a, createAtom({ x: x - 36, y: 72 }), 1, 'normal');
      newBond(a, createAtom({ x: x + 36, y: 72 }), 1, 'normal');
      state.decorations.push({ id: uid('dec'), type: 'text', x, y: 98, size: 14, color: '#111111',
        value: ['居中等长', '一侧短线', '另一侧短线'][index], textAlign: 'center' });
    });
    const bounds = documentContentBounds();
    return { project: clone(projectData()), svg: croppedSvgText(bounds), jpeg: croppedJpegData(bounds) };
  }
  function runSmokeCoreChecks(){
    const backup={atoms:clone(state.atoms),bonds:clone(state.bonds),decorations:clone(state.decorations),selected:{atoms:new Set(state.selected.atoms),bonds:new Set(state.selected.bonds),decorations:new Set(state.selected.decorations)},tool:state.tool,bondOrder:state.bondOrder,bondStyle:state.bondStyle,template:state.template,text:clone(state.text),assist:clone(state.assist),history:clone(state.history),historyIndex:state.historyIndex,dirty:state.dirty,clipboard:clone(state.clipboard),pasteSerial:state.pasteSerial,editingTextId:state.editingTextId,editingAtomId:state.editingAtomId,viewport:clone(state.viewport),interaction:state.interaction,suppressContextOnce:state.suppressContextOnce};
    try{
      const originalBondTool = { order: state.bondOrder, style: state.bondStyle };
      const doubleBondChecks = runSmokeDoubleBondChecks();
      state.bondOrder = originalBondTool.order; state.bondStyle = originalBondTool.style;
      state.assist = clone(backup.assist); state.viewport = clone(backup.viewport);
      const geometry=templateGeometry('ethyl-acetate',{x:100,y:100}),left=Math.min(...geometry.atoms.map((atom)=>atom.x));const benzene=templateGeometry('benzene',{x:0,y:0}),benzeneMap=new Map(benzene.atoms.map((atom)=>[atom.id,atom])),benzeneCenter=benzene.atoms.reduce((sum,atom)=>({x:sum.x+atom.x/benzene.atoms.length,y:sum.y+atom.y/benzene.atoms.length}),{x:0,y:0}),benzeneDouble=benzene.bonds.find((bond)=>bond.order===2),benzeneSegments=inwardDoubleSegments(benzeneMap.get(benzeneDouble.a),benzeneMap.get(benzeneDouble.b),benzeneCenter),mainMid={x:(benzeneSegments[0].a.x+benzeneSegments[0].b.x)/2,y:(benzeneSegments[0].a.y+benzeneSegments[0].b.y)/2},innerMid={x:(benzeneSegments[1].a.x+benzeneSegments[1].b.x)/2,y:(benzeneSegments[1].a.y+benzeneSegments[1].b.y)/2},benzenePreviewInside=distance(innerMid,benzeneCenter)<distance(mainMid,benzeneCenter);state.atoms=[];state.bonds=[];state.decorations=[];clearSelection();state.history=[];state.historyIndex=-1;state.template='ethyl-acetate';addTemplate({x:100,y:100});clearSelection();const selectedAll=selectAll(false),selectAllOk=selectedAll&&state.selected.atoms.size===state.atoms.length&&state.selected.bonds.size===state.bonds.length;const copied=copySelection(false),before={atoms:state.atoms.length,bonds:state.bonds.length};pasteSelection();const clipboardOk=copied&&state.atoms.length===before.atoms*2&&state.bonds.length===before.bonds*2;
      state.atoms=[];state.bonds=[];state.decorations=[];clearSelection();const a1=createAtom({x:0,y:0}),a2=createAtom({x:24,y:0}),b1=createAtom({x:42,y:0}),b2=createAtom({x:66,y:0});newBond(a1,a2,1,'normal');newBond(b1,b2,1,'normal');state.selected.atoms.add(a1.id);state.selected.atoms.add(a2.id);const endpointInteraction={atomIds:[a1.id,a2.id],decorationIds:[]};endpointSnapForMove(endpointInteraction);const ghostReady=Boolean(endpointInteraction.endpointSnap);if(ghostReady){moveInteractionObjects(endpointInteraction,endpointInteraction.endpointSnap.dx,endpointInteraction.endpointSnap.dy);mergeAtoms(endpointInteraction.endpointSnap.sourceId,endpointInteraction.endpointSnap.targetId);}const endpointMergeOk=ghostReady&&state.atoms.length===3&&state.bonds.length===2;
      state.atoms=[];state.bonds=[];state.decorations=[];clearSelection();const g1=createAtom({x:0,y:0}),g2=createAtom({x:24,y:0}),r1=createAtom({x:100,y:7}),r2=createAtom({x:124,y:7});newBond(g1,g2,1,'normal');newBond(r1,r2,1,'normal');state.selected.atoms.add(g1.id);state.selected.atoms.add(g2.id);const guideInteraction={atomIds:[g1.id,g2.id],decorationIds:[],guides:[]};applySmartGuides(guideInteraction);const guideOk=guideInteraction.guides.some((guide)=>guide.axis==='horizontal')&&Math.abs(g1.y-7)<.01&&Math.abs(g2.y-7)<.01;
      state.decorations=[];state.text={value:TEXT_PLACEHOLDER,size:14,color:'#111111'};setTool('text');const textWaitsForCanvas=textPopover.hidden;addText({x:10,y:10},true,null);const textPlacementOpensEditor=!textPopover.hidden&&document.getElementById('text-input').value===TEXT_PLACEHOLDER&&state.selected.decorations.size===1;textPopover.hidden=true;state.editingTextId=null;state.decorations=[{id:'qa-arrow',type:'arrow',points:[{x:0,y:0},{x:40,y:0}],pathMode:'straight',lineStyle:'solid',headStyle:'full'}];const arrowSnapRemoved=!snapAnnotationPoint({x:20,y:22},true,false).snapped;state.tool='text';state.assist.batchText=false;finishTextEditing();const textReturnsToSelect=state.tool==='select';const expandedSnapRange=connectionRadius()*state.viewport.zoom>=26;const rect=canvas.getBoundingClientRect(),beforeX=state.viewport.x;state.interaction={kind:'right-pan-pending',screen:{x:10,y:10},startScreen:{x:10,y:10},startedAt:0};movePointer({clientX:rect.left+42,clientY:rect.top+10});const rightPanOk=state.interaction.kind==='right-pan'&&state.viewport.x>beforeX+30&&state.suppressContextOnce;
      const exportBounds=documentContentBounds(),exportSvg=exportBounds?croppedSvgText(exportBounds):'',exportJpeg=exportBounds?croppedJpegData(exportBounds):'';const exportBoundsOk=Boolean(exportBounds&&exportBounds.x2>exportBounds.x1&&exportBounds.y2>exportBounds.y1),exportSvgOk=exportSvg.startsWith('<?xml')&&exportSvg.includes('<svg')&&exportSvg.includes('viewBox='),exportJpegOk=exportJpeg.startsWith('data:image/jpeg;base64,');
      return{...doubleBondChecks,legacyGraphicPlaceholder:normalizeProjectDecorations([{id:'old',type:'orbital',x:3,y:4}])[0].type==='text',templateAnchor:left===100&&geometry.atoms.length===6&&geometry.bonds.length===5,benzenePreviewInside,selectAllOk,clipboardOk,endpointMergeOk,guideOk,expandedSnapRange,textWaitsForCanvas,textPlacementOpensEditor,arrowSnapRemoved,textReturnsToSelect,rightPanOk,exportBoundsOk,exportSvgOk,exportJpegOk};
    }finally{state.atoms=backup.atoms;state.bonds=backup.bonds;state.decorations=backup.decorations;state.selected=backup.selected;state.tool=backup.tool;state.bondOrder=backup.bondOrder;state.bondStyle=backup.bondStyle;state.template=backup.template;state.text=backup.text;state.assist=backup.assist;state.history=backup.history;state.historyIndex=backup.historyIndex;state.dirty=backup.dirty;state.clipboard=backup.clipboard;state.pasteSerial=backup.pasteSerial;state.editingTextId=backup.editingTextId;state.editingAtomId=backup.editingAtomId;state.viewport=backup.viewport;state.interaction=backup.interaction;state.suppressContextOnce=backup.suppressContextOnce;textPopover.hidden=true;syncAssistControls();render();}
  }
  function prepareSmokeVisual(){state.atoms=[];state.bonds=[];state.decorations=[];clearSelection();state.history=[];state.historyIndex=-1;state.viewport={x:state.canvas.width/2,y:state.canvas.height/2,zoom:1};state.template='ethyl-acetate';addTemplate({x:-150,y:-5});state.decorations.push({id:uid('dec'),type:'bracket',x1:-160,y1:-52,x2:-56,y2:12,style:'square',label:''},{id:uid('dec'),type:'arrow',points:[{x:-130,y:72},{x:-25,y:72}],pathMode:'straight',lineStyle:'solid',headStyle:'full'},{id:uid('dec'),type:'text',x:-77.5,y:57,value:'Δ',size:12,color:'#111111',textAlign:'center',textBaseline:'middle'},{id:uid('dec'),type:'mark',x:82,y:52,style:'dot'},{id:uid('dec'),type:'charge',x:102,y:52,value:'plus',style:'circled-plus'});state.tool='template';state.template='benzene';state.cursor={x:55,y:-35};state.pointerInside=true;render();}
  function prepareSmokeTextVisual(){state.atoms=[];state.bonds=[];state.decorations=[];clearSelection();state.history=[];state.historyIndex=-1;state.viewport={x:state.canvas.width/2,y:state.canvas.height/2,zoom:1};setTool('text',document.querySelector('.tool[data-tool="text"]'));addText({x:0,y:0},true,null);render();}
  function command(action){hideMenu();if(action==='new')newProject();if(action==='open')openProject();if(action==='save')saveProject();if(action==='select-all')selectAll();if(action==='copy')copySelection();if(action==='cut')cutSelection();if(action==='paste')pasteSelection();if(action==='delete-all'){if(window.confirm('确定清空当前画布中的全部对象吗？')){state.atoms=[];state.bonds=[];state.decorations=[];clearSelection();pushHistory();render();showToast('当前画布已清空');}}if(action==='export-image')exportImage('choose');if(action==='export-jpeg')exportImage('jpeg');if(action==='export-svg')exportImage('svg');}
  function hideMenu(){document.getElementById('main-menu').hidden=true;}
  function displayUpdateSettings(settings){
    const enabled=Boolean(settings.enabled),available=settings.available!==false;
    const toggle=document.getElementById('auto-update-toggle'),check=document.querySelector('[data-command="check-updates"]');
    toggle.setAttribute('aria-checked',String(enabled));toggle.disabled=!available;check.disabled=!available;
    document.getElementById('auto-update-value').textContent=available?(enabled?'已开启':'已关闭'):'源码构建';
    if(!available){document.querySelector('.title-version span').textContent='Source';document.getElementById('update-menu-status').textContent='源码构建不接入官方更新，可自行重新编译';}
  }
  document.querySelector('[data-command="check-updates"]').addEventListener('click',()=>window.nadraw.checkUpdates().catch((error)=>showToast(error.message)));
  document.getElementById('auto-update-toggle').addEventListener('click',async()=>{try{const enabled=document.getElementById('auto-update-toggle').getAttribute('aria-checked')!=='true';displayUpdateSettings(await window.nadraw.setAutoUpdates(enabled));document.getElementById('update-menu-status').textContent=enabled?'启动时及运行期间自动检查':'已关闭自动检查，可手动检查更新';}catch(error){showToast(error.message);}});
  window.nadraw.getUpdateSettings().then(displayUpdateSettings).catch(()=>{});
  window.nadraw.onUpdateStatus((status)=>{document.getElementById('update-menu-status').textContent=status.message;if(status.state==='ready')showToast(status.message);});
  window.nadrawConfirmClose=()=>{syncActiveDocument();return !documentWorkspace.documents.some((document)=>document.dirty)||window.confirm('有尚未保存的工程。确定退出吗？\n请取消退出并保存，以保留本次绘图。');};
  function checkCloseProtection(){const originalConfirm=window.confirm,originalDirty=state.dirty;try{state.dirty=true;window.confirm=()=>false;const cancelBlocks=!window.nadrawConfirmClose();window.confirm=()=>true;return cancelBlocks&&window.nadrawConfirmClose();}finally{window.confirm=originalConfirm;state.dirty=originalDirty;syncActiveDocument();}}
  function zoomAt(factor,screen={x:state.canvas.width/2,y:state.canvas.height/2}){const world=toWorld(screen);state.viewport.zoom=clamp(state.viewport.zoom*factor,.25,4);state.viewport.x=screen.x-world.x*state.viewport.zoom;state.viewport.y=screen.y-world.y*state.viewport.zoom;render();}

  function setupPagedPanels(){
    document.querySelectorAll('.popup-card').forEach((panel)=>{
      const options=panel.querySelector('.paged-options');const pager=panel.querySelector('.choice-pager');if(!options||!pager)return;
      const items=[...options.children].filter((item)=>item.tagName==='BUTTON');const pageSize=Math.max(1,Number(options.dataset.pageSize)||6);const pageCount=Math.max(1,Math.ceil(items.length/pageSize));let page=0;
      const previous=pager.querySelector('[data-page-prev]');const next=pager.querySelector('[data-page-next]');const label=pager.querySelector('[data-page-label]');
      const showPage=()=>{items.forEach((item,index)=>{item.hidden=index<page*pageSize||index>=(page+1)*pageSize;});label.textContent=`${page+1} / ${pageCount}`;previous.disabled=page===0;next.disabled=page===pageCount-1;};
      previous.addEventListener('click',()=>{page=Math.max(0,page-1);showPage();});next.addEventListener('click',()=>{page=Math.min(pageCount-1,page+1);showPage();});showPage();
    });
  }

  const periodicRows=[
    [[1,'H',1],[2,'He',18]],[[3,'Li',1],[4,'Be',2],[5,'B',13],[6,'C',14],[7,'N',15],[8,'O',16],[9,'F',17],[10,'Ne',18]],[[11,'Na',1],[12,'Mg',2],[13,'Al',13],[14,'Si',14],[15,'P',15],[16,'S',16],[17,'Cl',17],[18,'Ar',18]],[[19,'K',1],[20,'Ca',2],[21,'Sc',3],[22,'Ti',4],[23,'V',5],[24,'Cr',6],[25,'Mn',7],[26,'Fe',8],[27,'Co',9],[28,'Ni',10],[29,'Cu',11],[30,'Zn',12],[31,'Ga',13],[32,'Ge',14],[33,'As',15],[34,'Se',16],[35,'Br',17],[36,'Kr',18]],[[37,'Rb',1],[38,'Sr',2],[39,'Y',3],[40,'Zr',4],[41,'Nb',5],[42,'Mo',6],[43,'Tc',7],[44,'Ru',8],[45,'Rh',9],[46,'Pd',10],[47,'Ag',11],[48,'Cd',12],[49,'In',13],[50,'Sn',14],[51,'Sb',15],[52,'Te',16],[53,'I',17],[54,'Xe',18]],[[55,'Cs',1],[56,'Ba',2],[72,'Hf',4],[73,'Ta',5],[74,'W',6],[75,'Re',7],[76,'Os',8],[77,'Ir',9],[78,'Pt',10],[79,'Au',11],[80,'Hg',12],[81,'Tl',13],[82,'Pb',14],[83,'Bi',15],[84,'Po',16],[85,'At',17],[86,'Rn',18]],[[57,'La',3],[58,'Ce',4],[59,'Pr',5],[60,'Nd',6],[61,'Pm',7],[62,'Sm',8],[63,'Eu',9],[64,'Gd',10],[65,'Tb',11],[66,'Dy',12],[67,'Ho',13],[68,'Er',14],[69,'Tm',15],[70,'Yb',16],[71,'Lu',17]],[[89,'Ac',3],[90,'Th',4],[91,'Pa',5],[92,'U',6],[93,'Np',7],[94,'Pu',8],[95,'Am',9],[96,'Cm',10],[97,'Bk',11],[98,'Cf',12],[99,'Es',13],[100,'Fm',14],[101,'Md',15],[102,'No',16],[103,'Lr',17]]
  ];
  function buildPeriodicTable(){const grid=document.getElementById('periodic-grid');grid.innerHTML='';periodicRows.forEach((row,rowIndex)=>row.forEach(([n,symbol,col])=>{const button=document.createElement('button');button.style.gridColumn=String(col);button.style.gridRow=String(rowIndex+1);button.dataset.element=symbol;button.innerHTML=`<small>${n}</small>${symbol}`;button.addEventListener('click',()=>{setElement(symbol);periodicPanel.hidden=true;});grid.appendChild(button);}));}

  document.querySelectorAll('.tool').forEach((button)=>{
    button.addEventListener('click',()=>{if(button.dataset.order){state.bondOrder=Number(button.dataset.order);state.bondStyle=button.dataset.style||'normal';}else if(button.dataset.style&&button.dataset.tool==='bond'){state.bondOrder=1;state.bondStyle=button.dataset.style;}if(button.dataset.template)state.template=button.dataset.template;setTool(button.dataset.tool,button);});
    button.addEventListener('contextmenu',(event)=>{const panel=({arrow:arrowPopover,template:templatePopover,charge:chargePopover,bracket:bracketPopover,mark:markPopover})[button.dataset.tool];if(!panel)return;event.preventDefault();event.stopPropagation();openPopup(panel);});
  });
  document.querySelectorAll('.element-tool[data-element]').forEach((button)=>button.addEventListener('click',()=>setElement(button.dataset.element)));
  document.querySelectorAll('[data-arrow-line]').forEach((button)=>button.addEventListener('click',()=>{state.arrow.line=button.dataset.arrowLine;document.querySelectorAll('[data-arrow-line]').forEach((node)=>node.classList.toggle('active',node===button));setTool('arrow',document.getElementById('arrow-tool'));}));
  document.querySelectorAll('[data-arrow-mode]').forEach((button)=>button.addEventListener('click',()=>{state.arrow.mode=button.dataset.arrowMode;state.arrowDraft=null;document.querySelectorAll('[data-arrow-mode]').forEach((node)=>node.classList.toggle('active',node===button));setTool('arrow',document.getElementById('arrow-tool'));}));
  document.querySelectorAll('[data-arrow-head]').forEach((button)=>button.addEventListener('click',()=>{state.arrow.head=button.dataset.arrowHead;document.querySelectorAll('[data-arrow-head]').forEach((node)=>node.classList.toggle('active',node===button));setTool('arrow',document.getElementById('arrow-tool'));}));
  document.getElementById('periodic-open').addEventListener('click',()=>{periodicPanel.hidden=!periodicPanel.hidden;});document.getElementById('periodic-close').addEventListener('click',()=>{periodicPanel.hidden=true;});
  document.getElementById('menu-button').addEventListener('click',()=>{const menu=document.getElementById('main-menu');menu.hidden=!menu.hidden;});document.querySelectorAll('[data-command]').forEach((button)=>button.addEventListener('click',()=>command(button.dataset.command)));
  document.getElementById('undo').addEventListener('click',undo);document.getElementById('redo').addEventListener('click',redo);document.getElementById('eraser').addEventListener('click',deleteSelection);document.getElementById('new-document').addEventListener('click',newProject);
  document.getElementById('document-tab-list').addEventListener('click',(event)=>{const close=event.target.closest('[data-document-close]');if(close){event.stopPropagation();closeDocument(close.dataset.documentClose);return;}const tab=event.target.closest('[data-document-id]');if(tab)switchDocument(tab.dataset.documentId);});
  document.getElementById('grid-toggle').addEventListener('click',()=>{state.grid=!state.grid;pushHistory();render();});document.getElementById('bond-length').addEventListener('change',(event)=>changeBondLength(event.target.value));
  document.getElementById('zoom-select').addEventListener('change',(event)=>{const wanted=Number(event.target.value);zoomAt(wanted/state.viewport.zoom);});document.getElementById('zoom-in').addEventListener('click',()=>zoomAt(1.2));document.getElementById('zoom-out').addEventListener('click',()=>zoomAt(1/1.2));
  document.getElementById('tutorial-toggle').addEventListener('click',()=>{tutorialOverlay.hidden?openTutorial():closeTutorial();});document.getElementById('tutorial-close').addEventListener('click',closeTutorial);document.getElementById('tutorial-prev').addEventListener('click',()=>stepTutorial(-1));document.getElementById('tutorial-next').addEventListener('click',()=>stepTutorial(1));tutorialNavButtons.forEach((button)=>button.addEventListener('click',()=>showTutorialPage(button.dataset.tutorialTarget)));tutorialOverlay.addEventListener('pointerdown',(event)=>{if(event.target===tutorialOverlay)closeTutorial();});
  document.getElementById('assist-toggle').addEventListener('click',()=>{closeTutorial();assistPanel.hidden=!assistPanel.hidden;document.getElementById('assist-toggle').classList.toggle('open',!assistPanel.hidden);});document.getElementById('assist-close').addEventListener('click',()=>{assistPanel.hidden=true;document.getElementById('assist-toggle').classList.remove('open');});document.querySelectorAll('[data-assist]').forEach((input)=>input.addEventListener('change',()=>{state.assist[input.dataset.assist]=input.checked;pushHistory();render();}));
  document.querySelectorAll('[data-template-choice]').forEach((button)=>button.addEventListener('click',()=>{state.template=button.dataset.templateChoice;setTool('template',document.querySelector(`.tool[data-template="${state.template}"]`)||null);templatePopover.hidden=true;}));
  document.querySelectorAll('[data-charge]').forEach((button)=>button.addEventListener('click',()=>{state.chargeStyle=button.dataset.charge;setTool('charge',document.querySelector('.tool[data-tool="charge"]'));chargePopover.hidden=true;}));
  document.querySelectorAll('[data-bracket]').forEach((button)=>button.addEventListener('click',()=>{state.bracket=button.dataset.bracket;setTool('bracket',document.querySelector('.tool[data-tool="bracket"]'));bracketPopover.hidden=true;}));
  document.querySelectorAll('[data-mark]').forEach((button)=>button.addEventListener('click',()=>{state.mark=button.dataset.mark;setTool('mark',document.querySelector('.tool[data-tool="mark"]'));markPopover.hidden=true;}));
  document.querySelectorAll('[data-close-popup]').forEach((button)=>button.addEventListener('click',()=>{if(button.dataset.closePopup==='text-popover')finishTextEditing();else document.getElementById(button.dataset.closePopup).hidden=true;}));
  document.getElementById('text-input').addEventListener('input',updateEditedText);document.getElementById('font-size').addEventListener('change',(event)=>{state.text.size=clamp(Number(event.target.value)||14,10,64);updateEditedText();});document.getElementById('font-color').addEventListener('input',(event)=>{state.text.color=event.target.value;updateEditedText();});document.querySelectorAll('[data-text-format]').forEach((button)=>button.addEventListener('click',()=>applyTextFormat(button.dataset.textFormat)));document.querySelectorAll('[data-symbol]').forEach((button)=>button.addEventListener('click',()=>insertTextSymbol(button.dataset.symbol)));document.getElementById('text-done').addEventListener('click',finishTextEditing);
  document.getElementById('rail-collapse').addEventListener('click',()=>{document.getElementById('tool-rail').classList.toggle('collapsed');requestAnimationFrame(resizeCanvas);});
  canvas.addEventListener('pointerenter',()=>{state.pointerInside=true;render();});canvas.addEventListener('pointerleave',()=>{state.pointerInside=false;if(!state.interaction)render();});canvas.addEventListener('pointerdown',beginPointer);canvas.addEventListener('pointermove',movePointer);canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('contextmenu',showContext);canvas.addEventListener('dblclick',editCanvasText);canvas.addEventListener('wheel',(event)=>{event.preventDefault();zoomAt(Math.exp(-event.deltaY*.001),screenPoint(event));},{passive:false});
  document.addEventListener('pointerdown',(event)=>{if(!contextMenu.contains(event.target))hideContext();if(!event.target.closest('.menu-root'))hideMenu();if(!event.target.closest('.assist-panel')&&!event.target.closest('#assist-toggle')){assistPanel.hidden=true;document.getElementById('assist-toggle').classList.remove('open');}});
  window.addEventListener('keydown',(event)=>{if(!tutorialOverlay.hidden&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeTutorial();}},true);
  window.addEventListener('keydown',(event)=>{const writing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName),modified=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();if(!writing&&event.key==='Enter'&&state.arrowDraft?.mode==='polyline'){event.preventDefault();commitArrowDraft();return;}if(!writing&&event.key==='Escape'&&state.arrowDraft){event.preventDefault();state.arrowDraft=null;render();return;}if(event.code==='Space'&&!writing){state.spaceDown=true;event.preventDefault();}if(modified&&!writing&&key==='a'){event.preventDefault();selectAll();}if(modified&&!writing&&key==='c'){event.preventDefault();copySelection();}if(modified&&!writing&&key==='x'){event.preventDefault();cutSelection();}if(modified&&!writing&&key==='v'){event.preventDefault();pasteSelection();}if(modified&&key==='n'){event.preventDefault();newProject();}if(modified&&key==='s'){event.preventDefault();saveProject();}if(modified&&key==='o'){event.preventDefault();openProject();}if(modified&&key==='e'){event.preventDefault();exportImage('choose');}if(modified&&event.shiftKey&&event.key==='Delete'){event.preventDefault();command('delete-all');}if(modified&&key==='z'){event.preventDefault();event.shiftKey?redo():undo();}if(modified&&key==='y'){event.preventDefault();redo();}if((event.key==='Delete'||event.key==='Backspace')&&!writing)deleteSelection();if(!writing&&!modified&&!event.altKey){const k=event.key.toLowerCase();if(k==='q')setTool('select');if(k==='t')setTool('text');if(k==='c')setElement('C');if(k==='n')setElement('N');if(k==='o')setElement('O');if(['1','2','3'].includes(k)){state.bondOrder=Number(k);state.bondStyle='normal';setTool('bond');}}});window.addEventListener('keyup',(event)=>{if(event.code==='Space')state.spaceDown=false;});
  window.addEventListener('resize',resizeCanvas);new ResizeObserver(resizeCanvas).observe(stage);
  if(new URLSearchParams(window.location.search).has('smoke'))window.__nadrawSmoke={runCoreChecks:runSmokeCoreChecks,checkCloseProtection,prepareVisual:prepareSmokeVisual,prepareTextVisual:prepareSmokeTextVisual,prepareDoubleBondVisual:prepareSmokeDoubleBondVisual,documentSummary:()=>{syncActiveDocument();return{activeId:documentWorkspace.activeId,documents:documentWorkspace.documents.map((document)=>({id:document.id,name:document.fileName.replace(/\.(?:nad|chd)$/i,''),objects:document.atoms.length+document.bonds.length+document.decorations.length}))};}};
  window.nadraw.onOpenProject?.(loadProjectResult);
  buildPeriodicTable();setupPagedPanels();syncAssistControls();requestAnimationFrame(resizeCanvas);
})();
