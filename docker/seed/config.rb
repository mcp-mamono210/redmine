# frozen_string_literal: true

# Redmine configuration seed for MCP integration tests.
#
# This file contains only Redmine configuration and behavioral constraints.
# Test data such as users, projects, versions, memberships, issues, journals,
# relations, and API tokens belongs in data.rb.

MCP_READ_ONLY_ROLE_NAME = "MCP Read Only"
MCP_WRITER_ROLE_NAME = "MCP Writer"

TRACKER_NAMES = [
  "Bug",
  "Feature",
  "Task"
].freeze

STATUS_DEFINITIONS = [
  { name: "New", is_closed: false, position: 1 },
  { name: "In Progress", is_closed: false, position: 2 },
  { name: "Resolved", is_closed: false, position: 3 },
  { name: "Closed", is_closed: true, position: 4 }
].freeze

PRIORITY_DEFINITIONS = [
  { name: "Low", position: 1, is_default: false },
  { name: "Normal", position: 2, is_default: true },
  { name: "High", position: 3, is_default: false }
].freeze

RELEASE_TAG_CUSTOM_FIELD_NAME = "release_tag"

MCP_READ_ONLY_PERMISSIONS = %i[
  view_project
  view_issues
].freeze

MCP_WRITER_PERMISSIONS = %i[
  view_project
  view_issues
  add_issues
  edit_issues
  add_issue_notes
].freeze

Setting.rest_api_enabled = "1"
Setting.default_language = "en"

statuses = STATUS_DEFINITIONS.to_h do |definition|
  status = IssueStatus.find_or_initialize_by(name: definition[:name])
  status.is_closed = definition[:is_closed]
  status.position = definition[:position]
  status.save!

  [definition[:name], status]
end

default_status = statuses.fetch("New")

trackers = TRACKER_NAMES.to_h do |name|
  tracker = Tracker.find_or_initialize_by(name: name)
  tracker.position ||= Tracker.maximum(:position).to_i + 1
  tracker.default_status = default_status
  tracker.save!

  [name, tracker]
end

read_only_role = Role.find_or_initialize_by(name: MCP_READ_ONLY_ROLE_NAME)
read_only_role.permissions = MCP_READ_ONLY_PERMISSIONS
read_only_role.save!

writer_role = Role.find_or_initialize_by(name: MCP_WRITER_ROLE_NAME)
writer_role.permissions = MCP_WRITER_PERMISSIONS
writer_role.save!

IssuePriority.update_all(is_default: false)

priorities = PRIORITY_DEFINITIONS.to_h do |definition|
  priority = IssuePriority.find_or_initialize_by(name: definition[:name])
  priority.position = definition[:position]
  priority.is_default = definition[:is_default]
  priority.active = true
  priority.save!

  [definition[:name], priority]
end

release_tag = IssueCustomField.find_or_initialize_by(
  name: RELEASE_TAG_CUSTOM_FIELD_NAME
)
release_tag.field_format = "string"
release_tag.is_required = false
release_tag.is_filter = true
release_tag.searchable = true
release_tag.visible = true
release_tag.save!

release_tag.trackers = trackers.values
release_tag.save!

# Rebuild only the workflow transitions owned by MCP roles.
#
# The workflow is intentionally small and deterministic so MCP tests can make
# stable assertions about the statuses available for each tracker.
workflow_edges = [
  ["New", "In Progress"],
  ["In Progress", "Resolved"],
  ["Resolved", "Closed"]
].freeze

[read_only_role, writer_role].each do |role|
  WorkflowTransition.where(role_id: role.id).delete_all

  trackers.each_value do |tracker|
    workflow_edges.each do |old_status_name, new_status_name|
      WorkflowTransition.create!(
        role_id: role.id,
        tracker_id: tracker.id,
        old_status_id: statuses.fetch(old_status_name).id,
        new_status_id: statuses.fetch(new_status_name).id
      )
    end
  end

  # No field-level workflow restrictions are required for MCP test roles.
  # Remove stale permissions so repeated seeding converges to the expected
  # configuration.
  WorkflowPermission.where(role_id: role.id).delete_all
end

puts "REST API enabled"
puts "Default language ensured: #{Setting.default_language}"
puts "Issue statuses ensured: #{statuses.keys.join(', ')}"
puts "Trackers ensured: #{trackers.keys.join(', ')}"
puts "Default tracker status ensured: #{default_status.name}"
puts "Role ensured: #{read_only_role.name}"
puts "Role ensured: #{writer_role.name}"
puts "Workflow transitions ensured for MCP roles"
puts "Issue custom field ensured: #{release_tag.name}"
puts "Issue priorities ensured: #{priorities.keys.join(', ')}"
