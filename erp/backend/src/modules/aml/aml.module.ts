import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovedManufacturer } from '../../entities/approved-manufacturer.entity';
import { AmlController } from './aml.controller';
import { AmlService } from './aml.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApprovedManufacturer])],
  controllers: [AmlController],
  providers: [AmlService],
  exports: [AmlService],
})
export class AmlModule {}
