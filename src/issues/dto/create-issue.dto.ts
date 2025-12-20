import { Transform } from 'class-transformer';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export enum IssueStatusDto {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export class CreateIssueDto {
  @IsString()
  slug: string;

  @IsString()
  title: string;

  @IsString()
  subject: string;

  @IsOptional()
  @IsString()
  previewText?: string;

  @IsOptional()
  @IsEnum(IssueStatusDto)
  status?: IssueStatusDto;

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value as unknown; // will fail IsObject()
      }
    }
    return value as unknown;
  })
  @IsObject()
  contentJson: Record<string, any>;
}
