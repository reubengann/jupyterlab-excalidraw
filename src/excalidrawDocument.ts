import type { IThemeManager } from '@jupyterlab/apputils';
import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget
} from '@jupyterlab/docregistry';
import { LabIcon } from '@jupyterlab/ui-components';

import { ExcalidrawWidget } from './excalidrawWidget';

export class ExcalidrawDocumentWidget extends DocumentWidget<
  ExcalidrawWidget,
  DocumentRegistry.ICodeModel
> {}

export class ExcalidrawWidgetFactory extends ABCWidgetFactory<
  ExcalidrawDocumentWidget,
  DocumentRegistry.ICodeModel
> {
  constructor(
    options: DocumentRegistry.IWidgetFactoryOptions<ExcalidrawDocumentWidget>,
    private readonly icon: LabIcon,
    private readonly themeManager: IThemeManager,
    private readonly insertSvgIntoNotebook: (svg: string) => Promise<void>
  ) {
    super(options);
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.ICodeModel>
  ): ExcalidrawDocumentWidget {
    const widget = new ExcalidrawDocumentWidget({
      content: new ExcalidrawWidget(
        context,
        this.themeManager,
        this.insertSvgIntoNotebook
      ),
      context
    });
    widget.title.icon = this.icon;
    return widget;
  }
}
