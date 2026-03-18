import { Module } from '@nestjs/common';

import { MailService } from './mail.service';

/** Feature module for sending transactional emails. */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
