# frozen_string_literal: true

require "json"
require "digest"
require "time"
require "fileutils"
require_relative "target-repository-policy"

module Phase53_4RedmineAdministrativeProvisioning
  TICKET = 5451
  DEFAULT_SPEC = File.expand_path(
    "phase53-4-redmine-administrative-provisioning-spec.json",
    __dir__
  )

  class ProvisioningError < StandardError; end

  module_function

  def run
    mode = required_env("PHASE53_5451_MODE")
    spec_path = ENV.fetch("PHASE53_5451_SPEC", DEFAULT_SPEC)
    config_path = ENV["PHASE53_5451_CONFIG"]
    output_path = required_env("PHASE53_5451_OUTPUT")

    spec = read_json(spec_path)
    assert_spec!(spec)
    context = load_context(spec)

    case mode
    when "inventory"
      write_json(output_path, inventory_record(context, spec))
      puts "Phase 53-4 production Redmine administrative inventory PASS"
      puts "output=#{output_path}"
    when "plan"
      config = read_required_config(config_path)
      plan = build_plan(context, spec, config)
      write_json(output_path, plan)
      puts "Phase 53-4 production Redmine administrative plan generated"
      puts "planDigest=#{plan.fetch("planDigest")}"
      puts "blockers=#{plan.fetch("blockers").length}"
      puts "actions=#{plan.fetch("actions").length}"
      puts "output=#{output_path}"
    when "apply"
      config = read_required_config(config_path)
      plan_path = required_env("PHASE53_5451_PLAN")
      approved_digest = required_env("PHASE53_5451_APPROVED_PLAN_SHA256")
      approved_by = required_env("PHASE53_5451_APPROVED_BY")
      apply_plan(context, spec, config, plan_path, approved_digest, approved_by, output_path)
    else
      fail!("PHASE53_5451_MODE must be inventory, plan, or apply")
    end
  end

  def required_env(name)
    value = ENV[name]
    fail!("#{name} is required") if value.nil? || value.strip.empty?
    value
  end

  def read_required_config(path)
    fail!("PHASE53_5451_CONFIG is required for plan/apply") if path.nil? || path.strip.empty?
    config = read_json(path)
    assert_config!(config)
    config
  end

  def read_json(path)
    JSON.parse(File.read(path, encoding: "UTF-8"))
  rescue Errno::ENOENT
    fail!("JSON file not found: #{path}")
  rescue JSON::ParserError => e
    fail!("invalid JSON in #{path}: #{e.message}")
  end

  def write_json(path, value)
    directory = File.dirname(File.expand_path(path))
    FileUtils.mkdir_p(directory)
    File.write(path, JSON.pretty_generate(value) + "\n", mode: "w", encoding: "UTF-8")
  end

  def assert_spec!(spec)
    fail!("unexpected spec schemaVersion") unless spec["schemaVersion"] == 1
    fail!("unexpected spec ticket") unless spec["ticket"] == TICKET
    fail!("briefFields must contain six definitions") unless Array(spec["briefFields"]).length == 6
    target = spec.fetch("targetRepositoryField")
    fail!("Target Repository supported formats must include string and list") unless target.fetch("supportedExistingFormats") == %w[string list]
    fail!("Target Repository must remain single-valued") unless target.fetch("multiple") == false
    required = target.fetch("requiredAllowedValue")
    fail!("Target Repository required allowed value applies only to list") unless required == { "value" => "php", "appliesWhenFieldFormat" => "list" }
  end

  def assert_config!(config)
    fail!("unexpected config schemaVersion") unless config["schemaVersion"] == 1
    fail!("unexpected config ticket") unless config["ticket"] == TICKET

    boundary = config.fetch("administrativeBoundary", {})
    unless boundary["normalProcessAdminCredentialMustRemainUnset"] == true
      fail!("config must preserve the normal-process admin credential prohibition")
    end
    unless boundary["principalVerificationTicket"] == 5453
      fail!("principal verification must remain owned by Redmine issue #5453")
    end

    %w[briefFields targetRepository].each do |key|
      policy = config.dig("visibility", key)
      fail!("visibility.#{key} is required") unless policy.is_a?(Hash)
      mode = policy["mode"]
      unless %w[review-required all roles-additive].include?(mode)
        fail!("visibility.#{key}.mode must be review-required, all, or roles-additive")
      end
      if mode == "roles-additive"
        names = Array(policy["requiredRoleNames"])
        if names.empty? || names.any? { |name| !name.is_a?(String) || name.strip.empty? }
          fail!("visibility.#{key}.requiredRoleNames must be non-empty for roles-additive")
        end
      end
    end
  end

  def load_context(spec)
    project_spec = spec.fetch("project")
    tracker_spec = spec.fetch("tracker")

    project = Project.find_by(id: project_spec.fetch("id"))
    fail!("project #{project_spec.fetch("id")} was not found") if project.nil?
    unless project.identifier == project_spec.fetch("identifier")
      fail!("project identity mismatch: expected #{project_spec.fetch("identifier")}, got #{project.identifier}")
    end

    tracker = Tracker.find_by(id: tracker_spec.fetch("id"))
    fail!("tracker #{tracker_spec.fetch("id")} was not found") if tracker.nil?
    unless tracker.name == tracker_spec.fetch("name")
      fail!("tracker identity mismatch: expected #{tracker_spec.fetch("name")}, got #{tracker.name}")
    end

    { project: project, tracker: tracker }
  end

  def inventory_record(context, spec)
    {
      "schemaVersion" => 1,
      "recordType" => "phase53-4-redmine-administrative-inventory",
      "ticket" => TICKET,
      "observedAt" => Time.now.utc.iso8601,
      "project" => project_snapshot(context.fetch(:project)),
      "tracker" => tracker_snapshot(context.fetch(:tracker)),
      "briefFields" => spec.fetch("briefFields").map { |definition| named_field_inventory(definition.fetch("name")) },
      "executionLifecycleField" => named_field_inventory(spec.dig("executionLifecycleField", "name")),
      "targetRepositoryField" => target_repository_inventory(spec.fetch("targetRepositoryField")),
      "credentialMaterialRecorded" => false,
      "principalVerificationOwnedByTicket" => 5453
    }
  end

  def project_snapshot(project)
    {
      "id" => project.id,
      "identifier" => project.identifier,
      "name" => project.name
    }
  end

  def tracker_snapshot(tracker)
    {
      "id" => tracker.id,
      "name" => tracker.name
    }
  end

  def named_field_inventory(name)
    exact = IssueCustomField.where(name: name).order(:id).to_a
    folded = IssueCustomField.all.select { |field| field.name.casecmp?(name) }.sort_by(&:id)
    collisions = folded.reject { |field| field.name == name }

    {
      "name" => name,
      "exactMatchCount" => exact.length,
      "caseInsensitiveCollisionCount" => collisions.length,
      "caseInsensitiveCollisions" => collisions.map { |field| minimal_field_identity(field) },
      "fields" => exact.map { |field| field_snapshot(field) }
    }
  end

  def target_repository_inventory(definition)
    by_id = IssueCustomField.find_by(id: definition.fetch("id"))
    by_name = IssueCustomField.where(name: definition.fetch("name")).order(:id).to_a

    {
      "expectedId" => definition.fetch("id"),
      "expectedName" => definition.fetch("name"),
      "fieldAtExpectedId" => by_id.nil? ? nil : field_snapshot(by_id),
      "exactNameMatchCount" => by_name.length,
      "fieldsByExactName" => by_name.map { |field| field_snapshot(field) }
    }
  end

  def minimal_field_identity(field)
    {
      "id" => field.id,
      "name" => field.name,
      "fieldFormat" => field.field_format
    }
  end

  def field_snapshot(field)
    values = CustomValue.where(custom_field_id: field.id)
                        .where.not(value: [nil, ""])
                        .distinct
                        .order(:value)
                        .pluck(:value)

    {
      "id" => field.id,
      "name" => field.name,
      "fieldFormat" => field.field_format,
      "multiple" => field.multiple?,
      "required" => field.is_required?,
      "filter" => field.is_filter?,
      "forAllProjects" => field.is_for_all?,
      "visibleToAllRoles" => field.visible?,
      "possibleValues" => Array(field.possible_values),
      "roles" => field.roles.order(:id).map { |role| { "id" => role.id, "name" => role.name } },
      "trackers" => field.trackers.order(:id).map { |tracker| { "id" => tracker.id, "name" => tracker.name } },
      "projects" => field.projects.order(:id).map { |project| { "id" => project.id, "identifier" => project.identifier } },
      "nonblankStoredValueCount" => values.length,
      **(field.field_format == "list" ? { "nonblankStoredValues" => values } : {})
    }
  end

  def build_plan(context, spec, config)
    before = inventory_record(context, spec)
    actions = []
    blockers = []
    warnings = []

    visibility_roles = {
      "briefFields" => resolve_visibility_roles(config.dig("visibility", "briefFields"), blockers, "briefFields"),
      "targetRepository" => resolve_visibility_roles(config.dig("visibility", "targetRepository"), blockers, "targetRepository")
    }

    spec.fetch("briefFields").each do |definition|
      plan_brief_field(
        context,
        definition,
        config.dig("visibility", "briefFields"),
        visibility_roles.fetch("briefFields"),
        actions,
        blockers
      )
    end

    plan_execution_lifecycle_filter(spec, actions, blockers)
    plan_target_repository(
      context,
      spec.fetch("targetRepositoryField"),
      config.dig("visibility", "targetRepository"),
      visibility_roles.fetch("targetRepository"),
      actions,
      blockers
    )

    if config.dig("visibility", "briefFields", "mode") == "review-required"
      blockers << "brief field role visibility policy still requires explicit operator selection"
    end
    if config.dig("visibility", "targetRepository", "mode") == "review-required"
      blockers << "Target Repository role visibility policy still requires explicit operator selection"
    end

    warnings << "Actual principal visibility and permissions remain a Phase 53-6 responsibility (Redmine #5453)."
    warnings << "This tool never configures an administrator API credential for Brief Helper, Approval MCP, or Runner processes."

    payload = {
      "schemaVersion" => 1,
      "ticket" => TICKET,
      "project" => project_snapshot(context.fetch(:project)),
      "tracker" => tracker_snapshot(context.fetch(:tracker)),
      "specSha256" => file_sha256(ENV.fetch("PHASE53_5451_SPEC", DEFAULT_SPEC)),
      "configuration" => canonical_config(config),
      "before" => strip_observation_time(before),
      "actions" => actions,
      "blockers" => blockers.uniq.sort,
      "warnings" => warnings.sort
    }

    digest = "sha256:#{Digest::SHA256.hexdigest(JSON.generate(deep_sort(payload)))}"

    payload.merge(
      "recordType" => "phase53-4-redmine-administrative-plan",
      "generatedAt" => Time.now.utc.iso8601,
      "planDigest" => digest
    )
  end

  def canonical_config(config)
    {
      "schemaVersion" => config.fetch("schemaVersion"),
      "ticket" => config.fetch("ticket"),
      "visibility" => config.fetch("visibility"),
      "administrativeBoundary" => config.fetch("administrativeBoundary")
    }
  end

  def strip_observation_time(record)
    copy = Marshal.load(Marshal.dump(record))
    copy.delete("observedAt")
    copy
  end

  def resolve_visibility_roles(policy, blockers, key)
    return [] unless policy.is_a?(Hash)
    mode = policy["mode"]
    return [] unless mode == "roles-additive"

    names = Array(policy["requiredRoleNames"])
    names.map do |name|
      matches = Role.where(name: name).order(:id).to_a
      if matches.length != 1
        blockers << "visibility.#{key} role must resolve exactly once: #{name} (matches=#{matches.length})"
        nil
      else
        matches.first
      end
    end.compact
  end

  def plan_brief_field(context, definition, visibility_policy, visibility_roles, actions, blockers)
    name = definition.fetch("name")
    matches = IssueCustomField.where(name: name).order(:id).to_a
    collisions = IssueCustomField.all.select { |field| field.name.casecmp?(name) && field.name != name }

    blockers << "case-insensitive custom-field collision for #{name}" unless collisions.empty?
    if matches.length > 1
      blockers << "duplicate exact custom fields for #{name}"
      return
    end

    if matches.empty?
      actions << {
        "action" => "create_brief_field",
        "field" => name,
        "after" => desired_new_field(definition, context, visibility_policy, visibility_roles)
      }
      return
    end

    field = matches.first
    if field.field_format != definition.fetch("fieldFormat")
      blockers << "#{name} field type mismatch: expected #{definition.fetch("fieldFormat")}, got #{field.field_format}; no type conversion is performed"
      return
    end
    if field.multiple? != definition.fetch("multiple")
      blockers << "#{name} multiplicity mismatch; no multiplicity conversion is performed"
      return
    end

    if name == "Agent Brief Lifecycle"
      desired_values = definition.fetch("possibleValues")
      noncanonical_used = stored_values(field) - desired_values
      unless noncanonical_used.empty?
        blockers << "Agent Brief Lifecycle has stored non-canonical values: #{noncanonical_used.join(", ")}"
      end
      if Array(field.possible_values) != desired_values
        actions << {
          "action" => "set_possible_values",
          "fieldId" => field.id,
          "field" => name,
          "before" => Array(field.possible_values),
          "after" => desired_values
        }
      end
    end

    if field.is_required? != definition.fetch("required")
      actions << scalar_action(field, "required", field.is_required?, definition.fetch("required"))
    end
    if field.is_filter? != definition.fetch("filter")
      actions << scalar_action(field, "filter", field.is_filter?, definition.fetch("filter"))
    end

    plan_scope(context, field, actions)
    plan_visibility(field, visibility_policy, visibility_roles, actions)
  end

  def desired_new_field(definition, context, visibility_policy, visibility_roles)
    visibility = desired_visibility_for_new(visibility_policy, visibility_roles)
    {
      "name" => definition.fetch("name"),
      "fieldFormat" => definition.fetch("fieldFormat"),
      "multiple" => definition.fetch("multiple"),
      "required" => definition.fetch("required"),
      "filter" => definition.fetch("filter"),
      "possibleValues" => Array(definition["possibleValues"]),
      "project" => project_snapshot(context.fetch(:project)),
      "tracker" => tracker_snapshot(context.fetch(:tracker)),
      "visibility" => visibility
    }
  end

  def desired_visibility_for_new(policy, roles)
    mode = policy["mode"]
    case mode
    when "all"
      { "visibleToAllRoles" => true, "roleIds" => [] }
    when "roles-additive"
      { "visibleToAllRoles" => false, "roleIds" => roles.map(&:id).sort }
    else
      { "visibleToAllRoles" => nil, "roleIds" => [] }
    end
  end

  def scalar_action(field, attribute, before, after)
    {
      "action" => "set_attribute",
      "fieldId" => field.id,
      "field" => field.name,
      "attribute" => attribute,
      "before" => before,
      "after" => after
    }
  end

  def plan_scope(context, field, actions)
    project = context.fetch(:project)
    tracker = context.fetch(:tracker)

    unless field.is_for_all? || field.project_ids.include?(project.id)
      actions << {
        "action" => "add_project_scope",
        "fieldId" => field.id,
        "field" => field.name,
        "projectId" => project.id,
        "projectIdentifier" => project.identifier
      }
    end

    unless field.tracker_ids.include?(tracker.id)
      actions << {
        "action" => "add_tracker_scope",
        "fieldId" => field.id,
        "field" => field.name,
        "trackerId" => tracker.id,
        "trackerName" => tracker.name
      }
    end
  end

  def plan_visibility(field, policy, required_roles, actions)
    case policy["mode"]
    when "all"
      unless field.visible?
        actions << {
          "action" => "expand_visibility_to_all_roles",
          "fieldId" => field.id,
          "field" => field.name,
          "before" => {
            "visibleToAllRoles" => false,
            "roleIds" => field.role_ids.sort
          },
          "after" => {
            "visibleToAllRoles" => true,
            "roleIds" => []
          }
        }
      end
    when "roles-additive"
      return if field.visible?
      missing = required_roles.map(&:id) - field.role_ids
      unless missing.empty?
        actions << {
          "action" => "add_visible_roles",
          "fieldId" => field.id,
          "field" => field.name,
          "beforeRoleIds" => field.role_ids.sort,
          "addRoleIds" => missing.sort,
          "afterRoleIds" => (field.role_ids + missing).uniq.sort
        }
      end
    end
  end

  def plan_execution_lifecycle_filter(spec, actions, blockers)
    name = spec.dig("executionLifecycleField", "name")
    matches = IssueCustomField.where(name: name).order(:id).to_a
    if matches.length != 1
      blockers << "#{name} must resolve exactly once to enable lifecycle filtering (matches=#{matches.length})"
      return
    end

    field = matches.first
    unless field.is_filter?
      actions << scalar_action(field, "filter", false, true)
    end
  end

  def plan_target_repository(context, definition, visibility_policy, visibility_roles, actions, blockers)
    expected_id = definition.fetch("id")
    expected_name = definition.fetch("name")
    by_id = IssueCustomField.find_by(id: expected_id)
    by_name = IssueCustomField.where(name: expected_name).order(:id).to_a

    if by_id.nil?
      blockers << "CF#{expected_id} #{expected_name} is missing"
      return
    end
    if by_id.name != expected_name
      blockers << "CF#{expected_id} name mismatch: expected #{expected_name}, got #{by_id.name}"
      return
    end
    if by_name.length != 1 || by_name.first.id != expected_id
      blockers << "#{expected_name} exact-name binding is ambiguous or does not match CF#{expected_id}"
      return
    end
    policy = target_repository_policy(by_id, definition)
    blockers.concat(policy.fetch("blockers"))
    return unless policy.fetch("blockers").empty?

    policy.fetch("actions").each do |action|
      actions << action.merge(
        "fieldId" => by_id.id,
        "field" => by_id.name
      )
    end

    if by_id.multiple? != definition.fetch("multiple")
      # The pure policy above reports this as a blocker; this guard keeps the
      # schema comparison explicit at the Rails boundary as well.
      blockers << "CF#{expected_id} multiplicity mismatch; no multiplicity conversion is performed"
      return
    end

    plan_scope(context, by_id, actions)
    plan_visibility(by_id, visibility_policy, visibility_roles, actions)
  end

  def target_repository_policy(field, definition)
    target = definition.fetch("requiredAllowedValue")
    Phase53TargetRepositoryPolicy.evaluate(
      field_format: field.field_format,
      multiple: field.multiple?,
      possible_values: field.possible_values,
      supported_formats: definition.fetch("supportedExistingFormats"),
      required_allowed_value: target.fetch("value")
    )
  end

  def stored_values(field)
    CustomValue.where(custom_field_id: field.id)
               .where.not(value: [nil, ""])
               .distinct
               .pluck(:value)
  end

  def apply_plan(context, spec, config, plan_path, approved_digest, approved_by, output_path)
    supplied_plan = read_json(plan_path)
    fail!("plan recordType mismatch") unless supplied_plan["recordType"] == "phase53-4-redmine-administrative-plan"
    fail!("plan contains blockers and cannot be applied") unless Array(supplied_plan["blockers"]).empty?
    fail!("approved plan digest does not match plan file") unless approved_digest == supplied_plan["planDigest"]

    current_plan = build_plan(context, spec, config)
    fail!("current plan contains blockers and cannot be applied") unless current_plan.fetch("blockers").empty?
    unless current_plan.fetch("planDigest") == supplied_plan.fetch("planDigest")
      fail!("production Redmine configuration drifted after approval; regenerate and re-approve the plan")
    end

    before = inventory_record(context, spec)

    ActiveRecord::Base.transaction do
      apply_brief_fields(context, spec, config)
      apply_execution_lifecycle_filter(spec)
      apply_target_repository(context, spec.fetch("targetRepositoryField"), config)
      validate_post_state!(context, spec, config)
    end

    after = inventory_record(context, spec)
    evidence = {
      "schemaVersion" => 1,
      "recordType" => "phase53-4-redmine-administrative-provisioning-evidence",
      "ticket" => TICKET,
      "result" => "PASS",
      "appliedAt" => Time.now.utc.iso8601,
      "approvedPlanDigest" => approved_digest,
      "approvedBy" => approved_by,
      "administrativeMutationPath" => "rails-runner-local-admin-context",
      "adminCredentialPropagatedToNormalProcessesByThisTool" => false,
      "before" => before,
      "after" => after,
      "principalVerificationOwnedByTicket" => 5453,
      "principalVerificationPerformedByThisTool" => false
    }
    write_json(output_path, evidence)

    puts "Phase 53-4 production Redmine administrative provisioning PASS"
    puts "approvedPlanDigest=#{approved_digest}"
    puts "output=#{output_path}"
    puts "principalVerification=deferred-to-#5453"
  end

  def apply_brief_fields(context, spec, config)
    policy = config.dig("visibility", "briefFields")
    roles = roles_for_apply(policy)

    spec.fetch("briefFields").each do |definition|
      name = definition.fetch("name")
      matches = IssueCustomField.where(name: name).order(:id).to_a
      field = if matches.empty?
                IssueCustomField.new(name: name)
              elsif matches.length == 1
                matches.first
              else
                fail!("duplicate exact custom fields appeared during apply for #{name}")
              end

      was_new = field.new_record?

      if field.persisted?
        fail!("#{name} type changed after approval") unless field.field_format == definition.fetch("fieldFormat")
        fail!("#{name} multiplicity changed after approval") unless field.multiple? == definition.fetch("multiple")
      else
        field.field_format = definition.fetch("fieldFormat")
        field.multiple = definition.fetch("multiple")
        field.is_for_all = false
      end

      field.is_required = definition.fetch("required")
      field.is_filter = definition.fetch("filter")
      field.possible_values = definition.fetch("possibleValues") if definition.key?("possibleValues")
      apply_visibility_to_field(field, policy, roles)
      field.save!
      apply_roles_after_save(field, policy, roles, was_new)
      add_scope(context, field)
    end
  end

  def apply_execution_lifecycle_filter(spec)
    name = spec.dig("executionLifecycleField", "name")
    fields = IssueCustomField.where(name: name).order(:id).to_a
    fail!("#{name} no longer resolves exactly once") unless fields.length == 1
    field = fields.first
    field.is_filter = true
    field.save!
  end

  def apply_target_repository(context, definition, config)
    field = IssueCustomField.find_by(id: definition.fetch("id"))
    fail!("Target Repository field disappeared") if field.nil?
    fail!("Target Repository name changed") unless field.name == definition.fetch("name")
    fields_by_name = IssueCustomField.where(name: definition.fetch("name")).order(:id).to_a
    fail!("Target Repository exact-name binding is ambiguous or does not match CF#{definition.fetch("id")}") unless fields_by_name.length == 1 && fields_by_name.first.id == field.id

    policy = target_repository_policy(field, definition)
    fail!(policy.fetch("blockers").join("; ")) unless policy.fetch("blockers").empty?

    if field.field_format == "list"
      required_value = definition.fetch("requiredAllowedValue").fetch("value")
      values = Array(field.possible_values)
      field.possible_values = values + [required_value] unless values.include?(required_value)
    end

    policy = config.dig("visibility", "targetRepository")
    roles = roles_for_apply(policy)
    apply_visibility_to_field(field, policy, roles)
    field.save!
    apply_roles_after_save(field, policy, roles, false)
    add_scope(context, field)
  end

  def roles_for_apply(policy)
    return [] unless policy["mode"] == "roles-additive"
    Array(policy["requiredRoleNames"]).map do |name|
      matches = Role.where(name: name).order(:id).to_a
      fail!("role no longer resolves exactly once during apply: #{name}") unless matches.length == 1
      matches.first
    end
  end

  def apply_visibility_to_field(field, policy, roles)
    case policy["mode"]
    when "all"
      field.visible = true
    when "roles-additive"
      # New IssueCustomField records require either global visibility or roles at
      # validation time. Save new records globally visible inside this transaction,
      # then narrow them to the approved role set before commit.
      field.visible = true if field.new_record?
    else
      fail!("visibility policy was not explicitly selected")
    end
  end

  def apply_roles_after_save(field, policy, roles, was_new)
    return unless policy["mode"] == "roles-additive"

    if was_new
      field.roles = roles
      field.visible = false
      field.save!
      return
    end

    return if field.visible?

    field.roles = (field.roles.to_a + roles).uniq
  end

  def add_scope(context, field)
    project = context.fetch(:project)
    tracker = context.fetch(:tracker)

    unless field.is_for_all? || project.issue_custom_field_ids.include?(field.id)
      project.issue_custom_fields << field
    end
    field.trackers << tracker unless field.tracker_ids.include?(tracker.id)
  end

  def validate_post_state!(context, spec, config)
    spec.fetch("briefFields").each do |definition|
      name = definition.fetch("name")
      fields = IssueCustomField.where(name: name).order(:id).to_a
      fail!("post-apply #{name} does not resolve exactly once") unless fields.length == 1
      field = fields.first
      fail!("post-apply #{name} type mismatch") unless field.field_format == definition.fetch("fieldFormat")
      fail!("post-apply #{name} multiplicity mismatch") unless field.multiple? == definition.fetch("multiple")
      fail!("post-apply #{name} required flag mismatch") unless field.is_required? == definition.fetch("required")
      fail!("post-apply #{name} filter flag mismatch") unless field.is_filter? == definition.fetch("filter")
      if definition.key?("possibleValues")
        fail!("post-apply #{name} possible values mismatch") unless Array(field.possible_values) == definition.fetch("possibleValues")
      end
      assert_scope!(context, field)
      assert_visibility!(field, config.dig("visibility", "briefFields"))
    end

    execution_name = spec.dig("executionLifecycleField", "name")
    execution_fields = IssueCustomField.where(name: execution_name).order(:id).to_a
    fail!("post-apply #{execution_name} does not resolve exactly once") unless execution_fields.length == 1
    fail!("post-apply #{execution_name} is not filterable") unless execution_fields.first.is_filter?

    target = spec.fetch("targetRepositoryField")
    target_field = IssueCustomField.find_by(id: target.fetch("id"))
    fail!("post-apply Target Repository is missing") if target_field.nil?
    fail!("post-apply Target Repository name mismatch") unless target_field.name == target.fetch("name")
    target_fields_by_name = IssueCustomField.where(name: target.fetch("name")).order(:id).to_a
    fail!("post-apply Target Repository exact-name binding is ambiguous") unless target_fields_by_name.length == 1 && target_fields_by_name.first.id == target_field.id
    target_policy = target_repository_policy(target_field, target)
    fail!("post-apply Target Repository policy mismatch: #{target_policy.fetch("blockers").join("; ")}") unless target_policy.fetch("blockers").empty?
    if target_field.field_format == "list" && target_policy.fetch("actions").any?
      fail!("post-apply Target Repository is missing required #{target.fetch("requiredAllowedValue").fetch("value")} value")
    end
    assert_scope!(context, target_field)
    assert_visibility!(target_field, config.dig("visibility", "targetRepository"))
  end

  def assert_scope!(context, field)
    project = context.fetch(:project)
    tracker = context.fetch(:tracker)
    unless field.is_for_all? || field.project_ids.include?(project.id)
      fail!("post-apply project scope missing for #{field.name}")
    end
    fail!("post-apply tracker scope missing for #{field.name}") unless field.tracker_ids.include?(tracker.id)
  end

  def assert_visibility!(field, policy)
    case policy["mode"]
    when "all"
      fail!("post-apply global visibility missing for #{field.name}") unless field.visible?
    when "roles-additive"
      return if field.visible?
      required_ids = roles_for_apply(policy).map(&:id)
      missing = required_ids - field.role_ids
      fail!("post-apply required role visibility missing for #{field.name}: #{missing.join(",")}") unless missing.empty?
    else
      fail!("visibility policy was not explicitly selected")
    end
  end

  def deep_sort(value)
    case value
    when Hash
      value.keys.sort.to_h { |key| [key, deep_sort(value.fetch(key))] }
    when Array
      value.map { |item| deep_sort(item) }
    else
      value
    end
  end

  def file_sha256(path)
    "sha256:#{Digest::SHA256.file(path).hexdigest}"
  end

  def fail!(message)
    raise ProvisioningError, message
  end
end

begin
  Phase53_4RedmineAdministrativeProvisioning.run
rescue Phase53_4RedmineAdministrativeProvisioning::ProvisioningError => e
  warn "Phase 53-4 provisioning FAIL: #{e.message}"
  exit 1
end
