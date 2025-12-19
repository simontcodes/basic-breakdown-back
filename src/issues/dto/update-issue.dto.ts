import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { IssueStatusDto } from './create-issue.dto';

export class UpdateIssueDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  previewText?: string;

  @IsOptional()
  @IsEnum(IssueStatusDto)
  status?: IssueStatusDto;

  @IsOptional()
  @IsObject()
  contentJson?: Record<string, any>;
}
