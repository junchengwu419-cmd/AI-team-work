# 在线 C++ 实验室

在浏览器里编写、编译和运行 C++。实验室支持多文件编辑、标准输入、编译错误定位、本地草稿和提交历史。后端在 Ubuntu 的 Docker 容器中运行代码，使用网页的电脑无需安装 C++ 编译器。教师可以发布题目说明和公开用例，学生可以在实验室首页选题并试跑。

## 在 Windows 上打开开发预览

下面用团队已有的 Ubuntu 测试服务器。Windows 需要 Git、OpenSSH 和 Node.js（推荐 22.12 或更新版本），并能通过 SSH 连接测试服务器。命令里的 `online-lab` 是 Windows SSH 配置中的连接名，保存服务器地址、登录用户名和私钥路径。已有对应连接名时直接复用，首次连接请向维护人员获取这些信息。

首次配置时，在 Windows 用户目录的 `.ssh/config` 文件中添加下面的内容，把尖括号及其中的文字替换成实际信息。

```sshconfig
Host online-lab
    HostName <服务器地址>
    User <SSH 用户名>
    IdentityFile "<私钥完整路径>"
```

如果本机还没有源码，可在准备存放项目的目录执行以下命令。当前教师发题和学生选题功能位于 `function/teacher-problems` 分支。

```powershell
git clone --branch function/teacher-problems https://github.com/junchengwu419-cmd/AI-team-work.git
```

### 1. 启动 Ubuntu 后端

在 Ubuntu 终端启动团队现有的后端服务。后端已启动时可直接进入第 2 步。首次准备服务器请看下方「首次准备 Ubuntu 后端」。

```bash
sudo systemctl start online-lab-dev.service
```

这个服务运行 Flask，在 Ubuntu 的 `127.0.0.1:8000` 接收 API 请求。更新了后端代码或服务读取的环境变量后，用 `sudo systemctl restart online-lab-dev.service` 让改动生效。

### 2. 在 Windows 转发后端端口

在 Windows PowerShell 中运行下面的命令并保留窗口。本机的 `18000` 会经 SSH 连到 Ubuntu 的 `8000`。已有相同转发时可直接复用。

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18000:127.0.0.1:8000 online-lab
```

### 3. 启动 Windows 前端

在另一个 PowerShell 窗口中，从 Windows 的 `AI-team-work` 仓库根目录进入 `frontend`。首次使用或依赖锁文件更新时执行 `npm.cmd ci`，它按锁文件安装前端依赖。平时启动用 `npm.cmd run dev`。

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run dev
```

`npm.cmd run dev` 启动 Vite，把本机源码提供给浏览器。Vite 配置已经固定使用 `127.0.0.1:5173`，并把网页发出的 `/api/` 请求交给第 2 步的 `18000` 转发。保持窗口运行，然后在浏览器打开对应入口。

