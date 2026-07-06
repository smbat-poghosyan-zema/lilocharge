import * as nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';

import { MailService, type StationProblemReportEmailInput, escapeHtml } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const createTransportMock = nodemailer.createTransport as jest.Mock;

const SMTP_ENV_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM_ADDRESS',
] as const;

const baseInput: StationProblemReportEmailInput = {
  operatorEmail: 'operator@example.com',
  operatorName: 'Ada Operator',
  stationName: 'Yerevan Central',
  stationAddress: '1 Republic Square',
  problemType: 'CONNECTOR_BROKEN',
  description: 'The cable is frayed.',
  reporterName: 'Bob Reporter',
  reportedAt: '2026-07-06T10:00:00.000Z',
};

describe('MailService', () => {
  const originalEnv: Record<string, string | undefined> = {};
  let sendMailMock: jest.Mock<Promise<unknown>, [SendMailOptions]>;

  beforeAll(() => {
    for (const key of SMTP_ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
  });

  beforeEach(() => {
    for (const key of SMTP_ENV_KEYS) {
      delete process.env[key];
    }

    sendMailMock = jest.fn<Promise<unknown>, [SendMailOptions]>().mockResolvedValue({});
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
  });

  afterAll(() => {
    for (const key of SMTP_ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function enableSmtp(): void {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASSWORD = 'secret';
  }

  function getSentMailOptions(): SendMailOptions {
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    return sendMailMock.mock.calls[0][0];
  }

  describe('configuration resolution', () => {
    it('falls back to a disabled stream transport when SMTP config is missing', async () => {
      const service = new MailService();

      expect(createTransportMock).toHaveBeenCalledWith({ streamTransport: true });

      await service.sendStationProblemReportEmail(baseInput);
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('treats partial SMTP configuration as disabled', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';

      const service = new MailService();
      await service.sendStationProblemReportEmail(baseInput);

      expect(createTransportMock).toHaveBeenCalledWith({ streamTransport: true });
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('creates an SMTP transport from environment configuration', () => {
      enableSmtp();

      new MailService();

      expect(createTransportMock).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'mailer', pass: 'secret' },
      });
    });

    it('enables implicit TLS for port 465', () => {
      enableSmtp();
      process.env.SMTP_PORT = '465';

      new MailService();

      expect(createTransportMock).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true }),
      );
    });

    it('uses the configured from address, defaulting to noreply@lilocharge.am', async () => {
      enableSmtp();
      await new MailService().sendStationProblemReportEmail(baseInput);
      expect(getSentMailOptions().from).toBe('noreply@lilocharge.am');

      sendMailMock.mockClear();
      process.env.SMTP_FROM_ADDRESS = 'alerts@lilocharge.am';
      await new MailService().sendStationProblemReportEmail(baseInput);
      expect(getSentMailOptions().from).toBe('alerts@lilocharge.am');
    });
  });

  describe('sendStationProblemReportEmail', () => {
    it('sends the email with the correct recipient and subject when enabled', async () => {
      enableSmtp();
      const service = new MailService();

      await service.sendStationProblemReportEmail(baseInput);

      const options = getSentMailOptions();
      expect(options.to).toBe('operator@example.com');
      expect(options.subject).toBe('[LiloCharge] Problem Report: Yerevan Central');
      expect(typeof options.text).toBe('string');
      expect(typeof options.html).toBe('string');
    });

    it('rethrows transport failures after logging', async () => {
      enableSmtp();
      sendMailMock.mockRejectedValue(new Error('smtp unavailable'));
      const service = new MailService();

      await expect(service.sendStationProblemReportEmail(baseInput)).rejects.toThrow(
        'smtp unavailable',
      );
    });

    it('escapes a malicious description in the HTML body but not in the text body', async () => {
      enableSmtp();
      const service = new MailService();
      const maliciousInput: StationProblemReportEmailInput = {
        ...baseInput,
        description: '<script>alert("xss")</script>',
      };

      await service.sendStationProblemReportEmail(maliciousInput);

      const options = getSentMailOptions();
      const html = options.html as string;
      const text = options.text as string;

      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(html).not.toContain('<script>');
      expect(text).toContain('<script>alert("xss")</script>');
    });

    it('escapes every user-controlled field interpolated into the HTML body', async () => {
      enableSmtp();
      const service = new MailService();
      const maliciousInput: StationProblemReportEmailInput = {
        ...baseInput,
        operatorName: '<b>op</b>',
        stationName: 'Station <img src=x>',
        stationAddress: '"quoted" & <address>',
        problemType: "<svg onload='x'>",
        reporterName: '</div><script>1</script>',
        reportedAt: '<time>',
        description: 'plain',
      };

      await service.sendStationProblemReportEmail(maliciousInput);

      const html = getSentMailOptions().html as string;
      expect(html).toContain('&lt;b&gt;op&lt;/b&gt;');
      expect(html).toContain('Station &lt;img src=x&gt;');
      expect(html).toContain('&quot;quoted&quot; &amp; &lt;address&gt;');
      expect(html).toContain('&lt;svg onload=&#39;x&#39;&gt;');
      expect(html).toContain('&lt;/div&gt;&lt;script&gt;1&lt;/script&gt;');
      expect(html).toContain('&lt;time&gt;');
      expect(html).not.toContain('<img src=x>');
      expect(html).not.toContain('<script>');
    });
  });

  describe('escapeHtml', () => {
    it('escapes ampersand, angle brackets, and quotes', () => {
      expect(escapeHtml(`Tom & Jerry's <"quoted">`)).toBe(
        'Tom &amp; Jerry&#39;s &lt;&quot;quoted&quot;&gt;',
      );
    });

    it('escapes the ampersand first so entities are not double-decoded', () => {
      expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });

    it('returns plain strings unchanged', () => {
      expect(escapeHtml('no special characters')).toBe('no special characters');
    });
  });
});
