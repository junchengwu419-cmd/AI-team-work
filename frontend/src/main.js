import * as monaco from 'monaco-editor';
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { setupRun } from './run.js';
import { setupFiles } from './files.js';
import { setupDraft } from './drafts.js';

self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  }
};

const editor = monaco.editor.create(
  document.querySelector('#editor'),
  {
    model: monaco.editor.createModel(
      [
        '#include <iostream>',
        '',
        'int main() {',
        '    std::cout << "Hello from Monaco!" << std::endl;',
        '    return 0;',
        '}'
      ].join('\n'),
      'cpp'
    ),
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: false }
  }
);

document.querySelector('#read-code').addEventListener('click', () => {
  document.querySelector('#result').textContent = editor.getValue();
});

const fileManager = setupFiles(editor, monaco);
setupDraft(fileManager);
setupRun(
  editor,
  () => fileManager.getFiles(),
  location => fileManager.goTo(location),
  items => fileManager.setDiagnostics(items)
);