import { Global, Module } from '@nestjs/common';
import { SequenceGeneratorService } from './sequence-generator.service';

@Global()
@Module({
  providers: [SequenceGeneratorService],
  exports: [SequenceGeneratorService],
})
export class SharedModule {}
