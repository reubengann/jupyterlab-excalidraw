import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  ICommandPalette,
  IThemeManager,
  WidgetTracker
} from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { ILauncher } from '@jupyterlab/launcher';
import { INotebookTracker } from '@jupyterlab/notebook';
import { LabIcon } from '@jupyterlab/ui-components';

import {
  ExcalidrawDocumentWidget,
  ExcalidrawWidgetFactory
} from './excalidrawDocument';
import { insertSvgIntoNotebook } from './notebook';

export const PLUGIN_ID = 'jupyterlab-excalidraw:plugin';
export const CREATE_COMMAND = 'jupyterlab-excalidraw:create-new';
export const FACTORY_NAME = 'Excalidraw';
export const FILE_TYPE = 'excalidraw';

export const excalidrawIcon = new LabIcon({
  name: 'jupyterlab-excalidraw:icon',
  svgstr:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm2 10.5 3-3 2 2 3.5-4 2.5 3V17H7v-1.5zM8.5 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>'
});

export type ActivateOptions = {
  app: JupyterFrontEnd;
  restorer: ILayoutRestorer;
  docManager: IDocumentManager;
  themeManager: IThemeManager;
  launcher: ILauncher | null;
  palette: ICommandPalette | null;
  notebookTracker: INotebookTracker | null;
};

export function activate({
  app,
  restorer,
  docManager,
  themeManager,
  launcher,
  palette,
  notebookTracker
}: ActivateOptions): void {
  app.docRegistry.addFileType({
    name: FILE_TYPE,
    displayName: 'Excalidraw Drawing',
    extensions: ['.excalidraw'],
    mimeTypes: ['application/vnd.excalidraw+json'],
    contentType: 'file',
    fileFormat: 'text',
    icon: excalidrawIcon
  });

  const factory = new ExcalidrawWidgetFactory(
    {
      name: FACTORY_NAME,
      label: 'Excalidraw',
      modelName: 'text',
      fileTypes: [FILE_TYPE],
      defaultFor: [FILE_TYPE]
    },
    excalidrawIcon,
    themeManager,
    svg =>
      insertSvgIntoNotebook(notebookTracker, app.serviceManager.contents, svg)
  );
  app.docRegistry.addWidgetFactory(factory);

  const tracker = new WidgetTracker<ExcalidrawDocumentWidget>({
    namespace: 'jupyterlab-excalidraw'
  });
  factory.widgetCreated.connect((_sender, widget) => {
    widget.context.pathChanged.connect(() => {
      void tracker.save(widget);
    });
    void tracker.add(widget);
  });

  app.commands.addCommand(CREATE_COMMAND, {
    describedBy: { args: null },
    label: 'New Excalidraw Drawing',
    caption: 'Create an Excalidraw drawing',
    icon: excalidrawIcon,
    execute: async args => {
      const cwd = typeof args['cwd'] === 'string' ? args['cwd'] : '';
      const model = await docManager.newUntitled({
        path: cwd,
        type: 'file',
        ext: '.excalidraw'
      });
      return docManager.openOrReveal(model.path, FACTORY_NAME);
    }
  });

  launcher?.add({
    command: CREATE_COMMAND,
    category: 'Other',
    rank: 10
  });
  palette?.addItem({
    command: CREATE_COMMAND,
    category: 'Excalidraw'
  });

  void restorer.restore(tracker, {
    command: 'docmanager:open',
    args: widget => ({
      path: widget.context.path,
      factory: FACTORY_NAME
    }),
    name: widget => `${widget.context.path}:${FACTORY_NAME}`
  });
}

/**
 * Initialization data for the jupyterlab-excalidraw extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Create and edit Excalidraw documents in JupyterLab.',
  autoStart: true,
  requires: [ILayoutRestorer, IDocumentManager, IThemeManager],
  optional: [ILauncher, ICommandPalette, INotebookTracker],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer,
    docManager: IDocumentManager,
    themeManager: IThemeManager,
    launcher: ILauncher | null,
    palette: ICommandPalette | null,
    notebookTracker: INotebookTracker | null
  ) => {
    activate({
      app,
      restorer,
      docManager,
      themeManager,
      launcher,
      palette,
      notebookTracker
    });
  }
};

export default plugin;
