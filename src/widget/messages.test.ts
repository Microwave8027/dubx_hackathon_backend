import { OpenPayloadSchema, targetPath } from './messages';

describe('targetPath', () => {
  it('opens the dashboard with no target', () => {
    expect(targetPath()).toBe('/');
    expect(targetPath({})).toBe('/');
  });
  it('opens a layer', () => {
    expect(targetPath({ layerId: 'l 1' })).toBe('/layers/l%201');
  });
  it('prefers the approval when one is waiting', () => {
    expect(targetPath({ layerId: 'l1', approvalId: 'a1' })).toBe('/approvals');
  });
});

describe('OpenPayloadSchema', () => {
  it('only accepts in-app paths', () => {
    expect(OpenPayloadSchema.safeParse({ path: '/layers/x' }).success).toBe(true);
    expect(OpenPayloadSchema.safeParse({ path: 'https://evil.example' }).success).toBe(false);
    expect(OpenPayloadSchema.safeParse({ path: '//evil.example' }).success).toBe(false);
  });
});
