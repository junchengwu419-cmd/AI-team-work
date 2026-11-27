import * as monaco from 'monaco-editor';
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { setupRun } from './run.js';
import { setupFiles } from './files.js';
import { setupDraft } from './drafts.js';
import { setupHistory } from './history.js';
import { setupStudentProblems } from './problems.js';

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
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false }
  }
);

const fileManager = setupFiles(editor, monaco);
const drafts = setupDraft(fileManager);
const getCurrentCase = setupStudentProblems(drafts.switchProblem);
setupRun(
  editor,
  () => fileManager.getFiles(),
  location => fileManager.goTo(location),
  items => fileManager.setDiagnostics(items),
  getCurrentCase
);
setupHistory();
