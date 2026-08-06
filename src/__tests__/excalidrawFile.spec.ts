import { loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawProps } from '@excalidraw/excalidraw/types';

import { loadExcalidrawFile, saveExcalidrawFile } from '../excalidrawFile';

jest.mock('@excalidraw/excalidraw', () => ({
  loadFromBlob: jest.fn(),
  serializeAsJSON: jest.fn()
}));

const mockedLoad = jest.mocked(loadFromBlob);
const mockedSerialize = jest.mocked(serializeAsJSON);

describe('Excalidraw file persistence', () => {
  beforeEach(() => {
    mockedLoad.mockReset();
    mockedSerialize.mockReset();
  });

  it('represents a new empty document without parsing', async () => {
    await expect(loadExcalidrawFile('   ')).resolves.toBeNull();
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('loads native Excalidraw JSON through the official loader', async () => {
    const restored = {
      elements: [],
      appState: {},
      files: {}
    };
    mockedLoad.mockResolvedValue(restored as never);

    await expect(loadExcalidrawFile('{"type":"excalidraw"}')).resolves.toBe(
      restored
    );
    expect(mockedLoad).toHaveBeenCalledWith(expect.any(Blob), null, null);
  });

  it('serializes the complete local scene including files', () => {
    mockedSerialize.mockReturnValue(
      '{"type":"excalidraw","appState":{"gridModeEnabled":false}}'
    );
    const scene = [[], { theme: 'dark' }, {}] as unknown as Parameters<
      NonNullable<ExcalidrawProps['onChange']>
    >;

    expect(saveExcalidrawFile(...scene)).toBe(
      '{"type":"excalidraw","appState":{"gridModeEnabled":false}}'
    );
    expect(mockedSerialize).toHaveBeenCalledWith(
      scene[0],
      scene[1],
      scene[2],
      'local'
    );
  });

  it('reports invalid files clearly', async () => {
    mockedLoad.mockRejectedValue(new Error('Invalid file'));

    await expect(loadExcalidrawFile('{}')).rejects.toThrow(
      'The file is not a valid Excalidraw drawing. Invalid file'
    );
  });
});
