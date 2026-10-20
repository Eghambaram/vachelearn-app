import { ariaSort, cursorReducer, INITIAL_CURSORS, nextSort } from './table';

describe('nextSort', () => {
  it('sorts a newly clicked column ascending', () => {
    expect(nextSort(null, 'name')).toEqual({ field: 'name', direction: 'asc' });
    expect(nextSort({ field: 'dueAt', direction: 'desc' }, 'name')).toEqual({
      field: 'name',
      direction: 'asc',
    });
  });

  it('flips the direction when the sorted column is clicked again', () => {
    expect(nextSort({ field: 'name', direction: 'asc' }, 'name')).toEqual({
      field: 'name',
      direction: 'desc',
    });
    expect(nextSort({ field: 'name', direction: 'desc' }, 'name')).toEqual({
      field: 'name',
      direction: 'asc',
    });
  });
});

describe('ariaSort', () => {
  it('reports the order only on the sorted column', () => {
    const sort = { field: 'name', direction: 'desc' } as const;
    expect(ariaSort(sort, 'name')).toBe('descending');
    expect(ariaSort({ field: 'name', direction: 'asc' }, 'name')).toBe('ascending');
    expect(ariaSort(sort, 'dueAt')).toBe('none');
    expect(ariaSort(null, 'name')).toBe('none');
  });
});

describe('cursorReducer', () => {
  it('starts on the first page with no cursor', () => {
    expect(INITIAL_CURSORS).toEqual([null]);
  });

  it('pushes the next cursor and pops back to the previous page', () => {
    const page2 = cursorReducer(INITIAL_CURSORS, { type: 'next', cursor: 'c2' });
    const page3 = cursorReducer(page2, { type: 'next', cursor: 'c3' });
    expect(page3).toEqual([null, 'c2', 'c3']);
    expect(cursorReducer(page3, { type: 'previous' })).toEqual([null, 'c2']);
  });

  it('never goes before the first page', () => {
    expect(cursorReducer(INITIAL_CURSORS, { type: 'previous' })).toBe(INITIAL_CURSORS);
  });

  it('resets to the first page (search, filter, sort or limit changed)', () => {
    const page3 = [null, 'c2', 'c3'];
    expect(cursorReducer(page3, { type: 'reset' })).toEqual([null]);
  });
});
