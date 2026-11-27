async function requestJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || `请求失败（HTTP ${response.status}）`);
    }
    if (!data) throw new Error('服务没有返回题目数据');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('读取题目超过 10 秒，请重试');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function setupStudentProblems() {
  const panel = document.getElementById('student-problems');
  const refresh = document.getElementById('problems-refresh');
  const select = document.getElementById('problem-select');
  const detail = document.getElementById('problem-detail');
  const status = document.getElementById('problems-status');
  const cases = document.getElementById('case-select');
  const stdin = document.getElementById('stdin');
  let activeProblem;
  let loaded = false;

  async function loadList() {
    refresh.disabled = true;
    select.disabled = true;
    detail.hidden = true;
    activeProblem = null;
    select.replaceChildren(new Option('请选择题目', ''));
    status.textContent = '正在读取题目……';
    try {
      const data = await requestJson('/api/problems');
      for (const item of data.items) {
        select.add(new Option(item.title, item.id));
      }
      select.disabled = data.items.length === 0;
      status.textContent = data.items.length ? '' : '暂无已发布题目';
      loaded = true;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      refresh.disabled = false;
    }
  }

  function activeCase() {
    return activeProblem?.cases[cases.selectedIndex];
  }

  function showCase() {
    const item = activeCase();
    document.getElementById('case-input').textContent = item?.stdin || '（空）';
    document.getElementById('case-output').textContent = item?.expectedOutput || '（空）';
  }

  panel.addEventListener('toggle', () => {
    if (panel.open && !loaded && !refresh.disabled) loadList();
  });
  refresh.addEventListener('click', loadList);
  select.addEventListener('change', async () => {
    detail.hidden = true;
    activeProblem = null;
    status.textContent = '';
    if (!select.value) return;

    refresh.disabled = true;
    select.disabled = true;
    status.textContent = '正在读取题目详情……';
    try {
      const problem = await requestJson(`/api/problems/${encodeURIComponent(select.value)}`);
      document.getElementById('problem-title').textContent = problem.title;
      document.getElementById('problem-description').textContent = problem.description;
      cases.replaceChildren(...problem.cases.map((_, index) => new Option(`用例 ${index + 1}`)));
      activeProblem = problem;
      showCase();
      detail.hidden = false;
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message;
      select.value = '';
    } finally {
      select.disabled = false;
      refresh.disabled = false;
    }
  });
  cases.addEventListener('change', showCase);
  document.getElementById('case-fill').addEventListener('click', () => {
    if (stdin.disabled) {
      status.textContent = '请等本次运行结束再填入用例';
      return;
    }
    const item = activeCase();
    if (!item) return;
    stdin.value = item.stdin;
    stdin.dispatchEvent(new Event('input', { bubbles: true }));
    status.textContent = '已填入标准输入，点击「运行 C++」试跑';
  });

  return function getCurrentCase() {
    const item = activeCase();
    if (!item) return null;
    return {
      title: activeProblem.title,
      number: cases.selectedIndex + 1,
      stdin: item.stdin,
      expectedOutput: item.expectedOutput
    };
  };
}
