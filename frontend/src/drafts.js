// 浏览器草稿与 Git、服务器文件互相独立。只操作本项目自己的存储键。
export const DRAFT_KEY = 'online-lab:draft:v1';

export function parseDraft(text) {
  if (typeof text !== 'string' || text.length > 2000000) throw new Error('草稿过大或格式不正确');
  const value = JSON.parse(text);
  if (!value || value.version !== 1 || !Array.isArray(value.files) ||
      value.files.length < 1 || value.files.length > 10 || typeof value.stdin !== 'string') {
    throw new Error('草稿格式不正确');
  }
  const names = new Set();
  const encoder = new TextEncoder();
  let total = 0;
  const files = value.files.map(file => {
    if (!file || typeof file.name !== 'string' || typeof file.content !== 'string' ||
        !/^[A-Za-z0-9_.-]{1,128}$/.test(file.name) || !/\.(cpp|h|hpp)$/.test(file.name) || names.has(file.name)) {
      throw new Error('草稿文件名不合法或重复');
    }
    names.add(file.name);
    const size = encoder.encode(file.content).length;
    total += size;
    if (size > 100000 || total > 500000) throw new Error('代码超过单文件100KB或合计500KB的限制');
    return { name: file.name, content: file.content };
  });
  if (!files.some(file => file.name.endsWith('.cpp')) || !names.has(value.activeFile) ||
      encoder.encode(value.stdin).length > 100000) throw new Error('草稿文件选择或标准输入不合法');
  return { version: 1, files, activeFile: value.activeFile, stdin: value.stdin };
}

export function setupDraft(fileManager) {
  const controls = document.getElementById('file-controls');
  const stdin = document.getElementById('stdin');
  if (!controls || !stdin) throw new Error('缺少文件操作区或标准输入框');
  const status = document.createElement('p');
  status.id = 'draft-status';
  status.setAttribute('role', 'status');
  const reset = document.createElement('button');
  reset.id = 'reset-draft';
  reset.type = 'button';
  reset.textContent = '重置示例';
  controls.append(reset, status);

  const initial = { version: 1, ...fileManager.getSnapshot(), stdin: stdin.value };
  let key = DRAFT_KEY;
  let storage;
  let timer;
  let dirty = false;
  let paused = false;
  let applying = false;
  let lastSaved = null;

  try {
    storage = window.localStorage;
    const text = storage.getItem(key);
    if (text !== null) {
      const draft = parseDraft(text);
      fileManager.restoreSnapshot(draft);
      stdin.value = draft.stdin;
      lastSaved = text;
      status.textContent = '已恢复本浏览器的草稿。';
    } else {
      status.textContent = '修改代码或输入后，将自动保存到本浏览器。';
    }
  } catch (error) {
    paused = true;
    status.textContent = `草稿无法读取，自动保存已暂停：${error.message}。旧草稿未被覆盖；重置示例会替换它。`;
  }

  function saveNow() {
    clearTimeout(timer);
    if (paused || !dirty) return;
    try {
      const draft = parseDraft(JSON.stringify({ version: 1, ...fileManager.getSnapshot(), stdin: stdin.value }));
      const text = JSON.stringify(draft);
      if (storage.getItem(key) !== lastSaved) {
        paused = true;
        throw new Error('本题草稿已在其他标签页更改');
      }
      if (text !== lastSaved) storage.setItem(key, text);
      lastSaved = text;
      dirty = false;
      status.textContent = '草稿已保存到本浏览器。';
    } catch (error) {
      status.textContent = `草稿未保存：${error.message}。请先复制重要代码留存。`;
    }
  }

  function schedule() {
    if (applying) return;
    dirty = true;
    if (paused) return;
    clearTimeout(timer);
    status.textContent = '草稿待保存……';
    timer = setTimeout(saveNow, 500);
  }

  fileManager.onChange(schedule);
  stdin.addEventListener('input', schedule);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    clearTimeout(timer);
    paused = true;
    status.textContent = '其他同地址标签页修改了草稿，自动保存已暂停。请先复制当前重要代码，再刷新读取最新草稿。';
  });

  reset.addEventListener('click', () => {
    if (!fileManager.canEdit()) return;
    if (!window.confirm('恢复初始 main.cpp 和标准输入？仅替换当前练习的文件和标准输入。')) return;
    clearTimeout(timer);
    try {
      // 先确认能保存，失败时保留页面当前内容。
      const text = JSON.stringify(initial);
      storage = window.localStorage;
      storage.setItem(key, text);
      applying = true;
      fileManager.restoreSnapshot(initial);
      stdin.value = initial.stdin;
      for (const id of ['stdout', 'stderr']) {
        const node = document.getElementById(id);
        if (node) node.textContent = '';
      }
      const runStatus = document.getElementById('run-status');
      if (runStatus) runStatus.textContent = '等待运行';
      paused = false;
      dirty = false;
      lastSaved = text;
      status.textContent = '已恢复初始示例，并保存到本浏览器。';
    } catch (error) {
      status.textContent = `重置未完成：${error.message}。请先复制重要代码留存。`;
    } finally {
      applying = false;
    }
  });

  function switchProblem(id) {
    const nextKey = id ? DRAFT_KEY + ':' + id : DRAFT_KEY;
    if (nextKey === key) return;
    if (!fileManager.canEdit()) throw new Error('请等运行结束后再切题');
    saveNow();
    if (dirty) throw new Error('当前草稿未保存，请先复制代码再切题');
    storage = window.localStorage;
    const text = storage.getItem(nextKey);
    const next = text === null ? initial : parseDraft(text);
    applying = true;
    try {
      fileManager.restoreSnapshot(next);
      stdin.value = next.stdin;
      key = nextKey;
      paused = false;
      lastSaved = text;
      for (const id of ['stdout', 'stderr']) {
        document.getElementById(id).textContent = '';
      }
      document.getElementById('run-status').textContent = '等待运行';
      status.textContent = text === null ? '新练习，修改后自动保存。' : '已恢复此练习的草稿。';
    } finally {
      applying = false;
    }
  }

  return { saveNow, switchProblem };
}
