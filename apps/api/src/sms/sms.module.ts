import { Module } from '@nestjs/common';

import { SmsService } from './sms.service';

/** Feature module for sending transactional SMS messages. */
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
