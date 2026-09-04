import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements neither createObjectURL nor revokeObjectURL, and the file
 * widgets need them: a decoded file is handed to the page as a blob URL so
 * that "Download" needs no server.
 *
 * A stub is enough here, because what the tests are about is that the URL is
 * created from the right bytes and given to the right anchor, not what the
 * browser does with it afterwards.
 */
if (!('createObjectURL' in URL)) {
  let counter = 0;
  Object.assign(URL, {
    createObjectURL: (_blob: Blob | MediaSource): string => `blob:test/${++counter}`,
    revokeObjectURL: (_url: string): void => {},
  });
}
