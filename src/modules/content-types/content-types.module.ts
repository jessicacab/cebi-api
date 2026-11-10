import { Module } from '@nestjs/common';
import { AdminContentTypesController, ContentTypesController } from './content-types.controller.js';
import { ContentTypesService } from './content-types.service.js';

@Module({
  controllers: [ContentTypesController, AdminContentTypesController],
  providers: [ContentTypesService],
  exports: [ContentTypesService],
})
export class ContentTypesModule {}
