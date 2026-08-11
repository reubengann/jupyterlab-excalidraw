import type { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookActions } from '@jupyterlab/notebook';

/**
 * Save an SVG beside the current notebook and link it from a new markdown cell.
 */
export async function insertSvgIntoNotebook(
  notebookTracker: INotebookTracker | null,
  contents: JupyterFrontEnd['serviceManager']['contents'],
  svg: string
): Promise<void> {
  const panel = notebookTracker?.currentWidget;
  if (!panel || panel.isDisposed) {
    throw new Error(
      'Select a cell in the notebook that should receive the drawing, then try again.'
    );
  }

  const filename = `excalidraw-${createRandomId()}.svg`;
  const notebookPath = panel.context.path;
  const lastSlash = notebookPath.lastIndexOf('/');
  const directory = lastSlash === -1 ? '' : notebookPath.slice(0, lastSlash);
  const svgPath = directory ? `${directory}/${filename}` : filename;
  await contents.save(svgPath, {
    type: 'file',
    format: 'text',
    content: svg
  });

  const notebook = panel.content;
  NotebookActions.insertBelow(notebook);
  NotebookActions.changeCellType(notebook, 'markdown');

  const cell = notebook.activeCell;
  if (!cell || cell.model.type !== 'markdown') {
    throw new Error('JupyterLab could not create the markdown cell.');
  }

  cell.model.sharedModel.setSource(`![Excalidraw drawing](${filename})`);
  if ('rendered' in cell) {
    (cell as typeof cell & { rendered: boolean }).rendered = true;
  }
}

function createRandomId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  );
}
