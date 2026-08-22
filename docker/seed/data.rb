# frozen_string_literal: true

# Minimal Redmine test data seed for the MCP walking skeleton.
#
# This script creates only test data required for authentication and
# authorization checks. Redmine configuration such as settings and roles
# belongs in config.rb and is intentionally not created here.

MCP_TEST_LOGIN = "mcp-test"
MCP_TEST_EMAIL = "mcp-test@example.invalid"
MCP_TEST_PROJECT_IDENTIFIER = "mcp-test"
MCP_TEST_PROJECT_NAME = "MCP Test Project"
MCP_READ_ONLY_ROLE_NAME = "MCP Read Only"
MCP_TEST_API_KEY = "0123456789abcdef0123456789abcdef01234567"

role = Role.find_by!(name: MCP_READ_ONLY_ROLE_NAME)

user = User.find_or_initialize_by(login: MCP_TEST_LOGIN)
user.firstname = "MCP"
user.lastname = "Test"
user.mail = MCP_TEST_EMAIL
user.status = Principal::STATUS_ACTIVE
user.language = "en"
user.save!

project = Project.find_or_initialize_by(identifier: MCP_TEST_PROJECT_IDENTIFIER)
project.name = MCP_TEST_PROJECT_NAME
project.is_public = false
project.save!

membership = Member.find_or_initialize_by(
  project: project,
  user_id: user.id
)
membership.role_ids = [role.id]
membership.save!

Token.where(user: user, action: "api").delete_all

api_token = Token.create!(
  user: user,
  action: "api"
)

# Redmine generates a random token value in a before_create callback.
# Override it after creation to keep the Docker test environment deterministic.
api_token.update_column(:value, MCP_TEST_API_KEY)

puts "Test user ensured: #{user.login}"
puts "Test project ensured: #{project.identifier}"
puts "Membership ensured with role: #{role.name}"
puts "Deterministic test API token ensured"
