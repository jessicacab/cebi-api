import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators.js';
import { ContentTypesService } from './content-types.service.js';
import {
  ContentTypeDto,
  CreateContentTypeDto,
  ListContentTypesQuery,
  UpdateContentTypeDto,
} from './dto/content-type.dto.js';

/** Mobile app: the content types a business can pick for a campaign. */
@ApiTags('Content types')
@Controller('content-types')
export class ContentTypesController {
  constructor(private readonly contentTypes: ContentTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Content types businesses can pick, in display order' })
  @ApiOkResponse({ type: ContentTypeDto, isArray: true })
  list(@Query() query: ListContentTypesQuery) {
    return this.contentTypes.listActive(query.platforms);
  }
}

/** Admin CRM: add, edit, reorder and hide content types. */
@ApiTags('Admin · Content types')
@Roles('ADMIN')
@Controller('admin/content-types')
export class AdminContentTypesController {
  constructor(private readonly contentTypes: ContentTypesService) {}

  @Get()
  @ApiOperation({ summary: 'List every content type, hidden ones included' })
  @ApiOkResponse({ type: ContentTypeDto, isArray: true })
  list() {
    return this.contentTypes.listAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a content type' })
  @ApiOkResponse({ type: ContentTypeDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentTypes.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a content type', description: 'Errors: SLUG_TAKEN, VALIDATION_ERROR.' })
  @ApiOkResponse({ type: ContentTypeDto })
  create(@Body() dto: CreateContentTypeDto) {
    return this.contentTypes.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a content type (set active to false to hide it)' })
  @ApiOkResponse({ type: ContentTypeDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContentTypeDto) {
    return this.contentTypes.update(id, dto);
  }
}
