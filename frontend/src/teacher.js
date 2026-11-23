async function requestJson(path, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { cache: 'no-store', ...options, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || `请求失败（HTTP ${response.status}）`);
    }
    if (!data) throw new Error('服务没有返回数据');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超过 10 秒，请刷新后确认结果');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function setupTeacherProblems() {
  const form = document.getElementById('problem-publish');
  const fields = document.getElementById('problem-fields');
  const { token, title, description } = form.elements;
  const cases = document.getElementById('problem-cases');
  const template = document.getElementById('problem-case-template');
  const add = document.getElementById('case-add');
  const status = document.getElementById('publish-status');
  const editorTitle = document.getElementById('problem-editor-title');
  const save = document.getElementById('problem-save');
  const cancelEdit = document.getElementById('problem-cancel-edit');

  const manageFields = document.getElementById('problem-manage-fields');
  const refresh = document.getElementById('teacher-problems-refresh');
  const select = document.getElementById('teacher-problem-select');
  const edit = document.getElementById('problem-edit');
  const remove = document.getElementById('problem-remove');
  const manageStatus = document.getElementById('problem-manage-status');
  const deleteDialog = document.getElementById('problem-delete-dialog');
  const deleteForm = document.getElementById('problem-delete');
  const deleteFields = document.getElementById('problem-delete-fields');
  const deleteName = document.getElementById('problem-delete-name');
  const deleteStatus = document.getElementById('problem-delete-status');
  const cancelDelete = document.getElementById('problem-cancel-delete');
  let editingId = '';

  // 复用验证口令后返回的表单，保留原有字段和校验。
  const list = document.createElement('div');
  list.className = 'problem-list';
  select.closest('label').replaceWith(list);
  const create = document.createElement('button');
  create.type = 'button';
  create.id = 'problem-new';
  create.textContent = '＋ 新建题目';
  list.before(create);
  edit.remove();
  refresh.textContent = '↻';
  refresh.setAttribute('aria-label', '刷新题目');
  refresh.title = '刷新题目';
  manageFields.querySelector('legend').hidden = true;
  fields.querySelector('legend').hidden = true;
  form.prepend(editorTitle);
  fields.prepend(remove);
  remove.textContent = '删除题目';

  const caseHeading = document.createElement('div');
  caseHeading.className = 'case-heading';
  const caseTitle = document.createElement('h3');
  caseTitle.textContent = '公开用例';
  cases.before(caseHeading);
  caseHeading.append(caseTitle, add);
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  fields.append(actions);
  actions.append(token.closest('label'), cancelEdit, save);

  function updateCases() {
    const count = cases.children.length;
    add.disabled = count >= 10;
    Array.from(cases.children).forEach((row, index) => {
      row.querySelector('legend').textContent = `公开用例 ${index + 1}`;
      row.querySelector('.case-remove').disabled = count <= 1;
    });
  }

  function addCase(item = { stdin: '', expectedOutput: '' }) {
    if (cases.children.length >= 10) return;
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('.case-stdin').value = item.stdin;
    row.querySelector('.case-expected').value = item.expectedOutput;
    row.querySelector('.case-remove').addEventListener('click', () => {
      if (cases.children.length <= 1) return;
      row.remove();
      updateCases();
    });
    cases.append(row);
    updateCases();
  }

  function showEditor(problem) {
    editingId = problem?.id ?? '';
    form.reset();
    title.value = problem?.title ?? '';
    description.value = problem?.description ?? '';
    cases.replaceChildren();
    if (problem) {
      problem.cases.forEach(addCase);
    } else {
      addCase();
    }
    editorTitle.textContent = problem ? '编辑课堂题目' : '发布课堂题目';
    save.textContent = problem ? '保存修改' : '发布题目';
    cancelEdit.hidden = !problem;
    remove.hidden = !problem;
    remove.disabled = !problem;
    updateSelection();
    status.textContent = '';
  }

  function readEditor() {
    return {
      title: title.value,
      description: description.value,
      cases: Array.from(cases.children, row => ({
        stdin: row.querySelector('.case-stdin').value,
        expectedOutput: row.querySelector('.case-expected').value
      }))
    };
  }

  function updateSelection() {
    for (const button of list.children) {
      button.setAttribute('aria-pressed', String(button.dataset.id === editingId));
    }
  }

  async function loadProblems() {
    manageStatus.textContent = '正在读取题目……';
    try {
      const data = await requestJson('/api/problems');
      list.replaceChildren();
      for (const item of data.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.id = item.id;
        button.textContent = item.title;
        button.addEventListener('click', () => openProblem(item.id));
        list.append(button);
      }
      updateSelection();
      manageStatus.textContent = data.items.length ? '' : '暂无已发布题目';
    } catch (error) {
      manageStatus.textContent = error.message;
    }
  }

  async function withControlsDisabled(action) {
    fields.disabled = true;
    manageFields.disabled = true;
    deleteFields.disabled = true;
    try {
      return await action();
    } finally {
      fields.disabled = false;
      manageFields.disabled = false;
      deleteFields.disabled = false;
    }
  }

  showEditor();
  add.addEventListener('click', () => addCase());
  function newProblem() {
    showEditor();
    title.focus();
  }
  create.addEventListener('click', newProblem);
  cancelEdit.addEventListener('click', newProblem);
  refresh.addEventListener('click', () => withControlsDisabled(loadProblems));

  async function openProblem(problemId) {
    const loaded = await withControlsDisabled(async () => {
      manageStatus.textContent = '正在读取题目详情……';
      try {
        const problem = await requestJson(`/api/problems/${encodeURIComponent(problemId)}`);
        showEditor(problem);
        manageStatus.textContent = '';
        return true;
      } catch (error) {
        manageStatus.textContent = error.message;
        return false;
      }
    });
    if (loaded) title.focus();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const isEditing = Boolean(editingId);
    const path = isEditing ? `/api/problems/${encodeURIComponent(editingId)}` : '/api/problems';
    const options = {
      method: isEditing ? 'PUT' : 'POST',
      headers: {
        Authorization: `Bearer ${token.value.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(readEditor())
    };
    status.textContent = isEditing ? '正在保存……' : '正在发布……';
    withControlsDisabled(async () => {
      try {
        const problem = await requestJson(path, options);
        showEditor();
        status.textContent = isEditing ? `已保存「${problem.title}」` : `已发布「${problem.title}」`;
        await loadProblems();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        token.value = '';
      }
    });
  });

  remove.addEventListener('click', () => {
    if (!editingId) return;
    deleteName.textContent = list.querySelector('[aria-pressed="true"]')?.textContent ?? title.value;
    deleteStatus.textContent = '';
    deleteForm.reset();
    deleteDialog.showModal();
    deleteForm.elements.token.focus();
  });
  cancelDelete.addEventListener('click', () => deleteDialog.close());
  deleteDialog.addEventListener('close', () => deleteForm.reset());
  deleteDialog.addEventListener('cancel', event => {
    if (deleteFields.disabled) event.preventDefault();
  });
  deleteForm.addEventListener('submit', async event => {
    event.preventDefault();
    const problemId = editingId;
    const problemTitle = deleteName.textContent;
    const deleteToken = deleteForm.elements.token;
    const authorization = `Bearer ${deleteToken.value.trim()}`;
    deleteStatus.textContent = '正在删除……';
    const deleted = await withControlsDisabled(async () => {
      try {
        await requestJson(`/api/problems/${encodeURIComponent(problemId)}`, {
          method: 'DELETE',
          headers: { Authorization: authorization }
        });
        if (editingId === problemId) showEditor();
        await loadProblems();
        deleteDialog.close();
        manageStatus.textContent = `已删除「${problemTitle}」`;
        return true;
      } catch (error) {
        deleteStatus.textContent = error.message;
        return false;
      } finally {
        deleteToken.value = '';
      }
    });
    if (deleted) create.focus();
    else deleteToken.focus();
  });

  document.getElementById('problem-management').hidden = false;
  return withControlsDisabled(loadProblems);
}

const accessForm = document.getElementById('teacher-access');
const accessToken = document.getElementById('teacher-token');
const accessButton = document.getElementById('teacher-open');
const accessStatus = document.getElementById('teacher-access-status');
const teacherView = document.getElementById('teacher-view');

accessForm.addEventListener('submit', async event => {
  event.preventDefault();
  accessToken.disabled = true;
  accessButton.disabled = true;
  accessStatus.textContent = '正在验证……';
  try {
    const data = await requestJson('/api/teacher/form', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken.value.trim()}` }
    });
    teacherView.innerHTML = data.html;
    const loading = setupTeacherProblems();
    accessForm.hidden = true;
    teacherView.hidden = false;
    await loading;
    document.getElementById('problem-publish').elements.title.focus();
  } catch (error) {
    accessStatus.textContent = error.message;
  } finally {
    accessToken.value = '';
    accessToken.disabled = false;
    accessButton.disabled = false;
    if (!accessForm.hidden) accessToken.focus();
  }
});
