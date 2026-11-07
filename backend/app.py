from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/api/ping")
def ping():
    return jsonify({"ok": True})

@app.get("/")
def index():
    return app.send_static_file("index.html")