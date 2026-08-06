import { loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import type {
  ExcalidrawInitialDataState,
  ExcalidrawProps
} from '@excalidraw/excalidraw/types';

export type ExcalidrawScene = Parameters<
  NonNullable<ExcalidrawProps['onChange']>
>;

/**
 * Parse and restore a native .excalidraw document.
 */
export async function loadExcalidrawFile(
  json: string
): Promise<ExcalidrawInitialDataState | null> {
  if (!json.trim()) {
    return null;
  }

  try {
    return await loadFromBlob(
      new Blob([json], { type: 'application/vnd.excalidraw+json' }),
      null,
      null
    );
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`The file is not a valid Excalidraw drawing.${detail}`);
  }
}

/**
 * Serialize a scene as native .excalidraw JSON, including image files.
 */
export function saveExcalidrawFile(
  ...[elements, appState, files]: ExcalidrawScene
): string {
  return serializeAsJSON(elements, appState, files, 'local');
}
