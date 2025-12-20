import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum IssueStatusDto {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export class CreateIssueDto {
  @IsString() slug: string;
  @IsString() title: string;
  @IsString() subject: string;

  @IsOptional() @IsString() previewText?: string;
  @IsOptional() @IsString() intro?: string;
  @IsOptional() @IsString() whatsGoingOn?: string;
  @IsOptional() @IsString() whyItMatters?: string;
  @IsOptional() @IsString() readMore?: string;

  @IsOptional() @IsEnum(IssueStatusDto) status?: IssueStatusDto;
}
