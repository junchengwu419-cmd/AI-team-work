// 历史列表和详情只供回看，使用后端的 /api/history 接口。
export function setupHistory() {
  const refresh = document.getElementById('history-refresh');
  const select = document.getElementById('history-select');
  const view = document.getElementById('history-view');
  const status = document.getElementById('history-status');
  const detail = document.getElementById('history-detail');
  let loading = false;

  // 两个查询共用相同的 HTTP 错误处理，避免重复。
  async function readJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    let text;
    try {
      response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      text = await response.text();
    } finally {
      clearTimeout(timer);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${response.status}：请检查云端历史接口是否已更新`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}：${data?.message || '查询失败'}`);
    }
    return data;
  }

  function setLoading(value) {
    loading = value;
    refresh.disabled = value;
    select.disabled = value || select.options.length === 0;
    view.disabled = value || select.options.length === 0;
  }

  refresh.addEventListener('click', async () => {
    if (loading) return;
    setLoading(true);
    status.textContent = '正在读取历史……';
    detail.textContent = '';
    select.replaceChildren();
    try {
      const data = await readJson('/api/history');
      if (!data || !Array.isArray(data.items)) {
        throw new Error('历史列表格式不正确');
      }
      for (const item of data.items) {
        if (!item || !/^[0-9a-f]{32}$/.test(item.id) ||
            !Array.isArray(item.fileNames) || typeof item.createdAt !== 'string') {
          throw new Error('历史列表内容不完整');
        }
        const option = document.createElement('option');
        option.value = item.id;
        const time = new Date(item.createdAt).toLocaleString();
        const phase = item.stage === 'compile' ? '编译' : '运行';
        const outcome = item.exitCode === 0 ? '成功' : item.exitCode === 124 ? '超时' : '失败';
        option.textContent = `${time} · ${phase}${outcome} · ${item.fileNames.join(', ')}`;
        select.append(option);
      }
      status.textContent = data.items.length
        ? `共 ${data.items.length} 条记录，请选择后查看。`
        : '还没有运行记录。运行程序后，点击刷新历史。';
    } catch (error) {
      select.replaceChildren();
      status.textContent = `读取历史失败：${error.message}`;
    } finally {
      setLoading(false);
    }
  });

  view.addEventListener('click', async () => {
    if (loading || !select.value) return;
    const recordId = select.value;
    setLoading(true);
    status.textContent = '正在读取记录……';
    detail.textContent = '';
    try {
      const data = await readJson('/api/history/' + encodeURIComponent(recordId));
      if (!data || !Array.isArray(data.files) || typeof data.stdin !== 'string' ||
          !data.result || typeof data.result.stdout !== 'string' ||
          typeof data.result.stderr !== 'string') {
        throw new Error('历史详情格式不正确');
      }
      const lines = [];
      for (const file of data.files) {
        if (!file || typeof file.name !== 'string' || typeof file.content !== 'string') {
          throw new Error('记录中的文件内容不完整');
        }
        lines.push(`===== ${file.name} =====`, file.content, '');
      }
      lines.push('===== 标准输入 =====', data.stdin || '（空）', '');
      lines.push('===== 标准输出 =====', data.result.stdout || '（无标准输出）', '');
      lines.push('===== 错误信息 =====', data.result.stderr || '（无错误信息）');
      // 以文字显示历史代码和程序输出。
      detail.textContent = lines.join('\n');
      status.textContent = `退出码：${data.result.exitCode}；耗时：${data.result.time} 毫秒`;
    } catch (error) {
      status.textContent = `读取记录失败：${error.message}`;
    } finally {
      setLoading(false);
    }
  });

  select.addEventListener('change', () => {
    detail.textContent = '';
    status.textContent = '已选择记录，请点击查看记录。';
  });

  refresh.click();
}
