// GCC 的文件位置示例：/src/calc.cpp:4:17: error: ...
export function parseDiagnosticLine(line) {
  const match = /^(?:\/src\/)?([A-Za-z0-9_.-]+):(\d+)(?::(\d+))?:\s*(?:fatal error|error|warning|note):/.exec(line);
  if (!match) return null;
  const lineNumber = Number(match[2]);
  const column = Number(match[3] || 1);
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1 ||
      !Number.isSafeInteger(column) || column < 1) return null;
  return { name: match[1], lineNumber, column };
}

//解析编译器或代码检查工具输出的错误信息，将其中的文件位置、错误类型和具体描述拆分，并将文件位置转换成可以点击的按钮。
export function showDiagnostics(container, text, onNavigate) {
  container.replaceChildren();
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const location = parseDiagnosticLine(line);
    if (location && typeof onNavigate === 'function') {
      const button = document.createElement('button');
      button.type = 'button';
      const prefix = line.match(/^(.+?:\d+(?::\d+)?)(:\s*)(fatal error|error|warning|note)(:)/);
      const [header, position, separator, kind, colon] = prefix;
      button.className = 'diagnostic-position';
      button.textContent = position;
      button.title = `跳到 ${location.name} 第 ${location.lineNumber} 行、第 ${location.column} 列`;
      const severity = document.createElement('span');
      severity.className = kind.includes('error') ? 'diagnostic-error' : 'diagnostic-kind';
      severity.textContent = kind;
      button.addEventListener('click', () => onNavigate(location));
      container.append(button, separator, severity, colon, line.slice(header.length));
    } else {
      container.append(document.createTextNode(line));
    }
    if (index < lines.length - 1) container.append(document.createTextNode('\n'));
  });
}

// 只解析学生文件中的 GCC 诊断；普通输出和系统头文件保持原样显示。
export function collectDiagnostics(text) {
  const result = [];
  for (const line of text.split('\n')) {
    const location = parseDiagnosticLine(line);
    if (!location) continue;
    const detail = /:\s*(fatal error|error|warning|note):\s*(.*)$/.exec(line);
    if (detail) result.push({ ...location, kind: detail[1], message: detail[2] || line });
  }
  return result;
}
