import * as monaco from 'monaco-editor';
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';

self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  }
};

const editor = monaco.editor.create(
  document.querySelector('#editor'),
  {
    value: [
      '#include <iostream>',
      '',
      'int main() {',
      '    std::cout << "Hello from Monaco!" << std::endl;',
      '    return 0;',
      '}'
    ].join('\n'),
    language: 'cpp',
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: false }
  }
);

document.querySelector('#read-code').addEventListener('click', () => {
  document.querySelector('#result').textContent = editor.getValue();
});