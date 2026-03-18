import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

/** Input for sending a station problem notification email. */
export interface StationProblemReportEmailInput {
  readonly operatorEmail: string;
  readonly operatorName: string;
  readonly stationName: string;
  readonly stationAddress: string;
  readonly problemType: string;
  readonly description: string;
  readonly reporterName: string;
  readonly reportedAt: string;
}

/** Service responsible for sending transactional emails via SMTP. */
@Injectable()
export class MailService {
  private readonly logger: Logger = new Logger(MailService.name);
  private readonly transporter: Mail;
  private readonly fromAddress: string;
  private readonly enabled: boolean;

  constructor() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    this.fromAddress = process.env.SMTP_FROM_ADDRESS ?? 'noreply@lilocharge.am';

    this.enabled = Boolean(smtpHost && smtpPort && smtpUser && smtpPassword);

    if (!this.enabled) {
      this.logger.warn('SMTP configuration missing - email sending is disabled');
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
      });
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });
  }

  /**
   * Sends a problem report notification email to a station operator.
   * Includes station details, problem description, and reporter info.
   */
  public async sendStationProblemReportEmail(input: StationProblemReportEmailInput): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Email sending disabled - skipping problem report notification');
      return;
    }

    const subject = `[LiloCharge] Problem Report: ${input.stationName}`;
    const text = this.buildProblemReportTextEmail(input);
    const html = this.buildProblemReportHtmlEmail(input);

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: input.operatorEmail,
        subject,
        text,
        html,
      });

      this.logger.log(
        `Problem report email sent to ${input.operatorEmail} for station ${input.stationName}`,
      );
    } catch (error: unknown) {
      this.logger.error(`Failed to send problem report email: ${resolveErrorMessage(error)}`);
      throw error;
    }
  }

  /** Builds a plain-text problem report email body. */
  private buildProblemReportTextEmail(input: StationProblemReportEmailInput): string {
    return `
Dear ${input.operatorName},

A problem has been reported for one of your charging stations on LiloCharge.

Station: ${input.stationName}
Address: ${input.stationAddress}
Problem Type: ${input.problemType}
Reported At: ${input.reportedAt}
Reported By: ${input.reporterName}

Description:
${input.description}

Please investigate and resolve this issue as soon as possible to maintain service quality.

---
LiloCharge Team
    `.trim();
  }

  /** Builds an HTML problem report email body. */
  private buildProblemReportHtmlEmail(input: StationProblemReportEmailInput): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #00A86B; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #555; }
    .value { margin-top: 5px; }
    .description-box { background-color: white; padding: 15px; border-left: 4px solid #00A86B; margin-top: 10px; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>LiloCharge Problem Report</h2>
    </div>
    <div class="content">
      <p>Dear ${input.operatorName},</p>
      <p>A problem has been reported for one of your charging stations:</p>
      
      <div class="field">
        <div class="label">Station:</div>
        <div class="value">${input.stationName}</div>
      </div>
      
      <div class="field">
        <div class="label">Address:</div>
        <div class="value">${input.stationAddress}</div>
      </div>
      
      <div class="field">
        <div class="label">Problem Type:</div>
        <div class="value">${input.problemType}</div>
      </div>
      
      <div class="field">
        <div class="label">Reported At:</div>
        <div class="value">${input.reportedAt}</div>
      </div>
      
      <div class="field">
        <div class="label">Reported By:</div>
        <div class="value">${input.reporterName}</div>
      </div>
      
      <div class="field">
        <div class="label">Description:</div>
        <div class="description-box">${input.description}</div>
      </div>
      
      <p>Please investigate and resolve this issue as soon as possible to maintain service quality.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from LiloCharge</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

/** Resolves log-friendly error text for unknown thrown values. */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown email error';
}
