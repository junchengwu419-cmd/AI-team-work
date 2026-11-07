# Nginx 开发环境部署

## 当前结构

Nginx 在服务器本机 8080 端口提供网页。
以 /api/ 开头的请求转发给服务器本机 8000 端口的 Flask。

网页文件：backend/static/
Nginx 配置：deploy/nginx/default.conf

当前用于开发验证，尚未配置公网入口、域名和 HTTPS。

## 1. 启动 Flask

在项目根目录执行：

```bash
source backend/.venv/bin/activate
python -m flask --app backend.app run --host 127.0.0.1 --port 8000
```

保持这个终端运行。

## 2. 首次创建 Nginx 容器

在另一个终端进入项目根目录，确认能看到 backend 和 deploy。

下载镜像：

```bash
sudo docker pull nginx:stable-alpine
```

创建容器，仅在没有同名容器时执行：

```bash
sudo docker run -d \
  --name online-lab-nginx \
  --network host \
  --memory=128m \
  --cpus=0.5 \
  --pids-limit=64 \
  --mount "type=bind,src=$PWD/backend/static,dst=/usr/share/nginx/html,readonly" \
  --mount "type=bind,src=$PWD/deploy/nginx/default.conf,dst=/etc/nginx/conf.d/default.conf,readonly" \
  nginx:stable-alpine
```

容器使用主机网络，配置只监听 127.0.0.1:8080。
这套网络配置用于 Nginx 服务，不用于学生代码执行沙箱。

## 3. 已创建容器的日常操作

查看容器，包括已停止的容器：

```bash
sudo docker ps -a --filter name=online-lab-nginx
```

停止：

```bash
sudo docker stop online-lab-nginx
```

再次启动，不需要重新创建：

```bash
sudo docker start online-lab-nginx
```

查看日志：

```bash
sudo docker logs --tail 50 online-lab-nginx
```

Flask 需要单独启动，启动 Nginx 不会自动启动 Flask。

## 4. 验证

在服务器终端执行：

```bash
curl -i http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/api/ping
```

预期：

- 根路径返回 HTTP 200 和 HTML。
- /api/ping 返回 HTTP 200 和 {"ok":true}。
- 若返回 502，检查 Flask 是否正在 8000 端口运行。

通过 VS Code Ports 面板转发 8080，使用显示的本地地址打开网页。
点击“检查连接”，预期显示“后端连接成功”。

## 5. 当前验证记录

已验证：
- Nginx 容器能够启动。
- Nginx 能返回测试网页。
- Nginx 能将 /api/ping 转发给 Flask。
- 浏览器按钮能够显示后端连接成功。

本次响应头显示 Nginx 版本为 1.20.2。
镜像标签可能随下载时间或镜像源变化，标签不等于固定版本。