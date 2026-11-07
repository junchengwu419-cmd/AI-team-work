import subprocess
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_DIR = PROJECT_ROOT / "sandbox" / "examples"

ALLOWED_FILES = {
    "main.cpp",
    "compile_error.cpp",
    "infinite_loop.cpp",
}


def run_example(filename):
    if filename not in ALLOWED_FILES:
        raise ValueError("只能执行约定的三个测试文件")

    if not (EXAMPLES_DIR / filename).is_file():
        raise ValueError("测试文件不存在")

    container_name = "lab-test-" + uuid.uuid4().hex

    command = [
        "sudo", "-n", "docker", "run",
        "--name", container_name,
        "--rm",
        "--network", "none",
        "--memory=256m",
        "--memory-swap=256m",
        "--cpus=0.5",
        "--pids-limit=64",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--read-only",
        "--tmpfs", "/tmp:rw,size=32m,noexec,mode=1777",
        "--tmpfs",
        "/box:rw,size=32m,exec,uid=1000,gid=1000,mode=0700",
        "--mount",
        f"type=bind,src={EXAMPLES_DIR},dst=/src,readonly",
        "cpp-sandbox:dev",
        "bash", "-c",
        'timeout 10s g++ -std=c++17 "/src/$1" '
        '-o /box/main && timeout 2s /box/main',
        "--", filename,
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=25,
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exitCode": result.returncode,
        }
    finally:
        # 即使 Python 等待超时，也尝试回收对应容器。
        subprocess.run(
            ["sudo", "-n", "docker", "rm", "-f", container_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
            check=False,
        )


if __name__ == "__main__":
    filename = sys.argv[1] if len(sys.argv) > 1 else "main.cpp"

    try:
        result = run_example(filename)
    except subprocess.TimeoutExpired:
        print("测试或容器清理超过等待时间，请检查容器状态。")
        sys.exit(1)
    except ValueError as error:
        print(error)
        sys.exit(2)

    print("标准输出：")
    print(result["stdout"])
    print("错误输出：")
    print(result["stderr"])
    print("退出码：", result["exitCode"])