- [实验室首页](http://127.0.0.1:5173/)
- [教师入口](http://127.0.0.1:5173/teacher/)
- [后端连接检查](http://127.0.0.1:5173/api/ping)，能收到 `{"ok":true}` 就表示浏览器的请求能到达 Flask。

修改前端源码后通常刷新浏览器即可看到变化。需要重启 Vite 时，在原来的前端终端按 Ctrl+C，再运行 `npm.cmd run dev`，继续使用 `5173`。

## 在网页上操作

### 运行程序和查看历史

打开实验室首页，保留初始的 `main.cpp`，点「运行 C++」。用默认示例时，输出应为 `Hello from Monaco!`，退出码为 `0`。也可以在文件栏添加文件，或在代码编辑区下方的「标准输入」框里填写程序要读取的数据。

点「刷新历史」，选中刚才的运行记录后点「查看记录」，可查看当时的代码、输入和输出。草稿由浏览器保存，最近 20 条提交由后端按浏览器标识保存。

### 教师发布一道题

1. 直接打开「教师入口」，填入维护人员提供的教师发布口令，点「验证并进入发题页」。验证后才会显示完整表单。
2. 填写题目标题、说明和至少一组公开用例。可以用「两数相加」试发布，题目说明填写「输入两个整数，输出它们的和」，标准输入填 `3 5`，预期输出填 `8`。
3. 在发题表单里再次填写发布口令，然后点「发布题目」。看到「已发布」提示后，学生可在首页刷新题目列表。题目说明和公开用例随题目一起保存在服务器上。

### 学生选题并试跑

1. 回到实验室首页，展开「课堂题目」，点「刷新题目」，选一道已发布的题。页面会显示题目说明、用例输入和预期输出。
2. 选择要试的公开用例，点「填入标准输入」。输入会出现在页面下方的「标准输入」框里，代码编辑区保留学生自己的程序。
3. 编写解题程序并点「运行 C++」，把实际输出和题目给出的预期输出对照。以「两数相加」为例，程序读取 `3 5` 并输出两数之和时，实际输出应为 `8`。

## 首次准备 Ubuntu 后端

团队服务器已配置好时可以跳过本节。首次准备时，先安装 Python 3（含 `venv` 支持）和 Docker，并让 Ubuntu 仓库使用与本机相同的功能分支。在 Ubuntu 的 `AI-team-work` 仓库根目录执行：

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
sudo docker build -t cpp-sandbox:dev ./sandbox
```

前两行创建项目专用的 Python 环境并安装后端依赖。最后一行构建 C++ 执行镜像，镜像缺失或沙箱 Dockerfile 改动时才需要重新构建。后端以 `sudo -n docker` 调用 Docker，运行后端的 Ubuntu 用户需要由维护人员配置对应的 Docker 执行权限。

已有 `online-lab-dev.service` 时按前面的方式启动。新环境尚未配置该服务时，可在同一个仓库根目录临时运行 Flask，并保留终端。

```bash
backend/.venv/bin/python -m flask --app backend.app run --host 127.0.0.1 --port 8000 --no-reload
```

启用教师发布前，由维护人员在启动 Flask 的环境里设置 `ONLINE_LAB_TEACHER_TOKEN`。团队的 systemd 服务从它配置的环境文件读取口令，更新配置后重启服务。题目和提交历史默认保存在后端运行用户的 `~/online-lab-data/problems/` 和 `~/online-lab-data/history/`，也可通过 `ONLINE_LAB_PROBLEMS_DIR` 和 `ONLINE_LAB_HISTORY_DIR` 指定其他目录。

## 查看云端已发布的网页

| Windows 浏览器入口 | 网页由谁提供 | API 请求去哪里 |
| --- | --- | --- |
| [开发预览 5173](http://127.0.0.1:5173/) | Windows 上的 Vite，读取本机前端源码 | 本机 `18000` 经 SSH 到 Ubuntu Flask 的 `8000` |
| [发布预览 18080](http://127.0.0.1:18080/) | Ubuntu 上的 Nginx，读取已经发布的网页文件 | Ubuntu Nginx 的 `8080` 转给同机 Flask 的 `8000` |

如果还没有发布预览的转发，在 Windows PowerShell 执行下面这行并保留窗口。成功后可验证 [已发布的首页](http://127.0.0.1:18080/) 和 [已发布的教师页](http://127.0.0.1:18080/teacher/)。

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18080:127.0.0.1:8080 online-lab
```

前端改动准备发布时，在 Windows 仓库的 `frontend` 目录执行 `npm.cmd run build`。Vite 按配置打包实验室首页和教师入口，产物位于 `frontend/dist/`，包含 `index.html`、`teacher/index.html` 和 `assets/`。发布时将整套产物更新到现有 Nginx 的网页目录。Git 同步源码、重启 Flask 服务、发布前端产物各有用途，按实际改动选择。

## 当前限制

- 教师端使用共享发布口令。学生可读取已发布题目及公开用例，当前流程由学生自行对照试跑结果。
- 每次运行最多提交 10 个文件，至少包含一个 `.cpp` 文件。单文件最多 100 KB，文件合计最多 500 KB，标准输入和合计输出各最多 100 KB。
- 沙箱使用 C++17，编译限时 10 秒，程序运行限时 2 秒。每次运行的 Docker 容器隔离网络，内存上限 256 MiB。单个后端进程同时运行最多 2 个任务。
- 当前启动和部署配置用于团队开发及受控演示。

## 常见问题

- **`5173` 打不开或提示端口占用**。先看原前端窗口是否仍在运行，已有正确的 Vite 服务就复用。本项目固定使用 `5173`。
- **`18000/` 显示早期的连接测试页**。这个端口直连 Flask，是本机 Vite 调用 API 的中转。要使用实验室界面，打开 `5173/` 或已有转发的 `18080/`。
- **页面能打开，接口请求失败**。在同一个入口打开 `/api/ping`。如果失败，开发预览先查 `18000` 的 SSH 转发，再查 Ubuntu 上的 Flask。发布预览先查 `18080` 的转发和 Nginx，再查 Flask。
- **健康检查正常，运行 C++ 报错**。若提示编译错误，先看网页输出。若接口返回 500，请维护人员查看后端服务日志，核对 Docker 权限和沙箱镜像。若提示任务繁忙，等当前任务完成后再试。
- **教师页提示「教师发布暂未启用」**。请维护人员确认 `ONLINE_LAB_TEACHER_TOKEN` 已由 Flask 读取。提示「教师发布口令不正确」时，核对当前测试服务器配置的口令。

## 代码目录

| 路径 | 用途 |
| --- | --- |
| `frontend/` | 实验室首页、Monaco 编辑器、教师入口和 Vite 配置 |
| `backend/` | Flask 接口、教师表单模板、C++ 执行器及题目和历史存储 |
| `sandbox/` | C++ 执行镜像和测试示例 |
| [deploy/nginx/default.conf](deploy/nginx/default.conf) | 发布网页的 Nginx 配置与 API 转发 |
| [API.md](API.md) | 运行、历史、教师发题和学生选题的接口说明 |
