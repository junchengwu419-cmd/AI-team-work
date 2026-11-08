from flask import Flask, jsonify
from flask import request
from backend.executor import RequestError, SandboxBusy, SandboxError, run_code

app = Flask(__name__)


@app.get("/api/ping")
def ping():
    return jsonify({"ok": True})

@app.get("/")
def index():
    return app.send_static_file("index.html")

app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024

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
        return jsonify(result)
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
