import { z } from "zod";

export const namedResourceSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
  })
  .passthrough();

export const currentUserResponseSchema = z
  .object({
    user: z.object({
      id: z.number().int(),
      login: z.string(),
      firstname: z.string(),
      lastname: z.string(),
      mail: z.string().optional(),
    }),
  })
  .passthrough();

export const customFieldSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    value: z.union([z.string(), z.array(z.string())]).default(""),
  })
  .passthrough();

const journalDetailSchema = z
  .object({
    property: z.string(),
    name: z.string(),
    old_value: z.string().optional(),
    new_value: z.string().optional(),
  })
  .passthrough();

const journalSchema = z
  .object({
    id: z.number().int(),
    user: namedResourceSchema,
    notes: z.string().default(""),
    created_on: z.string(),
    details: z.array(journalDetailSchema).default([]),
  })
  .passthrough();

const relationSchema = z
  .object({
    id: z.number().int(),
    issue_id: z.number().int(),
    issue_to_id: z.number().int(),
    relation_type: z.string(),
    delay: z.number().nullish(),
  })
  .passthrough();

const issueStatusSchema = namedResourceSchema.extend({
  is_closed: z.boolean().optional(),
});

export const issueSchema = z
  .object({
    id: z.number().int(),
    project: namedResourceSchema,
    tracker: namedResourceSchema,
    status: issueStatusSchema,
    priority: namedResourceSchema,
    author: namedResourceSchema,
    assigned_to: namedResourceSchema.optional(),
    fixed_version: namedResourceSchema.optional(),
    subject: z.string(),
    description: z.string().nullish(),
    start_date: z.string().nullish(),
    due_date: z.string().nullish(),
    done_ratio: z.number().optional(),
    is_private: z.boolean().optional(),
    estimated_hours: z.number().nullish(),
    custom_fields: z.array(customFieldSchema).default([]),
    created_on: z.string().optional(),
    updated_on: z.string().optional(),
    closed_on: z.string().nullish(),
    journals: z.array(journalSchema).optional(),
    relations: z.array(relationSchema).optional(),
    allowed_statuses: z.array(namedResourceSchema).optional(),
  })
  .passthrough();

export const issueResponseSchema = z
  .object({
    issue: issueSchema,
  })
  .passthrough();

export const issuesResponseSchema = z
  .object({
    issues: z.array(issueSchema),
    total_count: z.number().int(),
    offset: z.number().int(),
    limit: z.number().int(),
  })
  .passthrough();

export type RawIssue = z.infer<typeof issueSchema>;
