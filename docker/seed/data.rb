# frozen_string_literal: true

# Representative Redmine test data seed for MCP integration tests.
#
# This file contains only synthetic test data. Redmine configuration such as
# trackers, issue statuses, roles, workflows, custom fields, and enumerations
# belongs in config.rb.

MCP_TEST_LOGIN = "mcp-test"
MCP_TEST_EMAIL = "mcp-test@example.invalid"
MCP_READ_ONLY_ROLE_NAME = "MCP Read Only"
MCP_TEST_API_KEY = "0123456789abcdef0123456789abcdef01234567"

MCP_WRITER_LOGIN = "mcp-writer"
MCP_WRITER_EMAIL = "mcp-writer@example.invalid"
MCP_WRITER_ROLE_NAME = "MCP Writer"
MCP_WRITER_API_KEY = "fedcba9876543210fedcba9876543210fedcba98"

PRIMARY_PROJECT_IDENTIFIER = "mcp-test"
PRIMARY_PROJECT_NAME = "MCP Test Project"
SECONDARY_PROJECT_IDENTIFIER = "mcp-secondary"
SECONDARY_PROJECT_NAME = "MCP Secondary Project"
AGENT_BRIEF_PROJECT_IDENTIFIER = "mcp-agent-brief"
AGENT_BRIEF_PROJECT_NAME = "MCP Agent Brief Test Project"
AGENT_BRIEF_ISSUE_SUBJECT = "Agent Brief lifecycle metadata integration target"

AGENT_BRIEF_CUSTOM_FIELD_NAMES = [
  "Agent Brief Lifecycle",
  "Brief Approved By",
  "Brief Approved At",
  "Approved Brief Revision",
  "Approved Persisted Revision",
  "Approved Req Fingerprint"
].freeze

VERSION_DEFINITIONS = [
  { name: "v0.1.0", effective_date: Date.new(2026, 9, 1) },
  { name: "v0.2.0", effective_date: Date.new(2026, 10, 1) }
].freeze

ISSUE_DEFINITIONS = [
  {
    project: PRIMARY_PROJECT_IDENTIFIER,
    subject: "Authentication fails for invalid API token",
    description: "This issue is used to verify Redmine MCP issue retrieval and filtering.",
    tracker: "Bug",
    status: "New",
    priority: "High",
    version: "v0.1.0",
    release_tag: "v0.1.0",
    assigned: true
  },
  {
    project: PRIMARY_PROJECT_IDENTIFIER,
    subject: "Add issue listing support",
    description: "This issue is used to verify Redmine MCP list behavior and pagination.",
    tracker: "Feature",
    status: "In Progress",
    priority: "Normal",
    version: "v0.1.0",
    release_tag: "v0.1.0",
    assigned: true
  },
  {
    project: PRIMARY_PROJECT_IDENTIFIER,
    subject: "Prepare representative Redmine test data",
    description: "This issue is used to verify Redmine MCP search behavior.",
    tracker: "Task",
    status: "Resolved",
    priority: "Low",
    version: "v0.1.0",
    release_tag: nil,
    assigned: false
  },
  {
    project: PRIMARY_PROJECT_IDENTIFIER,
    subject: "Complete walking skeleton",
    description: "This closed issue represents the completed v0.0.1 walking skeleton.",
    tracker: "Task",
    status: "Closed",
    priority: "Normal",
    version: "v0.1.0",
    release_tag: "v0.0.1",
    assigned: true
  },
  {
    project: SECONDARY_PROJECT_IDENTIFIER,
    subject: "Secondary project search target",
    description: "This issue must only appear when searching the secondary project or globally.",
    tracker: "Bug",
    status: "New",
    priority: "Normal",
    version: nil,
    release_tag: "v0.1.0",
    assigned: false
  }
].freeze

read_only_role = Role.find_by!(name: MCP_READ_ONLY_ROLE_NAME)
writer_role = Role.find_by!(name: MCP_WRITER_ROLE_NAME)

trackers = %w[Bug Feature Task].to_h do |name|
  [name, Tracker.find_by!(name: name)]
end

