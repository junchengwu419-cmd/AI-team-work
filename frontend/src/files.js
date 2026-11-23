// 每个代码文件使用独立的 Monaco model，切换时保留内容和撤销历史。
export function setupFiles(editor, monaco) {
  const tabs = document.getElementById('file-tabs');
  const naming = document.getElementById('file-naming');
  const open = document.getElementById('open-file-name');
  const cancel = document.getElementById('cancel-file-name');
  const message = document.getElementById('file-message');
  const input = document.getElementById('new-file-name');
  const remove = document.getElementById('delete-file');
  if (!tabs || !naming || !open || !cancel || !message || !input || !remove) {
    throw new Error('index.html 缺少文件操作区域');
  }

  const initialModel = editor.getModel();
  if (!initialModel) throw new Error('请在创建 Monaco 编辑器后调用 setupFiles');
  const files = new Map([
    ['main.cpp', { model: initialModel, view: null }]
  ]);
  let current = 'main.cpp';
  const markerOwner = 'online-lab-gcc';
  const subscriptions = new Map();
  const changeListeners = new Set();

  function notifyChange() {
    for (const listener of changeListeners) listener();
  }

  function clearDiagnostics() {
    for (const file of files.values()) {
      monaco.editor.setModelMarkers(file.model, markerOwner, []);
    }
  }

  function watchModel(model) {
    // 任一文件改动都可能改变其他文件的编译结果，清除全部旧标记。
    subscriptions.set(model, model.onDidChangeContent(() => {
      clearDiagnostics();
      notifyChange();
    }));
  }

  function setDiagnostics(items) {
    clearDiagnostics();
    const groups = new Map();
    for (const item of items) {
      if (!files.has(item.name)) continue;
      const model = files.get(item.name).model;
      const position = model.validatePosition(item);
      const maxColumn = model.getLineMaxColumn(position.lineNumber);
      const startColumn = position.column === maxColumn && maxColumn > 1
        ? maxColumn - 1 : position.column;
      const severity = item.kind === 'warning' ? monaco.MarkerSeverity.Warning
        : item.kind === 'note' ? monaco.MarkerSeverity.Info : monaco.MarkerSeverity.Error;
      if (!groups.has(item.name)) groups.set(item.name, []);
      groups.get(item.name).push({
        severity,
        message: item.message,
        source: 'GCC',
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn,
        endColumn: Math.min(maxColumn, startColumn + 1)
      });
    }
    for (const [name, markers] of groups) {
      monaco.editor.setModelMarkers(files.get(name).model, markerOwner, markers);
    }
  }

  watchModel(initialModel);

  function isLocked() {
    if (!editor.getOption(monaco.editor.EditorOption.readOnly)) return false;
    window.alert('程序运行期间请等待结果，再操作文件。');
    return true;
  }

  //根据当前文件列表，动态生成网页上的文件标签按钮，并控制删除按钮是否可用。
  function render() {
    tabs.replaceChildren();
    for (const name of files.keys()) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = name;
      tab.setAttribute('aria-pressed', String(name === current));
      tab.addEventListener('click', () => {
        if (!isLocked()) switchTo(name);
      });
      tabs.append(tab);
    }
    remove.disabled = files.size === 1;
  }

  function switchTo(name) {
    if (!files.has(name) || name === current) return;
    files.get(current).view = editor.saveViewState();
    current = name;
    const file = files.get(current);
    editor.setModel(file.model);
    if (file.view) editor.restoreViewState(file.view);
    render();
    editor.focus();
    notifyChange();
  }

  //主要负责实现文件命名区域的打开、关闭、输入框初始化，以及键盘快捷操作。
  //结合前面的 render() 函数来看，这部分代码进一步完善了文件操作界面：
  //用户可以点击按钮打开文件命名区域，输入新文件名，也可以取消操作或按 Esc 键退出。
  function closeNaming() {
    naming.hidden = true;
    input.value = '';
    message.textContent = '';
    open.setAttribute('aria-expanded', 'false');
  }

  open.addEventListener('click', () => {
    if (isLocked()) return;
    naming.hidden = false;
    open.setAttribute('aria-expanded', 'true');
    input.focus();
  });

  cancel.addEventListener('click', () => {
    closeNaming();
    open.focus();
  });

  naming.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      cancel.click();
    }
  });

  naming.addEventListener('submit', event => {
    event.preventDefault();
    if (isLocked()) return;
    const name = input.value.trim();
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name) ||
        !/\.(cpp|h|hpp)$/.test(name)) {
      message.textContent = '文件名使用英文字母、数字、下划线、横线或点，并以 .cpp、.h 或 .hpp 结尾。不能包含路径。';
      input.focus();
      return;
    }
    if (files.has(name)) {
      message.textContent = '文件名已存在，请换一个名称。';
      input.focus();
      return;
    }
    if (files.size >= 10) {
      message.textContent = '最多添加 10 个文件。';
      input.focus();
      return;
    }
    clearDiagnostics();
    const model = monaco.editor.createModel('', 'cpp');
    watchModel(model);
    files.set(name, { model, view: null });
    closeNaming();
    switchTo(name);
  });

  remove.addEventListener('click', () => {
    if (isLocked() || files.size <= 1) return;
    const otherNames = [...files.keys()].filter((name) => name !== current);
    if (!otherNames.some((name) => name.endsWith('.cpp'))) {
      window.alert('至少需要保留一个 .cpp 文件。');
      return;
    }
    if (!window.confirm(`删除 ${current}？该文件内容和撤销历史将被移除。`)) return;
    const deletedName = current;
    const deletedModel = files.get(deletedName).model;
    switchTo(otherNames[0]);
    subscriptions.get(deletedModel)?.dispose();
    subscriptions.delete(deletedModel);
    files.delete(deletedName);
    deletedModel.dispose();
    clearDiagnostics();
    render();
    notifyChange();
  });

  render();
  return {
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    canEdit() {
      return !isLocked();
    },
    getSnapshot() {
      return {
        files: [...files].map(([name, file]) => ({ name, content: file.model.getValue() })),
        activeFile: current
      };
    },
    restoreSnapshot(snapshot) {
      if (isLocked()) return false;
      const created = new Map();
      try {
        for (const file of snapshot.files) {
          created.set(file.name, { model: monaco.editor.createModel(file.content, 'cpp'), view: null });
        }
        editor.setModel(created.get(snapshot.activeFile).model);
      } catch (error) {
        for (const file of created.values()) file.model.dispose();
        throw error;
      }
      for (const file of files.values()) {
        subscriptions.get(file.model)?.dispose();
        file.model.dispose();
      }
      subscriptions.clear();
      files.clear();
      for (const [name, file] of created) {
        files.set(name, file);
        watchModel(file.model);
      }
      current = snapshot.activeFile;
      render();
      notifyChange();
      return true;
    },
    clearDiagnostics,
    setDiagnostics,
    goTo({ name, lineNumber, column }) {
      if (isLocked()) return;
      if (!files.has(name)) {
        window.alert('该文件已不存在，请重新运行以更新错误信息。');
        return;
      }
      switchTo(name);
      const position = files.get(name).model.validatePosition({ lineNumber, column });
      editor.setPosition(position);
      editor.revealPositionInCenter(position);
      editor.focus();
      document.getElementById('editor').scrollIntoView({ block: 'center' });
    },
    getFiles() {
      return [...files].map(([name, file]) => ({
        name,
        content: file.model.getValue()
      }));
    }
  };
}
