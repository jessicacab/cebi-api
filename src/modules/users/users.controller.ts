import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators.js';
import type { User } from '../../generated/prisma/client.js';
import {
  AdminUpdateUserDto,
  ListUsersQuery,
  UpdateMeDto,
  UserDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

/** Mobile app: the signed-in user's own account. */
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my account' })
  @ApiOkResponse({ type: UserDto })
  getMe(@CurrentUser() user: User) {
    return this.users.getAccount(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my account (and pick creator/business once)' })
  @ApiOkResponse({ type: UserDto })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user, dto);
  }
}

/** Admin CRM: manage every user. */
@ApiTags('Admin · Users')
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse({ type: UserDto, isArray: true })
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  @ApiOkResponse({ type: UserDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getAccount(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a user’s role or suspend them' })
  @ApiOkResponse({ type: UserDto })
  update(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.users.adminUpdate(admin, id, dto);
  }
}
