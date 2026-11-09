// 每个代码文件使用独立的 Monaco model，切换时保留内容和撤销历史。
export function setupFiles(editor, monaco) {
  const select = document.getElementById('file-select');
  const input = document.getElementById('new-file-name');
  const add = document.getElementById('add-file');
  const remove = document.getElementById('delete-file');
  if (!select || !input || !add || !remove) {
    throw new Error('index.html 缺少文件操作区域');
  }

  const initialModel = editor.getModel();
  if (!initialModel) throw new Error('请在创建 Monaco 编辑器后调用 setupFiles');
  const files = new Map([
    ['main.cpp', { model: initialModel, view: null }]
  ]);
  let current = 'main.cpp';

  function isLocked() {
    if (!editor.getOption(monaco.editor.EditorOption.readOnly)) return false;
    window.alert('程序运行期间请等待结果，再操作文件。');
    return true;
  }

  function render() {
    select.replaceChildren();
    for (const name of files.keys()) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.append(option);
    }
    select.value = current;
    remove.disabled = files.size === 1;
  }

  function switchTo(name) {
    if (!files.has(name) || name === current) return;
    files.get(current).view = editor.saveViewState();
    current = name;
    const file = files.get(current);
    editor.setModel(file.model);
    if (file.view) editor.restoreViewState(file.view);
    select.value = current;
    editor.focus();
  }

  select.addEventListener('change', () => {
    if (isLocked()) {
      select.value = current;
      return;
    }
    switchTo(select.value);
  });

  add.addEventListener('click', () => {
    if (isLocked()) return;
    const name = input.value.trim();
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name) ||
        !/\.(cpp|h|hpp)$/.test(name)) {
      window.alert('文件名使用英文字母、数字、下划线、横线或点，并以 .cpp、.h 或 .hpp 结尾。不能包含路径。');
      return;
    }
    if (files.has(name)) {
      window.alert('文件名已存在，请换一个名称。');
      return;
    }
    if (files.size >= 10) {
      window.alert('最多添加 10 个文件。');
      return;
    }
    files.set(name, { model: monaco.editor.createModel('', 'cpp'), view: null });
    switchTo(name);
    input.value = '';
    render();
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
    files.delete(deletedName);
    deletedModel.dispose();
    render();
  });

  render();
  return {
    getFiles() {
      return [...files].map(([name, file]) => ({
        name,
        content: file.model.getValue()
      }));
    }
  };
}
