"""仅使用标准库；不会启动Flask、Docker或访问正式历史目录。"""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile
import unittest

try:
    from backend.history_store import HistoryStore
except ModuleNotFoundError:
    from history_store import HistoryStore


class HistoryStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='online-lab-history-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.store = HistoryStore(self.root)
        self.owner = 'a' * 64
        self.other = 'b' * 64
        self.files = [{'name': 'main.cpp', 'content': '// 中文\nint main() {}'}]
        self.result = {'stage': 'run', 'exitCode': 0, 'time': 12, 'stdout': '8\n', 'stderr': ''}

    def save(self, **kwargs):
        return self.store.save(kwargs.get('owner', self.owner), self.files, '3 5', self.result)

    def test_round_trip_and_summary(self):
        record_id = self.save()
        record = self.store.get(self.owner, record_id)
        self.assertEqual(record['files'], self.files)
        self.assertEqual(record['stdin'], '3 5')
        self.assertEqual(record['result'], self.result)
        self.assertEqual(self.store.list(self.owner)[0]['id'], record_id)
        self.assertNotIn('files', self.store.list(self.owner)[0])

    def test_owner_isolation_and_invalid_paths(self):
        record_id = self.save()
        self.assertIsNone(self.store.get(self.other, record_id))
        self.assertEqual(self.store.list(self.other), [])
        self.assertIsNone(self.store.get(self.owner, '../../etc/passwd'))
        with self.assertRaises(ValueError):
            self.store.list('../escape')

    def test_restart_and_snapshot(self):
        record_id = self.save()
        self.files[0]['content'] = 'changed later'
        reopened = HistoryStore(self.root)
        self.assertIn('中文', reopened.get(self.owner, record_id)['files'][0]['content'])

    def test_retention(self):
        self.store = HistoryStore(self.root, max_records=2)
        first = self.save()
        second = self.save()
        third = self.save()
        self.assertEqual([item['id'] for item in self.store.list(self.owner)], [third, second])
        self.assertIsNone(self.store.get(self.owner, first))
        self.assertEqual(len(list(self.root.rglob('*.json'))), 2)

    def test_corrupt_record_does_not_hide_good_records(self):
        record_id = self.save()
        folder = next(path for path in self.root.iterdir() if path.is_dir())
        (folder / ('9' * 20 + '_' + 'f' * 32 + '.json')).write_text('{broken', encoding='utf-8')
        with self.assertLogs(level='WARNING'):
            self.assertEqual(self.store.list(self.owner)[0]['id'], record_id)

    def test_large_record_rejected(self):
        with self.assertRaises(ValueError):
            self.store.save(self.owner, [{'name': 'main.cpp', 'content': 'x' * 2000000}], '', self.result)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_failed_execution_result_can_be_saved(self):
        self.result.update(stage='compile', exitCode=1, stderr='expected semicolon')
        record_id = self.save()
        self.assertEqual(self.store.get(self.owner, record_id)['result']['exitCode'], 1)

    def test_multiple_store_instances_and_threads(self):
        stores = [HistoryStore(self.root) for _ in range(4)]
        def submit(i):
            return stores[i % 4].save(self.owner, self.files, str(i), self.result)
        with ThreadPoolExecutor(max_workers=4) as pool:
            ids = list(pool.map(submit, range(12)))
        self.assertEqual(len(set(ids)), 12)
        self.assertEqual(len(self.store.list(self.owner)), 12)
        for path in self.root.rglob('*.json'):
            json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(list(self.root.rglob('.record-*')), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