statuses = ["New", "In Progress", "Resolved", "Closed"].to_h do |name|
  [name, IssueStatus.find_by!(name: name)]
end

priorities = %w[Low Normal High].to_h do |name|
  [name, IssuePriority.find_by!(name: name)]
end

release_tag = IssueCustomField.find_by!(name: "release_tag")
agent_brief_custom_fields = AGENT_BRIEF_CUSTOM_FIELD_NAMES.to_h do |name|
  [name, IssueCustomField.find_by!(name: name)]
end

read_only_user = User.find_or_initialize_by(login: MCP_TEST_LOGIN)
read_only_user.firstname = "MCP"
read_only_user.lastname = "Test"
read_only_user.mail = MCP_TEST_EMAIL
read_only_user.status = Principal::STATUS_ACTIVE
read_only_user.language = "en"
read_only_user.admin = false
read_only_user.save!

writer_user = User.find_or_initialize_by(login: MCP_WRITER_LOGIN)
writer_user.firstname = "MCP"
writer_user.lastname = "Writer"
writer_user.mail = MCP_WRITER_EMAIL
writer_user.status = Principal::STATUS_ACTIVE
writer_user.language = "en"
writer_user.admin = false
writer_user.save!

projects = {
  PRIMARY_PROJECT_IDENTIFIER => Project.find_or_initialize_by(identifier: PRIMARY_PROJECT_IDENTIFIER),
  SECONDARY_PROJECT_IDENTIFIER => Project.find_or_initialize_by(identifier: SECONDARY_PROJECT_IDENTIFIER),
  AGENT_BRIEF_PROJECT_IDENTIFIER => Project.find_or_initialize_by(identifier: AGENT_BRIEF_PROJECT_IDENTIFIER)
}

projects.fetch(PRIMARY_PROJECT_IDENTIFIER).tap do |project|
  project.name = PRIMARY_PROJECT_NAME
  project.is_public = false
  project.save!
end

projects.fetch(SECONDARY_PROJECT_IDENTIFIER).tap do |project|
  project.name = SECONDARY_PROJECT_NAME
  project.is_public = false
  project.save!
end

projects.fetch(AGENT_BRIEF_PROJECT_IDENTIFIER).tap do |project|
  project.name = AGENT_BRIEF_PROJECT_NAME
  project.is_public = false
  project.save!
end

projects.each_value do |project|
  project.trackers = trackers.values
end

# Keep the representative read-only fixtures byte-stable for Context Budget
# measurement. Agent Brief lifecycle fields are deliberately NOT attached to the
# existing mcp-test / mcp-secondary projects. Assign the exact baseline custom
# field set so rerunning this seed also removes associations created by older
# Phase 38 seed revisions.
baseline_projects = [
  projects.fetch(PRIMARY_PROJECT_IDENTIFIER),
  projects.fetch(SECONDARY_PROJECT_IDENTIFIER)
]

baseline_projects.each do |project|
  project.issue_custom_fields = [release_tag]

  membership = Member.find_or_initialize_by(
    project: project,
    user_id: read_only_user.id
  )
  membership.role_ids = [read_only_role.id]
  membership.save!
end

agent_brief_project = projects.fetch(AGENT_BRIEF_PROJECT_IDENTIFIER)
agent_brief_project.issue_custom_fields = [
  release_tag,
  *agent_brief_custom_fields.values
]

# The dedicated Phase 38 project is intentionally invisible to the read-only
# context-measurement user. The internal lifecycle boundary uses the writer
# credential for both reads and writes in integration tests.
Member.where(
  project: agent_brief_project,
  user_id: read_only_user.id
).destroy_all

primary_project = projects.fetch(PRIMARY_PROJECT_IDENTIFIER)

[primary_project, agent_brief_project].each do |project|
  writer_membership = Member.find_or_initialize_by(
    project: project,
    user_id: writer_user.id
  )
  writer_membership.role_ids = [writer_role.id]
  writer_membership.save!
end

# Keep the writer away from the secondary private project while allowing the
# dedicated Phase 38 integration project.
Member.where(user_id: writer_user.id)
      .where.not(project_id: [primary_project.id, agent_brief_project.id])
      .destroy_all

