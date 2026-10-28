import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetPasswordForm } from './set-password-form';

const TOKEN = 'T'.repeat(43);

function respond(status: number, body?: unknown) {
  return vi
    .fn()
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

function openWithHash(hash: string, purpose: 'set' | 'reset' = 'set') {
  window.history.replaceState(null, '', `/set-password${hash}`);
  render(<SetPasswordForm purpose={purpose} />);
  return userEvent.setup({ delay: null });
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  confirm = password,
) {
  await user.type(await screen.findByLabelText(/^New password/), password);
  await user.type(screen.getByLabelText(/^Repeat the new password/), confirm);
  await user.click(screen.getByRole('button', { name: 'Save the password' }));
}

afterEach(() => vi.unstubAllGlobals());

describe('SetPasswordForm', () => {
  it('reads the token from the fragment once and removes it from the address bar', async () => {
    const fetchMock = respond(204);
    vi.stubGlobal('fetch', fetchMock);
    const user = openWithHash(`#token=${TOKEN}`);
    await screen.findByLabelText(/^New password/);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    await fill(user, 'a long and private passphrase');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      token: TOKEN,
      password: 'a long and private passphrase',
    });
    const saved = await screen.findByRole('status');
    expect(saved).toHaveTextContent(/Your password is saved/);
    // The form gave way to the result: focus moves to it so it is read out.
    expect(saved).toHaveFocus();
  });

  it('without a valid token it asks for a new link instead of showing a form', async () => {
    openWithHash('#token=short');
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs the link from your email/);
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.queryByLabelText(/^New password/)).toBeNull();
  });

  it('checks the two passwords match before calling the API', async () => {
    const fetchMock = respond(204);
    vi.stubGlobal('fetch', fetchMock);
    const user = openWithHash(`#token=${TOKEN}`);
    await fill(user, 'a long and private passphrase', 'a different passphrase');
    expect(screen.getByLabelText(/^Repeat the new password/)).toHaveAccessibleDescription(
      /not the same/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps the policy field error onto the password field, and an invalid link to a new-link prompt', async () => {
    vi.stubGlobal(
      'fetch',
      respond(422, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid request',
          requestId: 'req_1',
          fieldErrors: [{ field: 'password', code: 'too_common', message: 'x' }],
        },
      }),
    );
    const user = openWithHash(`#token=${TOKEN}`);
    await fill(user, 'qwertyuiopasdfghjkl');
    expect(screen.getByLabelText(/^New password/)).toHaveAccessibleDescription(/too common/);
    expect(screen.getByLabelText(/^New password/)).toHaveFocus();

    vi.stubGlobal(
      'fetch',
      respond(400, { error: { code: 'INVALID_LINK', message: 'x', requestId: 'req_2' } }),
    );
    await user.click(screen.getByRole('button', { name: 'Save the password' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/expired or was already used/);
    expect(alert).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toBeVisible();
  });
});

describe('SetPasswordForm (review fixes)', () => {
  it('a reset says the user was signed out elsewhere; an empty password is a field error', async () => {
    const fetchMock = respond(204);
    vi.stubGlobal('fetch', fetchMock);
    const user = openWithHash(`#token=${TOKEN}`, 'reset');
    const submit = await screen.findByRole('button', { name: 'Save the password' });
    // Never disabled: keyboard users can always reach it.
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(screen.getByLabelText(/^New password/)).toHaveAccessibleDescription(
      /Enter a new password/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await fill(user, 'a long and private passphrase');
    expect(await screen.findByRole('status')).toHaveTextContent(/signed out on every other device/);
  });

  it('an over-long password is called too long, not too short', async () => {
    vi.stubGlobal(
      'fetch',
      respond(422, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid request',
          requestId: 'req_1',
          fieldErrors: [{ field: 'password', code: 'too_big', message: 'x' }],
        },
      }),
    );
    const user = openWithHash(`#token=${TOKEN}`);
    await fill(user, 'x'.repeat(30));
    expect(screen.getByLabelText(/^New password/)).toHaveAccessibleDescription(/at most 128/);
  });
});
