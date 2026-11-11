import os
from pathlib import Path
import re
import secrets

from flask import Flask, jsonify, request

from backend.executor import RequestError, SandboxBusy, SandboxError, run_code
from backend.history_store import HistoryStore


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024

# 可以通过环境变量选择数据目录，默认放在当前用户的个人目录下。
history_directory = os.environ.get("ONLINE_LAB_HISTORY_DIR")
if not history_directory:
    history_directory = Path.home() / "online-lab-data" / "history"
history_store = HistoryStore(history_directory, max_records=20)


def get_history_owner():
    """从 Cookie 读取浏览器标识，缺失或格式错误时返回 None。"""
    owner = request.cookies.get("online_lab_history", "")
    if re.fullmatch(r"[0-9a-f]{64}", owner):
        return owner
    return None


@app.get("/api/ping")
def ping():
    return jsonify({"ok": True})


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.errorhandler(413)
def request_too_large(error):
    return jsonify({"error": "bad_request", "message": "请求体过大"}), 413


@app.post("/api/run")
def run_program():
    if not request.is_json:
        return jsonify({"error": "bad_request", "message": "请发送 JSON 请求"}), 400

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or "files" not in payload or "stdin" not in payload:
        return jsonify({"error": "bad_request", "message": "请求需要 files 和 stdin"}), 400

    try:
        result = run_code(payload["files"], payload["stdin"])
    except RequestError as error:
        return jsonify({"error": error.code, "message": str(error)}), 400
    except SandboxBusy:
        return jsonify({"error": "busy", "message": "已有任务运行，请稍后重试"}), 503
    except SandboxError:
        app.logger.exception("沙箱执行失败")
        return jsonify({"error": "internal", "message": "执行服务异常，请检查服务器"}), 500
    except Exception:
        app.logger.exception("处理运行请求时发生异常")
        return jsonify({"error": "internal", "message": "服务异常，请检查服务器"}), 500

    response = jsonify(result)
    response.headers["Cache-Control"] = "no-store"

    owner = get_history_owner()
    new_owner = owner is None
    if new_owner:
        owner = secrets.token_hex(32)

    # 执行器已经校验请求，这里只取约定字段保存。
    # 保存出错时记录日志，仍将已取得的执行结果返回给浏览器。
    try:
        files = []
        for item in payload["files"]:
            files.append({"name": item["name"], "content": item["content"]})
        history_store.save(owner, files, payload["stdin"], result)
    except Exception:
        app.logger.exception("保存运行历史失败")
        return response

    if new_owner:
        response.set_cookie(
            "online_lab_history",
            owner,
            max_age=30 * 24 * 60 * 60,
            httponly=True,
            samesite="Lax",
            secure=request.is_secure or app.config.get("HISTORY_COOKIE_SECURE", False),
            path="/api/",
        )
    return response


@app.get("/api/history")
def history_list():
    owner = get_history_owner()
    items = []
    try:
        if owner is not None:
            items = history_store.list(owner)
    except OSError:
        app.logger.exception("读取运行历史列表失败")
        return jsonify({"error": "internal", "message": "历史记录暂时无法读取"}), 500

    response = jsonify({"items": items})
    response.headers["Cache-Control"] = "no-store"
    response.vary.add("Cookie")
    return response


@app.get("/api/history/<record_id>")
def history_detail(record_id):
    owner = get_history_owner()
    record = None
    try:
        if owner is not None:
            record = history_store.get(owner, record_id)
    except OSError:
        app.logger.exception("读取运行历史详情失败")
        return jsonify({"error": "internal", "message": "历史记录暂时无法读取"}), 500

    if record is None:
        response = jsonify({"error": "not_found", "message": "找不到这条历史记录"})
        response.status_code = 404
    else:
        response = jsonify({
            "id": record["id"],
            "createdAt": record["createdAt"],
            "files": record["files"],
            "stdin": record["stdin"],
            "result": record["result"],
        })
    response.headers["Cache-Control"] = "no-store"
    response.vary.add("Cookie")
    return response
