# frozen_string_literal: true

# Minimal Redmine configuration seed for the MCP walking skeleton.
#
# This script configures only Redmine settings and roles. Test data such as
# users, projects, memberships, issues, and API tokens belongs in data.rb and
# is intentionally not created here.

MCP_READ_ONLY_ROLE_NAME = "MCP Read Only"
MCP_READ_ONLY_PERMISSIONS = %i[
  view_project
  view_issues
].freeze

Setting.rest_api_enabled = "1"

role = Role.find_or_initialize_by(name: MCP_READ_ONLY_ROLE_NAME)
role.permissions = MCP_READ_ONLY_PERMISSIONS
role.save!

puts "REST API enabled"
puts "Role ensured: #{role.name}"
