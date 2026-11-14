"""Ubuntu 开发环境执行器：由固定 Docker 参数编译运行 C++。

需要本地存在 cpp-sandbox:dev，并在启动本进程的终端准备 sudo 授权。
当前是开发验证方案，尚未作为公网执行服务完成安全验收。
"""

import logging
import queue
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

LOG = logging.getLogger(__name__)
OUTPUT_LIMIT = 100_000
TASK_TIMEOUT = 20
_WAIT_FOR_SANDBOX_SECONDS = 8
# 单个后端进程最多接纳 5 个运行请求，其中最多 2 个可以同时启动沙箱。
_REQUEST_SLOTS = threading.BoundedSemaphore(5)
_TASK_SLOT = threading.BoundedSemaphore(2)


class RequestError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class SandboxError(RuntimeError):
    pass


class SandboxBusy(SandboxError):
    pass


def _utf8(text):
    try:
        return text.encode("utf-8")
    except UnicodeEncodeError as error:
        raise RequestError("bad_request", "文本必须能够使用 UTF-8 编码") from error


def validate_request(files, stdin):
    if not isinstance(files, list):
        raise RequestError("bad_request", "files 必须是数组")
    if not files:
        raise RequestError("no_files", "请至少提供一个源文件")
    if len(files) > 10:
        raise RequestError("too_many_files", "文件最多 10 个")
    if not isinstance(stdin, str):
        raise RequestError("bad_request", "stdin 必须是字符串")
    input_bytes = _utf8(stdin)
    if len(input_bytes) > 100_000:
        raise RequestError("bad_request", "标准输入不能超过 100 KB")

    names = set()
    checked = []
    total = 0
    for item in files:
        if not isinstance(item, dict):
            raise RequestError("bad_request", "每个文件必须是对象")
        name, content = item.get("name"), item.get("content")
        if not isinstance(name, str) or not isinstance(content, str):
            raise RequestError("bad_request", "name 和 content 必须是字符串")
        if (not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", name)
                or name in {".", ".."} or name in names):
            raise RequestError("bad_filename", "文件名不合法、重复或超过 128 字符")
        names.add(name)
        data = _utf8(content)
        if len(data) > 100_000:
            raise RequestError("file_too_large", "单个文件不能超过 100 KB")
        total += len(data)
        if total > 500_000:
            raise RequestError("total_too_large", "源文件合计不能超过 500 KB")
        checked.append((name, data))
    if not any(name.endswith(".cpp") for name in names):
        raise RequestError("bad_request", "请提供至少一个 .cpp 文件")
    return checked, input_bytes


