import {
  DefaultSidebar,
  Excalidraw,
  exportToSvg,
  getNonDeletedElements,
  MainMenu,
  WelcomeScreen
} from '@excalidraw/excalidraw';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps
} from '@excalidraw/excalidraw/types';
import { ReactWidget, showErrorMessage } from '@jupyterlab/apputils';
import type { IThemeManager } from '@jupyterlab/apputils';
import type { DocumentRegistry } from '@jupyterlab/docregistry';
import React from 'react';

import {
  ExcalidrawScene,
  loadExcalidrawFile,
  saveExcalidrawFile
} from './excalidrawFile';

export const SAVE_DEBOUNCE_MS = 500;
const ZOOM_CONTROLS_BREAKPOINT_PX = 950;

/**
 * An Excalidraw canvas synchronized with a JupyterLab document model.
 */
export class ExcalidrawWidget extends ReactWidget {
  constructor(
    private readonly context: DocumentRegistry.IContext<DocumentRegistry.ICodeModel>,
    private readonly themeManager: IThemeManager,
    private readonly insertSvgIntoNotebook: (svg: string) => Promise<void>
  ) {
    super();
    this.addClass('jp-Excalidraw-content');
    this.excalidrawTheme = getExcalidrawTheme(this.themeManager);
    this.context.model.contentChanged.connect(this.onModelChanged, this);
    this.themeManager.themeChanged.connect(this.onThemeChanged, this);
    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            const { left, top, width } = this.node.getBoundingClientRect();
            this.node.classList.toggle(
              'jp-mod-hideZoomControls',
              width <= ZOOM_CONTROLS_BREAKPOINT_PX
            );
            this.node.style.setProperty(
              '--jp-excalidraw-viewport-offset-left',
              `${left}px`
            );
            this.node.style.setProperty(
              '--jp-excalidraw-viewport-offset-top',
              `${top}px`
            );
          });
    this.resizeObserver?.observe(this.node);
    void this.initialize();
  }

  render(): JSX.Element {
    if (this.loadError) {
      return (
        <div className="jp-Excalidraw-status" role="alert">
          Unable to load this Excalidraw file: {this.loadError.message}
        </div>
      );
    }
    if (!this.ready) {
      return <div className="jp-Excalidraw-status">Loading Excalidraw…</div>;
    }
    return (
      <Excalidraw
        key={this.renderGeneration}
        initialData={this.initialData}
        excalidrawAPI={this.onEditorMount}
        onChange={this.onSceneChange}
        theme={this.excalidrawTheme}
      >
        <DefaultSidebar.Trigger style={{ display: 'none' }} aria-hidden />
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.Item onClick={this.onSaveClicked}>Save</MainMenu.Item>
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Item onClick={this.onInsertSvgClicked}>
            Insert SVG into Notebook
          </MainMenu.Item>
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
        <WelcomeScreen>
          <span hidden />
        </WelcomeScreen>
      </Excalidraw>
    );
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.context.model.contentChanged.disconnect(this.onModelChanged, this);
    this.themeManager.themeChanged.disconnect(this.onThemeChanged, this);
    this.resizeObserver?.disconnect();
    this.cancelPendingSave();
    this.latestScene = null;
    this.loadGeneration += 1;
    super.dispose();
  }

  /**
   * Flush the current scene to the model and save it to disk.
   */
  async save(): Promise<void> {
    console.info('[jupyterlab-excalidraw] Manual save started.', {
      path: this.context.path,
      dirty: this.context.model.dirty,
      sceneNeedsSync: this.sceneNeedsSync,
      hasScene: this.latestScene !== null
    });
    this.cancelPendingSave();
    const updated = this.sceneNeedsSync ? this.updateModelFromScene() : false;
    console.info('[jupyterlab-excalidraw] Manual save model state.', {
      path: this.context.path,
      updated,
      dirty: this.context.model.dirty
    });
    if (updated || this.context.model.dirty) {
      await this.queueContextSave();
    } else {
      console.info(
        '[jupyterlab-excalidraw] Manual save skipped: no unsaved model changes.',
        { path: this.context.path }
      );
    }
  }

  /**
   * Render the current drawing as standalone SVG markup.
   */
  async exportSvg(): Promise<string> {
    if (!this.latestScene) {
      throw new Error('The Excalidraw drawing is not ready to export.');
    }

    const [elements, appState, files] = this.latestScene;
    const svg = await exportToSvg({
      elements: getNonDeletedElements(elements),
      appState: {
        ...appState,
        exportBackground: true,
        exportWithDarkMode: appState.theme === 'dark'
      },
      files
    });
    return new XMLSerializer().serializeToString(svg);
  }

  private async initialize(): Promise<void> {
    try {
      await this.context.ready;
      const json = this.context.model.toString();
      this.initialData = await loadExcalidrawFile(json);
      if (this.isDisposed) {
        return;
      }
      this.lastLoadedJson = json;
      this.ready = true;
    } catch (error) {
      this.loadError = asError(error);
    }
    this.update();
  }

  private onEditorMount = (editor: ExcalidrawImperativeAPI): void => {
    this.applyingModel = false;

    if (!this.context.model.toString().trim()) {
      this.latestScene = [
        editor.getSceneElementsIncludingDeleted(),
        editor.getAppState(),
        editor.getFiles()
      ];
      this.sceneNeedsSync = true;
      void this.saveNow();
    }
  };

  private onSceneChange: NonNullable<ExcalidrawProps['onChange']> = (
    elements,
    appState,
    files
  ): void => {
    this.latestScene = [elements, appState, files];
    this.sceneNeedsSync = true;
    if (!this.applyingModel) {
      this.updateModelFromScene();
      this.scheduleSave();
    }
  };

  private onSaveClicked = (): void => {
    console.info('[jupyterlab-excalidraw] Save menu item clicked.', {
      path: this.context.path
    });
    void this.save()
      .then(() => {
        console.info('[jupyterlab-excalidraw] Manual save finished.', {
          path: this.context.path,
          dirty: this.context.model.dirty
        });
      })
      .catch(error => {
        console.error('[jupyterlab-excalidraw] Manual save failed.', {
          path: this.context.path,
          error
        });
      });
  };

  private onInsertSvgClicked = (): void => {
    void this.exportSvg()
      .then(svg => this.insertSvgIntoNotebook(svg))
      .catch(error =>
        showErrorMessage('Unable to insert Excalidraw SVG', asError(error))
      );
  };

  private onThemeChanged(): void {
    const theme = getExcalidrawTheme(this.themeManager);
    if (theme !== this.excalidrawTheme) {
      this.excalidrawTheme = theme;
      this.update();
    }
  }

  private onModelChanged(): void {
    if (this.writingModel) {
      return;
    }

    const json = this.context.model.toString();
    if (json === this.lastLoadedJson) {
      return;
    }

    this.cancelPendingSave();
    const generation = ++this.loadGeneration;
    this.applyingModel = true;
    void loadExcalidrawFile(json)
      .then(initialData => {
        if (this.isDisposed || generation !== this.loadGeneration) {
          return;
        }
        this.initialData = initialData;
        this.lastLoadedJson = json;
        this.loadError = null;
        this.latestScene = null;
        this.sceneNeedsSync = false;
        this.renderGeneration += 1;
        this.update();
      })
      .catch(error => {
        if (this.isDisposed || generation !== this.loadGeneration) {
          return;
        }
        this.latestScene = null;
        this.sceneNeedsSync = false;
        this.applyingModel = false;
        this.loadError = asError(error);
        this.update();
      });
  }

  private scheduleSave(): void {
    this.cancelPendingSave();
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  private async saveNow(): Promise<void> {
    const updated = this.sceneNeedsSync ? this.updateModelFromScene() : false;
    if (updated || this.context.model.dirty) {
      await this.queueContextSave();
    }
  }

  private updateModelFromScene(): boolean {
    if (!this.latestScene || this.context.model.readOnly) {
      return false;
    }

    try {
      const json = saveExcalidrawFile(...this.latestScene);
      if (json === this.lastLoadedJson) {
        this.sceneNeedsSync = false;
        return false;
      }

      this.writingModel = true;
      try {
        this.context.model.fromString(json);
        this.context.model.dirty = true;
        this.lastLoadedJson = json;
        this.sceneNeedsSync = false;
      } finally {
        this.writingModel = false;
      }
      return true;
    } catch (error) {
      console.error('Unable to serialize Excalidraw document.', error);
      return false;
    }
  }

  private queueContextSave(): Promise<void> {
    console.info('[jupyterlab-excalidraw] Queuing context.save().', {
      path: this.context.path,
      dirty: this.context.model.dirty
    });
    const request = this.pendingContextSave.then(async () => {
      console.info('[jupyterlab-excalidraw] Calling context.save().', {
        path: this.context.path,
        dirty: this.context.model.dirty
      });
      await this.context.save();
      console.info('[jupyterlab-excalidraw] context.save() resolved.', {
        path: this.context.path,
        dirty: this.context.model.dirty
      });
    });
    this.pendingContextSave = request.catch(error => {
      console.error('Unable to save Excalidraw document.', error);
    });
    return request;
  }

  private cancelPendingSave(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private initialData: ExcalidrawInitialDataState | null = null;
  private latestScene: ExcalidrawScene | null = null;
  private sceneNeedsSync = false;
  private saveTimer: number | null = null;
  private pendingContextSave: Promise<void> = Promise.resolve();
  private readonly resizeObserver: ResizeObserver | null;
  private loadGeneration = 0;
  private renderGeneration = 0;
  private excalidrawTheme: 'light' | 'dark' = 'light';
  private applyingModel = false;
  private writingModel = false;
  private ready = false;
  private lastLoadedJson = '';
  private loadError: Error | null = null;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function getExcalidrawTheme(themeManager: IThemeManager): 'light' | 'dark' {
  const theme = themeManager.theme;
  return theme && !themeManager.isLight(theme) ? 'dark' : 'light';
}
