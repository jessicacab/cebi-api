import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsContact } from '../../../common/contact.js';
import { UserDto } from '../../users/dto/user.dto.js';

const CONTACT_DOC = {
  description:
    'Email, or mobile number. PH numbers work in any common form (09171234567, +63 917 123 4567); other countries need "+" and the country code.',
  example: 'maya@example.com',
};

/**
 * Same bar as the app's sign-up form: 8+ characters and at least one capital
 * letter, number or symbol. Supabase may add its own rules on top.
 */
const NewPassword = () => (target: object, key: string) => {
  ApiProperty({ minLength: 8, maxLength: 72, description: '8+ characters with a capital letter, number or symbol' })(target, key);
  IsString()(target, key);
  MinLength(8)(target, key);
  // Supabase (bcrypt) only reads the first 72 bytes.
  MaxLength(72)(target, key);
  Matches(/[^a-z]/, { message: 'password needs a capital letter, number or symbol' })(target, key);
};

const Code = () => (target: object, key: string) => {
  ApiProperty({ example: '123456', description: 'The 6-digit code we sent' })(target, key);
  Matches(/^\d{6}$/, { message: 'code must be 6 digits' })(target, key);
};

export class ContactDto {
  @ApiProperty(CONTACT_DOC)
  @IsContact()
  contact: string;
}

export class SignupDto extends ContactDto {
  @NewPassword()
  password: string;

  @ApiPropertyOptional({ maxLength: 80, description: 'Person or business name' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class VerifyCodeDto extends ContactDto {
  @Code()
  code: string;
}

export class LoginDto extends ContactDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  refreshToken: string;
}

export class ResetPasswordDto extends ContactDto {
  @Code()
  code: string;

  @NewPassword()
  password: string;
}

// Responses (document the API)

export class AuthSessionDto {
  @ApiProperty({ description: 'Send as "Authorization: Bearer <accessToken>"' })
  accessToken: string;
  @ApiProperty({ description: 'Keep in secure storage; trade for new tokens at /v1/auth/refresh' })
  refreshToken: string;
  @ApiProperty({ description: 'When the access token stops working' })
  expiresAt: Date;
  @ApiProperty({ type: UserDto })
  user: UserDto;
}

export class CodeSentDto {
  @ApiProperty({ enum: ['email', 'sms'], description: 'Where the code went' })
  channel: 'email' | 'sms';
}

export class SignupResultDto extends CodeSentDto {
  @ApiProperty({
    enum: ['CODE_SENT', 'SIGNED_IN'],
    description: 'CODE_SENT: show the code step, then call /v1/auth/verify. SIGNED_IN: session is ready.',
  })
  status: 'CODE_SENT' | 'SIGNED_IN';

  @ApiProperty({ type: AuthSessionDto, nullable: true })
  session: AuthSessionDto | null;
}

export class OkDto {
  @ApiProperty({ example: true })
  ok: true;
}
