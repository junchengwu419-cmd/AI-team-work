"""已发布题目的文件存储。每道题使用一个 JSON 文件。"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
import uuid


def _text(value, label, max_bytes, *, required=False):
    if not isinstance(value, str) or (required and not value.strip()):
        raise ValueError(f"{label}不合法")
    try:
        size = len(value.encode("utf-8"))
    except UnicodeEncodeError:
        raise ValueError(f"{label}不是有效的 UTF-8 文本") from None
    if size > max_bytes:
        raise ValueError(f"{label}最多 {max_bytes} 字节")
    return value


class ProblemStore:
    def __init__(self, root):
        self.root = Path(root)

    def publish(self, payload):
        if not isinstance(payload, dict):
            raise ValueError("请发送题目的 JSON 对象")
        title = _text(payload.get("title"), "题目标题", 480, required=True).strip()
        description = _text(payload.get("description"), "题目说明", 16_000, required=True).strip()
        cases = payload.get("cases")
        if not isinstance(cases, list) or not 1 <= len(cases) <= 10:
            raise ValueError("请提供 1 到 10 组用例")

        checked = []
        for number, case in enumerate(cases, start=1):
            if not isinstance(case, dict):
                raise ValueError(f"用例 {number} 不合法")
            checked.append({
                "stdin": _text(case.get("stdin"), f"用例 {number} 的输入", 16_000),
                "expectedOutput": _text(case.get("expectedOutput"), f"用例 {number} 的预期输出", 16_000),
            })

        problem = {
            "id": uuid.uuid4().hex,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "title": title,
            "description": description,
            "cases": checked,
        }
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        temp_path = None
        try:
            with NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=self.root, suffix=".tmp", delete=False
            ) as handle:
                temp_path = Path(handle.name)
                json.dump(problem, handle, ensure_ascii=False)
            os.replace(temp_path, self.root / f"{problem['id']}.json")
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
        return problem

    def get(self, problem_id):
        if not re.fullmatch(r"[0-9a-f]{32}", problem_id):
            return None
        try:
            return json.loads((self.root / f"{problem_id}.json").read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    def list(self):
        items = []
        for path in self.root.glob("*.json"):
            problem = self.get(path.stem)
            if problem is not None:
                items.append({field: problem[field] for field in ("id", "title", "createdAt")})
        return sorted(items, key=lambda item: item["createdAt"], reverse=True)
