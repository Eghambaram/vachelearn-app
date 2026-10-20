import { render, screen } from '@testing-library/react';
import HomePage from './page';

describe('HomePage', () => {
  it('marks its copy as placeholder and offers sign-in', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Placeholder copy/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('links to the demo workspaces only when they are enabled (D-063)', () => {
    vi.stubEnv('ENABLE_DEMO_WORKSPACES', 'false');
    const { unmount } = render(<HomePage />);
    expect(screen.queryByRole('link', { name: 'Open demo workspaces' })).toBeNull();
    unmount();
    vi.stubEnv('ENABLE_DEMO_WORKSPACES', 'true');
    render(<HomePage />);
    expect(screen.getByRole('link', { name: 'Open demo workspaces' })).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});
