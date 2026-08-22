# frozen_string_literal: true

# Representative Redmine test data seed for MCP read-only integration tests.
#
# This file contains only synthetic test data. Redmine configuration such as
# trackers, issue statuses, roles, workflows, custom fields, and enumerations
# belongs in config.rb.

MCP_TEST_LOGIN = "mcp-test"
MCP_TEST_EMAIL = "mcp-test@example.invalid"
MCP_READ_ONLY_ROLE_NAME = "MCP Read Only"
MCP_TEST_API_KEY = "0123456789abcdef0123456789abcdef01234567"

PRIMARY_PROJECT_IDENTIFIER = "mcp-test"
PRIMARY_PROJECT_NAME = "MCP Test Project"
SECONDARY_PROJECT_IDENTIFIER = "mcp-secondary"
SECONDARY_PROJECT_NAME = "MCP Secondary Project"

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

role = Role.find_by!(name: MCP_READ_ONLY_ROLE_NAME)

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

user = User.find_or_initialize_by(login: MCP_TEST_LOGIN)
user.firstname = "MCP"
user.lastname = "Test"
user.mail = MCP_TEST_EMAIL
user.status = Principal::STATUS_ACTIVE
user.language = "en"
user.admin = false
user.save!

projects = {
  PRIMARY_PROJECT_IDENTIFIER => Project.find_or_initialize_by(identifier: PRIMARY_PROJECT_IDENTIFIER),
  SECONDARY_PROJECT_IDENTIFIER => Project.find_or_initialize_by(identifier: SECONDARY_PROJECT_IDENTIFIER)
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

projects.each_value do |project|
  project.trackers = trackers.values

  unless project.issue_custom_fields.include?(release_tag)
    project.issue_custom_fields << release_tag
  end

  membership = Member.find_or_initialize_by(project: project, user_id: user.id)
  membership.role_ids = [role.id]
  membership.save!
end

versions = {}

VERSION_DEFINITIONS.each do |definition|
  project = projects.fetch(PRIMARY_PROJECT_IDENTIFIER)
  version = Version.find_or_initialize_by(project: project, name: definition[:name])
  version.status = "open"
  version.sharing = "none"
  version.effective_date = definition[:effective_date]
  version.save!
  versions[definition[:name]] = version
end

issues = {}

ISSUE_DEFINITIONS.each do |definition|
  project = projects.fetch(definition[:project])
  issue = Issue.find_or_initialize_by(project: project, subject: definition[:subject])

  issue.tracker = trackers.fetch(definition[:tracker])
  issue.status = statuses.fetch(definition[:status])
  issue.priority = priorities.fetch(definition[:priority])
  issue.author = user
  issue.assigned_to = definition[:assigned] ? user : nil
  issue.fixed_version = definition[:version] ? versions.fetch(definition[:version]) : nil
  issue.description = definition[:description]
  issue.custom_field_values = { release_tag.id => definition[:release_tag].to_s }
  issue.save!

  issues[definition[:subject]] = issue
end

journal_issue = issues.fetch("Add issue listing support")
journal_note = "Initial investigation completed."

unless journal_issue.journals.where(notes: journal_note).exists?
  Journal.create!(
    journalized: journal_issue,
    user: user,
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

Token.where(user: user, action: "api").delete_all
api_token = Token.create!(user: user, action: "api")

# Redmine generates a random token value in a before_create callback.
# Override it after creation to keep the Docker test environment deterministic.
api_token.update_column(:value, MCP_TEST_API_KEY)

puts "Test user ensured: #{user.login}"
puts "Projects ensured: #{projects.keys.join(', ')}"
puts "Versions ensured: #{versions.keys.join(', ')}"
puts "Issues ensured: #{issues.keys.join(' | ')}"
puts "Journal ensured for: #{journal_issue.subject}"
puts "Issue relation ensured: #{relation_from.subject} relates #{relation_to.subject}"
puts "Deterministic test API token ensured"
