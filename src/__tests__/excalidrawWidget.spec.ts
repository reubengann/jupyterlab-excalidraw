import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps
} from '@excalidraw/excalidraw/types';
import type { IThemeManager } from '@jupyterlab/apputils';
import type { DocumentRegistry } from '@jupyterlab/docregistry';

import { loadExcalidrawFile, saveExcalidrawFile } from '../excalidrawFile';
import { ExcalidrawWidget, SAVE_DEBOUNCE_MS } from '../excalidrawWidget';

jest.mock('@excalidraw/excalidraw', () => {
  const MainMenu = Object.assign(() => null, {
    Item: () => null,
    Group: () => null,
    Separator: () => null,
    DefaultItems: {
      LoadScene: () => null,
      Export: () => null,
      SaveAsImage: () => null,
      SearchMenu: () => null,
      Help: () => null,
      ClearCanvas: () => null,
      Socials: () => null,
      ChangeCanvasBackground: () => null
    }
  });
  return {
    Excalidraw: () => null,
    MainMenu
  };
});

jest.mock('@jupyterlab/apputils', () => ({
  ReactWidget: class {
    isDisposed = false;

    addClass(): void {
      return;
    }

    update(): void {
      return;
    }

    dispose(): void {
      this.isDisposed = true;
    }
  }
}));

jest.mock('../excalidrawFile', () => ({
  loadExcalidrawFile: jest.fn(),
  saveExcalidrawFile: jest.fn()
}));

const mockedLoad = jest.mocked(loadExcalidrawFile);
const mockedSave = jest.mocked(saveExcalidrawFile);

type WidgetHarness = {
  onEditorMount(editor: ExcalidrawImperativeAPI): void;
  onSceneChange: NonNullable<ExcalidrawProps['onChange']>;
};

type RenderedElement = {
  props: {
    children: RenderedElement | RenderedElement[];
    onClick?: () => void;
  };
};

describe('ExcalidrawWidget document synchronization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValue(null);
    mockedSave.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes an empty model with native Excalidraw JSON', async () => {
    const { context, model } = createContext('');
    mockedSave.mockReturnValue('{"type":"excalidraw"}');
    const widget = new ExcalidrawWidget(context, createThemeManager());

    await flushPromises();
    (widget as unknown as WidgetHarness).onEditorMount(createEditor());
    await flushPromises();

    expect(model.fromString).toHaveBeenCalledWith('{"type":"excalidraw"}');
    expect(context.save).toHaveBeenCalledTimes(1);
    widget.dispose();
  });

  it('debounces scene changes and ignores its own model update', async () => {
    const { context, model } = createContext('{"initial":true}');
    mockedSave.mockReturnValue('{"saved":true}');
    const widget = new ExcalidrawWidget(context, createThemeManager());
    const harness = widget as unknown as WidgetHarness;

    await flushPromises();
    harness.onEditorMount(createEditor());
    harness.onSceneChange(...createScene());

    expect(model.dirty).toBe(true);
    expect(context.save).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    await flushPromises();

    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(model.fromString).toHaveBeenCalledWith('{"saved":true}');
    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(context.save).toHaveBeenCalledTimes(1);
    widget.dispose();
  });

  it('does not save pending changes when disposed', async () => {
    const { context, model } = createContext('{"initial":true}');
    mockedSave.mockReturnValue('{"pending":true}');
    const widget = new ExcalidrawWidget(context, createThemeManager());
    const harness = widget as unknown as WidgetHarness;

    await flushPromises();
    harness.onEditorMount(createEditor());
    harness.onSceneChange(...createScene());
    widget.dispose();
    jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    await flushPromises();

    expect(model.dirty).toBe(true);
    expect(context.save).not.toHaveBeenCalled();
  });

  it('flushes the current scene from the save menu item', async () => {
    const { context } = createContext('{"initial":true}');
    mockedSave.mockReturnValue('{"manual":true}');
    const widget = new ExcalidrawWidget(context, createThemeManager());
    const harness = widget as unknown as WidgetHarness;

    await flushPromises();
    harness.onEditorMount(createEditor());
    harness.onSceneChange(...createScene());

    const excalidraw = widget.render() as unknown as RenderedElement;
    const menu = excalidraw.props.children as RenderedElement;
    const menuItems = menu.props.children as RenderedElement[];
    menuItems[1].props.onClick?.();
    await flushPromises();

    expect(context.model.fromString).toHaveBeenCalledWith('{"manual":true}');
    expect(context.save).toHaveBeenCalledTimes(1);
    widget.dispose();
  });

  it('loads external model changes for a clean editor remount', async () => {
    const state = createContext('{"initial":true}');
    const widget = new ExcalidrawWidget(state.context, createThemeManager());

    await flushPromises();
    state.setContent('{"external":true}');
    await flushPromises();

    expect(mockedLoad).toHaveBeenLastCalledWith('{"external":true}');
    widget.dispose();
  });

  it('uses the active JupyterLab theme', async () => {
    const { context } = createContext('{"initial":true}');
    const widget = new ExcalidrawWidget(context, createThemeManager(false));

    await flushPromises();

    expect(widget.render()).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({ theme: 'dark' })
      })
    );
    widget.dispose();
  });
});

function createContext(initialContent: string): {
  context: DocumentRegistry.IContext<DocumentRegistry.ICodeModel>;
  model: DocumentRegistry.ICodeModel & { fromString: jest.Mock };
  setContent(value: string): void;
} {
  let content = initialContent;
  let onContentChanged: (() => void) | null = null;
  const contentChanged = {
    connect: jest.fn((slot, thisArg) => {
      onContentChanged = () => slot.call(thisArg, model, undefined);
    }),
    disconnect: jest.fn()
  };
  const model = {
    contentChanged,
    dirty: false,
    readOnly: false,
    toString: jest.fn(() => content),
    fromString: jest.fn((value: string) => {
      content = value;
      onContentChanged?.();
    })
  } as unknown as DocumentRegistry.ICodeModel & { fromString: jest.Mock };
  const context = {
    model,
    ready: Promise.resolve(),
    save: jest.fn(async () => {
      model.dirty = false;
    })
  } as unknown as DocumentRegistry.IContext<DocumentRegistry.ICodeModel>;

  return {
    context,
    model,
    setContent: value => {
      content = value;
      onContentChanged?.();
    }
  };
}

function createEditor(): ExcalidrawImperativeAPI {
  return {
    getSceneElementsIncludingDeleted: jest.fn(() => []),
    getAppState: jest.fn(() => ({})),
    getFiles: jest.fn(() => ({}))
  } as unknown as ExcalidrawImperativeAPI;
}

function createScene(): Parameters<NonNullable<ExcalidrawProps['onChange']>> {
  return [[], {}, {}] as unknown as Parameters<
    NonNullable<ExcalidrawProps['onChange']>
  >;
}

function createThemeManager(isLight = true): IThemeManager {
  return {
    theme: isLight ? 'JupyterLab Light' : 'JupyterLab Dark',
    isLight: jest.fn(() => isLight),
    themeChanged: {
      connect: jest.fn(),
      disconnect: jest.fn()
    }
  } as unknown as IThemeManager;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
