async function requestJson(path, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
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
  const list = document.getElementById('problem-cases');
  const template = document.getElementById('problem-case-template');
  const add = document.getElementById('case-add');
  const status = document.getElementById('publish-status');

  function updateCases() {
    const count = list.children.length;
    add.disabled = count >= 10;
    Array.from(list.children).forEach((row, index) => {
      row.querySelector('legend').textContent = `公开用例 ${index + 1}`;
      row.querySelector('.case-remove').disabled = count <= 1;
    });
  }

  function addCase() {
    if (list.children.length >= 10) return;
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('.case-remove').addEventListener('click', () => {
      if (list.children.length <= 1) return;
      row.remove();
      updateCases();
    });
    list.append(row);
    updateCases();
  }

  addCase();
  add.addEventListener('click', addCase);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const { token, title, description } = form.elements;
    const payload = {
      title: title.value,
      description: description.value,
      cases: Array.from(list.children, row => ({
        stdin: row.querySelector('.case-stdin').value,
        expectedOutput: row.querySelector('.case-expected').value
      }))
    };
    fields.disabled = true;
    status.textContent = '正在发布……';
    try {
      const problem = await requestJson('/api/problems', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.value.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      status.textContent = `已发布「${problem.title}」`;
      form.reset();
      list.replaceChildren();
      addCase();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      fields.disabled = false;
      token.value = '';
    }
  });
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
    setupTeacherProblems();
    accessForm.hidden = true;
    teacherView.hidden = false;
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
