import { render, screen } from '@testing-library/react';
import HomePage from './page';

describe('HomePage', () => {
  it('renders the scaffold heading and makes no feature claims', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'VacheLearn — scaffold' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No features are available yet/)).toBeInTheDocument();
  });
});
