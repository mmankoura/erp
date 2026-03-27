import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PoHistoryService } from './po-history.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('purchase-orders/history')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class PoHistoryController {
  constructor(private readonly poHistoryService: PoHistoryService) {}

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.poHistoryService.findAll(
      search,
      limit ? parseInt(limit, 10) : 1000,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('count')
  async count() {
    const count = await this.poHistoryService.count();
    return { count };
  }

  @Post('import')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            fileType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.poHistoryService.importFromExcel(file.buffer);
  }
}
