// 负责把 Monaco 中的代码交给已有 /api/run 接口。
// main.js 创建 editor 后调用 setupRun(editor)。
export function setupRun(editor) {
  const ids = ['run-code', 'stdin', 'run-status', 'stdout', 'stderr'];
  const nodes = ids.map((id) => document.getElementById(id));
  const missing = ids.filter((id, index) => !nodes[index]);
  if (missing.length) {
    throw new Error('index.html 缺少运行区域：' + missing.join(', '));
  }

  const [button, stdin, status, stdout, stderr] = nodes;
  if (button.dataset.runBound === 'true') return;
  button.dataset.runBound = 'true';
  let running = false;

  button.addEventListener('click', async () => {
    if (running) return;
    const code = editor.getValue();
    if (!code.trim()) {
      status.textContent = '请先输入代码';
      return;
    }

    const payload = {
      files: [{ name: 'main.cpp', content: code }],
      stdin: stdin.value
    };
    running = true;
    button.disabled = true;
    stdin.disabled = true;
    editor.updateOptions({ readOnly: true });
    status.textContent = '正在编译运行……';
    stdout.textContent = '';
    stderr.textContent = '';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${response.status}：服务未返回 JSON，请检查 Flask 和 Vite 转发配置`);
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}：${data?.message || data?.error || '请求失败'}`);
      }
      if (!data || typeof data.stdout !== 'string' || typeof data.stderr !== 'string' ||
          !Number.isInteger(data.exitCode) || !Number.isFinite(data.time) ||
          !['compile', 'run'].includes(data.stage)) {
        throw new Error('返回结果不符合接口约定');
      }

      stdout.textContent = data.stdout || '（无标准输出）';
      stderr.textContent = data.stderr || '（无错误信息）';
      const phase = data.stage === 'compile' ? '编译' : '运行';
      const outcome = data.exitCode === 0 ? '成功' : data.exitCode === 124 ? '超时' : '失败';
      status.textContent = `${phase}${outcome}；退出码：${data.exitCode}；耗时：${data.time} 毫秒`;
    } catch (error) {
      status.textContent = '请求未完成';
      stderr.textContent = error.name === 'AbortError'
        ? '等待超过 30 秒。浏览器停止等待不等于服务器任务立即取消，请勿连续重复提交。'
        : error.message;
    } finally {
      clearTimeout(timer);
      button.disabled = false;
      stdin.disabled = false;
      editor.updateOptions({ readOnly: false });
      running = false;
    }
  });
}
