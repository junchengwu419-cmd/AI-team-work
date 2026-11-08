# C++ 沙箱开发验证

## 构建镜像

在项目根目录执行：

```bash
sudo docker pull m.daocloud.io/docker.io/library/gcc:13
sudo docker tag m.daocloud.io/docker.io/library/gcc:13 gcc:13
sudo docker build -t cpp-sandbox:dev ./sandbox
```

## Python 调用测试

在项目根目录执行：

```bash
sudo -v
python3 backend/executor.py main.cpp
python3 backend/executor.py compile_error.cpp
python3 backend/executor.py infinite_loop.cpp
```

预期执行结果：
- 正常程序：输出 Hello from C++!，exitCode 为 0。
- 编译错误：返回编译错误，exitCode 为 1。
- 死循环：运行超时，exitCode 为 124。

sudo -v 用于临时刷新开发测试的管理员授权，
不是正式上线的权限方案。

## 当前边界

只执行 examples 中约定的三个测试文件。
尚未接收网页源代码，尚未实现 /api/run。
公开使用前还需补充输入校验、输出上限、执行阶段识别、
并发控制和异常清理验证。