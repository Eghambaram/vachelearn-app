import { kpiChange } from './kpi-change';

describe('kpiChange', () => {
  it('describes growth as up and good by default', () => {
    expect(kpiChange(110, 100, 'in 30 days')).toEqual({
      direction: 'up',
      sentiment: 'positive',
      period: 'in 30 days',
      value: '10%',
    });
  });

  it('can mark growth as bad, and shows the size of a fall without a sign', () => {
    expect(kpiChange(90, 100, 'p', { upIsGood: false })).toMatchObject({
      direction: 'down',
      sentiment: 'positive',
      value: '10%',
    });
    expect(kpiChange(120, 100, 'p', { upIsGood: false })).toMatchObject({ sentiment: 'negative' });
  });

  it('is flat and neutral when nothing changed, and absent when the start was zero', () => {
    expect(kpiChange(5, 5, 'p')).toMatchObject({ direction: 'flat', sentiment: 'neutral' });
    expect(kpiChange(5, 0, 'p')).toBeUndefined();
  });
});
