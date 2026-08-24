import { z } from "zod";

const namedResourceSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
});

const issueStatusSchema = namedResourceSchema.extend({
  is_closed: z.boolean().optional(),
});

const customFieldSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
});

const journalDetailSchema = z.object({
  property: z.string(),
  name: z.string(),
  old_value: z.string().optional(),
  new_value: z.string().optional(),
});

const journalSchema = z.object({
  id: z.number().int().positive(),
  user: namedResourceSchema,
  notes: z.string(),
  created_on: z.string(),
  details: z.array(journalDetailSchema),
});

const relationSchema = z.object({
  id: z.number().int().positive(),
  issue_id: z.number().int().positive(),
  issue_to_id: z.number().int().positive(),
  relation_type: z.string(),
  delay: z.number().optional(),
});

interface IssueChildOutput {
  id: number;
  tracker?: {
    id: number;
    name: string;
  };
  subject: string;
  children?: IssueChildOutput[];
}

const issueChildSchema: z.ZodType<IssueChildOutput> = z.lazy(() =>
  z.object({
    id: z.number().int().positive(),
    tracker: namedResourceSchema.optional(),
    subject: z.string(),
    children: z.array(issueChildSchema).optional(),
  }),
);

const attachmentSchema = z.object({
  id: z.number().int().positive(),
  filename: z.string(),
  filesize: z.number().int().nonnegative(),
  content_type: z.string().optional(),
  description: z.string().optional(),
  content_url: z.string(),
  thumbnail_url: z.string().optional(),
  author: namedResourceSchema.optional(),
  created_on: z.string(),
});

export const currentUserOutputSchema = z.object({
  id: z.number().int().positive(),
  login: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  mail: z.string().optional(),
});

export const getIssueOutputSchema = z.object({
  id: z.number().int().positive(),
  project: namedResourceSchema,
  tracker: namedResourceSchema,
  status: issueStatusSchema,
  priority: namedResourceSchema,
  author: namedResourceSchema,
  assigned_to: namedResourceSchema.optional(),
  fixed_version: namedResourceSchema.optional(),
  subject: z.string(),
  description: z.string().optional(),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  done_ratio: z.number().optional(),
  is_private: z.boolean().optional(),
  estimated_hours: z.number().optional(),
  custom_fields: z.array(customFieldSchema),
  created_on: z.string().optional(),
  updated_on: z.string().optional(),
  closed_on: z.string().optional(),
  journals: z.array(journalSchema).optional(),
  relations: z.array(relationSchema).optional(),
  children: z.array(issueChildSchema).optional(),
  attachments: z.array(attachmentSchema).optional(),
  allowed_statuses: z.array(namedResourceSchema).optional(),
});

const issueSummarySchema = z.object({
  id: z.number().int().positive(),
  subject: z.string(),
  project: namedResourceSchema,
  tracker: namedResourceSchema,
  status: issueStatusSchema,
  priority: namedResourceSchema,
  assigned_to: namedResourceSchema.optional(),
  fixed_version: namedResourceSchema.optional(),
  updated_on: z.string().optional(),
});

export const listIssuesOutputSchema = z.object({
  items: z.array(issueSummarySchema),
  total_count: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

const projectCoreSchema = z.object({
  id: z.number().int().positive(),
  identifier: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.number().optional(),
  is_public: z.boolean().optional(),
  parent: namedResourceSchema.optional(),
  created_on: z.string().optional(),
  updated_on: z.string().optional(),
});

const projectCustomFieldSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  field_format: z.string().optional(),
  is_required: z.boolean().optional(),
});

const projectVersionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  due_date: z.string().optional(),
  sharing: z.string().optional(),
});

const membershipRoleSchema = namedResourceSchema.extend({
  inherited: z.boolean().optional(),
});

const projectMemberSchema = z.object({
  id: z.number().int().positive(),
  user: namedResourceSchema.optional(),
  group: namedResourceSchema.optional(),
  roles: z.array(membershipRoleSchema),
});

export const getProjectOutputSchema = z.object({
  project: projectCoreSchema,
  trackers: z.array(namedResourceSchema),
  categories: z.array(namedResourceSchema),
  custom_fields: z.array(projectCustomFieldSchema),
  versions: z.array(projectVersionSchema).nullable(),
  members: z.array(projectMemberSchema).nullable(),
  priorities: z.array(namedResourceSchema).nullable(),
  warnings: z.array(z.string()),
});

const projectSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  identifier: z.string(),
  parent_id: z.number().int().positive().optional(),
});

export const listProjectsOutputSchema = z.object({
  items: z.array(projectSummarySchema),
  total_count: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

const searchResultSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  type: z.string(),
  url: z.string(),
  description: z.string().optional(),
  datetime: z.string().optional(),
});

export const searchOutputSchema = z.object({
  items: z.array(searchResultSchema),
  total_count: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});
