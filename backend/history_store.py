"""提交历史的文件存储层；不负责执行代码或识别登录用户。

调用方必须传入浏览器对应的随机标识，并先完成运行请求校验。
每个标识保留最近20条。正式上线前仍需补齐身份及全局存储配额策略。
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import tempfile
import threading
import time
import uuid

LOG = logging.getLogger(__name__)
MAX_RECORD_BYTES = 2_000_000


class HistoryStore:
    def __init__(self, root, max_records=20):
        self.root = Path(root)
        if not isinstance(max_records, int) or not 1 <= max_records <= 100:
            raise ValueError('历史保留数量必须为1到100')
        self.max_records = max_records
        self._thread_lock = threading.RLock()

    def _directory(self, owner):
        if not isinstance(owner, str) or not re.fullmatch(r'[0-9a-f]{64}', owner):
            raise ValueError('历史空间标识不合法')
        return self.root / hashlib.sha256(owner.encode('ascii')).hexdigest()

    @contextmanager
    def _locked(self, directory):
        # 线程锁和文件锁共同覆盖同一进程及多个后端进程的读写。
        with self._thread_lock:
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            with (directory / '.lock').open('a+b') as handle:
                if os.name == 'nt':
                    import msvcrt
                    handle.seek(0, os.SEEK_END)
                    if handle.tell() == 0:
                        handle.write(b'0')
                        handle.flush()
                    deadline = time.monotonic() + 5
                    while True:
                        try:
                            handle.seek(0)
                            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                            break
                        except OSError:
                            if time.monotonic() >= deadline:
                                raise TimeoutError('历史存储忙碌')
                            time.sleep(0.05)
                else:
                    import fcntl
                    fcntl.flock(handle, fcntl.LOCK_EX)
                try:
                    yield
                finally:
                    if os.name == 'nt':
                        handle.seek(0)
                        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                    else:
                        fcntl.flock(handle, fcntl.LOCK_UN)

    def _read(self, path):
        try:
            with path.open('rb') as handle:
                data = handle.read(MAX_RECORD_BYTES + 1)
            if len(data) > MAX_RECORD_BYTES:
                raise ValueError('记录过大')
            record = json.loads(data.decode('utf-8'))
            if (not isinstance(record, dict) or record.get('version') != 1
                    or not re.fullmatch(r'[0-9a-f]{32}', record.get('id', ''))
                    or not isinstance(record.get('createdAt'), str)
                    or not isinstance(record.get('files'), list)
                    or not isinstance(record.get('stdin'), str)
                    or not isinstance(record.get('result'), dict)):
                raise ValueError('记录格式不正确')
            result = record['result']
            if (result.get('stage') not in {'compile', 'run'}
                    or not isinstance(result.get('exitCode'), int)
                    or not isinstance(result.get('time'), (int, float))
                    or not isinstance(result.get('stdout'), str)
                    or not isinstance(result.get('stderr'), str)
                    or any(not isinstance(file, dict)
                           or not isinstance(file.get('name'), str)
                           or not isinstance(file.get('content'), str)
                           for file in record['files'])):
                raise ValueError('记录内容不完整')
            return record
        except (OSError, ValueError, TypeError):
            LOG.warning('历史记录不可读取：%s', path.name)
            return None

    def save(self, owner, files, stdin, result):
        """保存已经校验且已经取得执行结果的请求，返回记录ID。"""
        directory = self._directory(owner)
        record_id = uuid.uuid4().hex
        record = {
            'version': 1,
            'id': record_id,
            'createdAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds'),
            'files': files,
            'stdin': stdin,
            'result': result,
        }
        data = json.dumps(record, ensure_ascii=False, allow_nan=False).encode('utf-8')
        if len(data) > MAX_RECORD_BYTES:
            raise ValueError('历史记录大小超过限制')
        with self._locked(directory):
            # 唯一临时文件写完后才改成.json，查询不会读到写了一半的内容。
            descriptor, temporary = tempfile.mkstemp(prefix='.record-', dir=directory)
            try:
                with os.fdopen(descriptor, 'wb') as handle:
                    handle.write(data)
                    handle.flush()
                    os.fsync(handle.fileno())
                target = directory / f'{time.time_ns():020d}_{record_id}.json'
                os.replace(temporary, target)
            finally:
                Path(temporary).unlink(missing_ok=True)
            records = sorted(directory.glob('*.json'), reverse=True)
            for expired in records[self.max_records:]:
                expired.unlink(missing_ok=True)
        return record_id

    def list(self, owner):
        """返回最近记录的摘要；完整源码通过get获取。"""
        directory = self._directory(owner)
        if not directory.exists():
            return []
        items = []
        with self._locked(directory):
            for path in sorted(directory.glob('*.json'), reverse=True):
                record = self._read(path)
                if record is None:
                    continue
                items.append({
                    'id': record['id'],
                    'createdAt': record['createdAt'],
                    'fileNames': [file['name'] for file in record['files']],
                    'stage': record['result']['stage'],
                    'exitCode': record['result']['exitCode'],
                    'time': record['result']['time'],
                })
                if len(items) >= self.max_records:
                    break
        return items

    def get(self, owner, record_id):
        directory = self._directory(owner)
        if not isinstance(record_id, str) or not re.fullmatch(r'[0-9a-f]{32}', record_id):
            return None
        if not directory.exists():
            return None
        with self._locked(directory):
            for path in directory.glob(f'*_{record_id}.json'):
                record = self._read(path)
                if record is not None and record['id'] == record_id:
                    return record
        return None