def _capture(command, seconds=TASK_TIMEOUT, limit=OUTPUT_LIMIT):
    """并行读取两个输出流；达到上限或超时后结束 Docker CLI。

    容器由调用者随后按唯一名称强制回收。输出字节数上限包含内部标记。
    """
    events = queue.Queue(maxsize=16)
    stopped = threading.Event()
    process = subprocess.Popen(
        command, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )

    def send(event):
        while not stopped.is_set():
            try:
                events.put(event, timeout=0.1)
                return
            except queue.Full:
                pass

    def read_stream(stream, label):
        try:
            while not stopped.is_set():
                data = stream.read1(4096)
                if not data:
                    break
                send((label, data))
        except (OSError, ValueError):
            pass
        finally:
            send((label, None))

    threads = [
        threading.Thread(target=read_stream, args=(process.stdout, "out"), daemon=True),
        threading.Thread(target=read_stream, args=(process.stderr, "err"), daemon=True),
    ]
    for thread in threads:
        thread.start()

    buffers = {"out": bytearray(), "err": bytearray()}
    deadline = time.monotonic() + seconds
    ended = 0
    reason = None
    try:
        while ended < 2:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                reason = "timeout"
                break
            try:
                label, data = events.get(timeout=min(0.1, remaining))
            except queue.Empty:
                continue
            if data is None:
                ended += 1
                continue
            room = limit - len(buffers["out"]) - len(buffers["err"])
            buffers[label].extend(data[:room])
            if len(data) > room:
                reason = "output_limit"
                break
        if reason is None:
            try:
                process.wait(timeout=max(0.01, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                reason = "timeout"
    finally:
        stopped.set()
        if process.poll() is None:
            process.kill()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired as error:
            raise SandboxError("Docker 命令未能结束") from error
        for thread in threads:
            thread.join(timeout=1)
        for thread, stream in zip(threads, (process.stdout, process.stderr)):
            if not thread.is_alive():
                stream.close()

    return bytes(buffers["out"]), bytes(buffers["err"]), process.returncode, reason


def _remove_container(name):
    try:
        result = subprocess.run(
            ["sudo", "-n", "docker", "rm", "-f", name],
            capture_output=True, timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        LOG.exception("清理容器失败：%s", name)
        return False
    if result.returncode != 0 and b"No such container" not in result.stderr:
        LOG.error("清理容器失败：%s %r", name, result.stderr[:1000])
        return False
    return True


def run_code(files, stdin=""):
    checked, input_bytes = validate_request(files, stdin)
    if not _REQUEST_SLOTS.acquire(blocking=False):
        raise SandboxBusy("运行请求已满，请稍后重试")
    try:
        if not _TASK_SLOT.acquire(timeout=_WAIT_FOR_SANDBOX_SECONDS):
            raise SandboxBusy("等待沙箱超时，请稍后重试")
        try:
            return _run_checked(checked, input_bytes)
        finally:
            _TASK_SLOT.release()
    finally:
        _REQUEST_SLOTS.release()


def _run_checked(checked, input_bytes):
    token = uuid.uuid4().hex
    name = "lab-run-" + token
    begin = "__LAB_BEGIN_" + token + "__"
    running = "__LAB_RUN_" + token + "__"
    meta = "__LAB_META_" + token + "__"
    script = f'''
printf '%s\\n' '{begin}' >&2
started=$(date +%s%3N)
stage=compile
timeout -k 1s 10s g++ -std=c++17 -fmax-errors=10 /src/*.cpp -o /box/program
status=$?
if [ "$status" -eq 0 ]; then
    stage=run
    printf '%s\\n' '{running}' >&2
    timeout -k 1s 2s /box/program < /input.txt
    status=$?
fi
elapsed=$(( $(date +%s%3N) - started ))
printf '\\n%s|%s|%s|%s\\n' '{meta}' "$stage" "$status" "$elapsed" >&2
exit "$status"
'''

    with tempfile.TemporaryDirectory(prefix="online-lab-") as task:
        root = Path(task)
        root.chmod(0o755)
        sources = root / "sources"
        sources.mkdir(mode=0o755)
        for filename, data in checked:
            path = sources / filename
            path.write_bytes(data)
            path.chmod(0o644)
        input_path = root / "stdin.txt"
        input_path.write_bytes(input_bytes)
        input_path.chmod(0o644)

        command = [
            "sudo", "-n", "docker", "run", "--rm", "--name", name,
            "--network", "none", "--memory=256m", "--memory-swap=256m",
            "--cpus=0.5", "--pids-limit=64", "--cap-drop=ALL",
            "--security-opt=no-new-privileges", "--read-only",
            "--log-driver=none",
            "--tmpfs", "/tmp:rw,size=32m,noexec,mode=1777",
            "--tmpfs", "/box:rw,size=32m,exec,uid=1000,gid=1000,mode=0700",
            "--mount", f"type=bind,src={sources},dst=/src,readonly",
            "--mount", f"type=bind,src={input_path},dst=/input.txt,readonly",
            "cpp-sandbox:dev", "bash", "-c", script,
        ]
        started = time.monotonic()
        original_error = None
        try:
            out, err, returncode, reason = _capture(command)
        except Exception as error:
            original_error = error
        finally:
            cleaned = _remove_container(name)
        if original_error is not None:
            if not cleaned:
                LOG.error("任务异常且清理失败：%s", name)
            raise SandboxError("任务执行异常") from original_error
        if not cleaned:
            raise SandboxError("容器清理失败，请检查服务器")

        stage = "run" if running.encode() in err else "compile"
        for marker in (begin, running):
            err = err.replace((marker + "\n").encode(), b"", 1)
        match = re.search(
            rb"\n" + re.escape(meta.encode()) + rb"\|(compile|run)\|([0-9]+)\|([0-9]+)\n",
            err,
        )
        elapsed = int((time.monotonic() - started) * 1000)
        if match is not None:
            stage = match[1].decode("ascii")
            elapsed = int(match[3])
            err = err[:match.start()] + err[match.end():]
        if reason is None:
            if match is None or int(match[2]) != returncode:
                LOG.error("执行器响应不完整：%s rc=%s stderr=%r", name, returncode, err[:1000])
                raise SandboxError("执行器未返回完整结果")
            exit_code = returncode
            note = ""
            if exit_code in (124, 137):
                note = "编译或运行被终止；请检查时限或资源限制。" if exit_code == 137 else (
                    "编译超时。" if stage == "compile" else "运行超时。"
                )
        elif reason == "output_limit":
            exit_code = 1
            note = "输出超过 100 KB，任务已终止。"
        else:
            exit_code = 124
            note = "任务超过整体等待时限，已终止。"

        # 为平台提示预留空间；限制 UTF-8 响应正文中两种输出的合计字节数。
        note_bytes = (("\n" + note) if note else "").encode("utf-8")
        budget = OUTPUT_LIMIT - len(note_bytes)
        out = out[:budget]
        err = err[:max(0, budget - len(out))]
        return {
            "stdout": out.decode("utf-8", errors="ignore"),
            "stderr": err.decode("utf-8", errors="ignore") + note_bytes.decode("utf-8"),
            "exitCode": exit_code,
            "time": elapsed,
            "stage": stage,
        }


if __name__ == "__main__":
    example = sys.argv[1] if len(sys.argv) > 1 else "main.cpp"
    if example not in {"main.cpp", "compile_error.cpp", "infinite_loop.cpp"}:
        raise SystemExit("请选择约定的三个测试文件")
    source = Path(__file__).resolve().parent.parent / "sandbox" / "examples" / example
    try:
        result = run_code([{"name": "main.cpp", "content": source.read_text(encoding="utf-8")}])
    except (RequestError, SandboxError, OSError) as error:
        print("执行失败：", error)
        raise SystemExit(1)
    import json
    print(json.dumps(result, ensure_ascii=False, indent=2))
