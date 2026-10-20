import { render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/input';
import { IconButton } from './icon-button';
import { FormField } from './form-field';

describe('FormField', () => {
  it('links the label, help text and error to the control', () => {
    render(
      <FormField
        label="Branch code"
        help="Unique within your organisation"
        error="Already in use"
        required
      >
        {(field) => <Input {...field} />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: /Branch code/ });
    expect(input).toHaveAccessibleDescription('Unique within your organisation Already in use');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
  });

  it('marks required fields with text, not only a symbol', () => {
    render(
      <FormField label="Email" required>
        {(field) => <Input {...field} />}
      </FormField>,
    );
    expect(screen.getByRole('textbox', { name: 'Email (required)' })).toBeInTheDocument();
  });

  it('is valid and undescribed when there is no help or error', () => {
    render(<FormField label="Notes">{(field) => <Input {...field} />}</FormField>);
    const input = screen.getByRole('textbox', { name: 'Notes' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('IconButton', () => {
  it('always has an accessible name', () => {
    render(<IconButton label="Delete row" icon={<svg />} />);
    expect(screen.getByRole('button', { name: 'Delete row' })).toBeInTheDocument();
  });
});