versions = {}

VERSION_DEFINITIONS.each do |definition|
  version = Version.find_or_initialize_by(
    project: primary_project,
    name: definition[:name]
  )
  version.status = "open"
  version.sharing = "none"
  version.effective_date = definition[:effective_date]
  version.save!
  versions[definition[:name]] = version
end

issues = {}

ISSUE_DEFINITIONS.each do |definition|
  project = projects.fetch(definition[:project])
  issue = Issue.find_or_initialize_by(
    project: project,
    subject: definition[:subject]
  )

  issue.tracker = trackers.fetch(definition[:tracker])
  issue.status = statuses.fetch(definition[:status])
  issue.priority = priorities.fetch(definition[:priority])
  issue.author = read_only_user
  issue.assigned_to = definition[:assigned] ? read_only_user : nil
  issue.fixed_version = definition[:version] ? versions.fetch(definition[:version]) : nil
  issue.description = definition[:description]
  issue.custom_field_values = {
    release_tag.id => definition[:release_tag].to_s
  }
  issue.save!

  issues[definition[:subject]] = issue
end

agent_brief_issue = Issue.find_or_initialize_by(
  project: agent_brief_project,
  subject: AGENT_BRIEF_ISSUE_SUBJECT
)
agent_brief_issue.tracker = trackers.fetch("Feature")
agent_brief_issue.status = statuses.fetch("New")
agent_brief_issue.priority = priorities.fetch("Normal")
agent_brief_issue.author = writer_user
agent_brief_issue.assigned_to = writer_user
agent_brief_issue.fixed_version = nil
agent_brief_issue.description =
  "Synthetic issue used only for Agent Brief lifecycle metadata integration tests."
agent_brief_issue.custom_field_values = {
  release_tag.id => "phase-38",
  agent_brief_custom_fields.fetch("Agent Brief Lifecycle").id => "Brief Draft",
  agent_brief_custom_fields.fetch("Brief Approved By").id => "",
  agent_brief_custom_fields.fetch("Brief Approved At").id => "",
  agent_brief_custom_fields.fetch("Approved Brief Revision").id => "",
  agent_brief_custom_fields.fetch("Approved Persisted Revision").id => "",
  agent_brief_custom_fields.fetch("Approved Req Fingerprint").id => ""
}
agent_brief_issue.save!

journal_issue = issues.fetch("Add issue listing support")
journal_note = "Initial investigation completed."

unless journal_issue.journals.where(notes: journal_note).exists?
  Journal.create!(
    journalized: journal_issue,
    user: read_only_user,
    notes: journal_note
  )
end

relation_from = issues.fetch("Authentication fails for invalid API token")
relation_to = issues.fetch("Add issue listing support")

relation = IssueRelation.find_or_initialize_by(
  issue_from: relation_from,
  issue_to: relation_to
)
relation.relation_type = IssueRelation::TYPE_RELATES
relation.save!

[
  [read_only_user, MCP_TEST_API_KEY],
  [writer_user, MCP_WRITER_API_KEY]
].each do |user, api_key|
  Token.where(user: user, action: "api").delete_all
  api_token = Token.create!(user: user, action: "api")

  # Redmine generates a random token value in a before_create callback.
  # Override it after creation to keep the Docker test environment
  # deterministic.
  api_token.update_column(:value, api_key)
end

puts "Read-only test user ensured: #{read_only_user.login}"
puts "Writer test user ensured: #{writer_user.login}"
puts "Projects ensured: #{projects.keys.join(', ')}"
puts "Read-only memberships ensured: #{baseline_projects.map(&:identifier).join(', ')}"
puts "Writer memberships ensured: #{[primary_project, agent_brief_project].map(&:identifier).join(', ')}"
puts "Versions ensured: #{versions.keys.join(', ')}"
puts "Issues ensured: #{issues.keys.join(' | ')}"
puts "Agent Brief lifecycle issue ensured: #{agent_brief_issue.subject}"
puts "Journal ensured for: #{journal_issue.subject}"
puts "Issue relation ensured: #{relation_from.subject} relates #{relation_to.subject}"
puts "Deterministic test API tokens ensured"
