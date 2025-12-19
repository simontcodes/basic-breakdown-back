import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export enum IssueStatusDto {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export class ContentJsonDto {
  // Define the structure of contentJson here
  @IsString()
  key!: string;

  @IsString()
  value!: string;
}

export class CreateIssueDto {
  @IsString()
  slug!: string;

  @IsString()
  title!: string;

  @IsString()
  subject!: string;

  @IsOptional()
  @IsString()
  previewText?: string;

  @IsOptional()
  @IsEnum(IssueStatusDto)
  status?: IssueStatusDto;

  @IsObject()
  contentJson!: Record<string, any>;
}
