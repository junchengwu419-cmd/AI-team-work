# AI-team-work
team work
## 启动后端开发服务

以下命令在服务器的项目根目录执行。

首次准备环境：

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
```

以后启动：

```bash
source backend/.venv/bin/activate
python -m flask --app backend.app run --host 127.0.0.1 --port 8000
```

保持服务终端运行，在另一个终端验证：

```bash
curl -i http://127.0.0.1:8000/api/ping
```

预期 HTTP 状态为 200，响应内容为：

```json
{"ok": true}
```

按 Ctrl+C 停止开发服务。
当前仅实现健康检查，尚未实现 C++ 编译运行。