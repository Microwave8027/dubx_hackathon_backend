import { titleFor } from './useDocumentTitle';

describe('titleFor', () => {
  it('names each screen', () => {
    expect(titleFor('/', 0)).toBe('Dashboard · Command Center');
    expect(titleFor('/approvals', 0)).toBe('Approvals · Command Center');
    expect(titleFor('/layers/abc', 0)).toBe('Layer · Command Center');
    expect(titleFor('/settings', 0)).toBe('Settings · Command Center');
  });

  it('shows the pending approval count so a background tab signals it needs you', () => {
    expect(titleFor('/', 3)).toBe('(3) Dashboard · Command Center');
  });
});
