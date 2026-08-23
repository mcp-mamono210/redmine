export interface RedmineNamedResource {
  id: number;
  name: string;
}

export interface RedmineUser {
  id: number;
  login: string;
  firstname: string;
  lastname: string;
  mail?: string;
}

export interface RedmineCustomField {
  id: number;
  name: string;
  value: string | string[];
}

export interface RedmineJournalDetail {
  property: string;
  name: string;
  oldValue?: string;
  newValue?: string;
}

export interface RedmineJournal {
  id: number;
  user: RedmineNamedResource;
  notes: string;
  createdOn: string;
  details: RedmineJournalDetail[];
}

export interface RedmineIssueRelation {
  id: number;
  issueId: number;
  issueToId: number;
  relationType: string;
  delay?: number;
}

export interface RedmineIssueChild {
  id: number;
  tracker?: RedmineNamedResource;
  subject: string;
  children?: RedmineIssueChild[];
}

export interface RedmineAttachment {
  id: number;
  filename: string;
  filesize: number;
  contentType?: string;
  description?: string;
  contentUrl: string;
  thumbnailUrl?: string;
  author?: RedmineNamedResource;
  createdOn: string;
}

export interface RedmineIssue {
  id: number;
  project: RedmineNamedResource;
  tracker: RedmineNamedResource;
  status: RedmineNamedResource & { isClosed?: boolean };
  priority: RedmineNamedResource;
  author: RedmineNamedResource;
  assignedTo?: RedmineNamedResource;
  fixedVersion?: RedmineNamedResource;
  subject: string;
  description?: string;
  startDate?: string;
  dueDate?: string;
  doneRatio?: number;
  isPrivate?: boolean;
  estimatedHours?: number;
  customFields: RedmineCustomField[];
  createdOn?: string;
  updatedOn?: string;
  closedOn?: string;
  journals?: RedmineJournal[];
  relations?: RedmineIssueRelation[];
  children?: RedmineIssueChild[];
  attachments?: RedmineAttachment[];
  allowedStatuses?: RedmineNamedResource[];
}

export interface RedmineIssueSummary {
  id: number;
  subject: string;
  project: RedmineNamedResource;
  tracker: RedmineNamedResource;
  status: RedmineNamedResource & { isClosed?: boolean };
  priority: RedmineNamedResource;
  assignedTo?: RedmineNamedResource;
  fixedVersion?: RedmineNamedResource;
  updatedOn?: string;
}

export interface RedmineIssueCustomFieldMetadata {
  id: number;
  name: string;
  fieldFormat?: string;
  isRequired?: boolean;
}

export interface RedmineProject {
  id: number;
  name: string;
  identifier: string;
  description?: string;
  status?: number;
  isPublic?: boolean;
  parent?: RedmineNamedResource;
  createdOn?: string;
  updatedOn?: string;
  trackers?: RedmineNamedResource[];
  issueCategories?: RedmineNamedResource[];
  issueCustomFields?: RedmineIssueCustomFieldMetadata[];
}

export interface RedmineProjectSummary {
  id: number;
  name: string;
  identifier: string;
  parentId?: number;
}

export interface RedmineVersion {
  id: number;
  project: RedmineNamedResource;
  name: string;
  description?: string;
  status: string;
  dueDate?: string;
  sharing?: string;
  createdOn?: string;
  updatedOn?: string;
}

export interface RedmineMembershipRole extends RedmineNamedResource {
  inherited?: boolean;
}

export interface RedmineMembership {
  id: number;
  project: RedmineNamedResource;
  user?: RedmineNamedResource;
  group?: RedmineNamedResource;
  roles: RedmineMembershipRole[];
}

export interface RedmineSearchResult {
  id: number;
  title: string;
  type: string;
  url: string;
  description?: string;
  datetime?: string;
}

export interface RedminePaginatedResponse<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
}

export type RedmineIssueInclude =
  | "journals"
  | "relations"
  | "watchers"
  | "children"
  | "attachments"
  | "allowed_statuses";

export interface RedmineListIssuesParams {
  projectId?: string | number;
  trackerId?: string | number;
  statusId?: string | number;
  assignedToId?: string | number;
  fixedVersionId?: string | number;
  subject?: string;
  offset?: number;
  limit?: number;
  sort?: string;
}

export type RedmineProjectInclude =
  | "trackers"
  | "issue_categories"
  | "issue_custom_fields";

export interface RedmineListProjectsParams {
  offset?: number;
  limit?: number;
}

export interface RedmineListMembershipsParams {
  offset?: number;
  limit?: number;
}

export interface RedmineSearchParams {
  query: string;
  projectId?: string | number;
  offset?: number;
  limit?: number;
}
