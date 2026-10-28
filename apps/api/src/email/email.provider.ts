import { PinoLogger } from 'nestjs-pino';
import { createTransport, type Transporter } from 'nodemailer';
import type { AppConfig } from '../config/env';

/*
 * EmailProvider adapter (MASTER_PROMPT: adapters for everything external). `console` for local work without Mailpit,
 * `smtp` for Mailpit locally and an SMTP relay in production until D-082 picks a provider. Neither ever logs a body:
 * verification and reset emails carry single-use links (D-081).
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Stable per job, e.g. `<job-…@vachelearn.invalid>`: a resend after a crash is recognisable as the same message. */
  messageId: string;
};

export abstract class EmailProvider {
  abstract readonly name: string;
  abstract send(message: EmailMessage): Promise<void>;
}

/** Writes recipient (masked) and subject to the log; the body is dropped. Refused in production (env.ts). */
export class ConsoleEmailProvider extends EmailProvider {
  readonly name = 'console';
  constructor(private readonly logger: PinoLogger) {
    super();
    logger.setContext(ConsoleEmailProvider.name);
  }

  async send(message: EmailMessage) {
    this.logger.info(
      { to: maskAddress(message.to), subject: message.subject, messageId: message.messageId },
      'email not sent (console provider): body withheld',
    );
  }
}

export class SmtpEmailProvider extends EmailProvider {
  readonly name = 'smtp';
  private readonly transport: Transporter;

  constructor(
    smtp: NonNullable<AppConfig['email']['smtp']>,
    private readonly from: string,
  ) {
    super();
    this.transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: smtp.requireTLS,
      auth: smtp.auth,
      // Never let nodemailer log message contents or credentials.
      logger: false,
      debug: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      // Certificates are always verified: never set tls.rejectUnauthorized = false.
    });
  }

  async send(message: EmailMessage) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: message.messageId,
    });
  }
}

/** `a…@example.com`: enough to tell messages apart in a local log, without the full address. */
export function maskAddress(address: string) {
  const at = address.lastIndexOf('@');
  return at > 0 ? `${address[0]}…${address.slice(at)}` : '…';
}

export function createEmailProvider(config: AppConfig, logger: PinoLogger): EmailProvider {
  return config.email.smtp
    ? new SmtpEmailProvider(config.email.smtp, config.email.from)
    : new ConsoleEmailProvider(logger);
}
