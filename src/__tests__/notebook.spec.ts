import type { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookActions } from '@jupyterlab/notebook';

import { insertSvgIntoNotebook } from '../notebook';

jest.mock('@jupyterlab/notebook', () => ({
  NotebookActions: {
    changeCellType: jest.fn(),
    insertBelow: jest.fn()
  }
}));

const mockedInsertBelow = jest.mocked(NotebookActions.insertBelow);
const mockedChangeCellType = jest.mocked(NotebookActions.changeCellType);

describe('insertSvgIntoNotebook', () => {
  beforeEach(() => {
    mockedInsertBelow.mockReset();
    mockedChangeCellType.mockReset();
  });

  it('saves and links an SVG beside the notebook', async () => {
    const setSource = jest.fn();
    const markdownCell = {
      rendered: false,
      model: {
        type: 'markdown',
        sharedModel: { setSource }
      }
    };
    const notebook: { activeCell: typeof markdownCell | null } = {
      activeCell: null
    };
    mockedInsertBelow.mockImplementation(() => {
      notebook.activeCell = markdownCell;
    });
    const tracker = {
      currentWidget: {
        isDisposed: false,
        context: { path: 'notes/example.ipynb' },
        content: notebook
      }
    } as unknown as INotebookTracker;
    const save = jest.fn(async (_path: string, _options: unknown) => undefined);
    const contents = {
      save
    } as unknown as JupyterFrontEnd['serviceManager']['contents'];
    const svg = '<svg><text>λ</text></svg>';

    await insertSvgIntoNotebook(tracker, contents, svg);

    expect(save).toHaveBeenCalledWith(
      expect.stringMatching(/^notes\/excalidraw-[a-z0-9-]+\.svg$/),
      {
        type: 'file',
        format: 'text',
        content: svg
      }
    );
    expect(mockedInsertBelow).toHaveBeenCalledWith(notebook);
    expect(mockedChangeCellType).toHaveBeenCalledWith(notebook, 'markdown');
    const filename = (save.mock.calls[0][0] as string).slice('notes/'.length);
    expect(setSource).toHaveBeenCalledWith(
      `![Excalidraw drawing](${filename})`
    );
    expect(markdownCell.rendered).toBe(true);
  });

  it('requires a recently selected notebook cell', async () => {
    const contents = {} as JupyterFrontEnd['serviceManager']['contents'];
    await expect(
      insertSvgIntoNotebook(null, contents, '<svg />')
    ).rejects.toThrow('Select a cell');
  });
});
