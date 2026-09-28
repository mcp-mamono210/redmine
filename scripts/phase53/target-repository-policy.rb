# frozen_string_literal: true

module Phase53TargetRepositoryPolicy
  module_function

  def evaluate(field_format:, multiple:, possible_values:, supported_formats:, required_allowed_value:)
    blockers = []
    actions = []
    values = Array(possible_values)

    unless multiple == false
      blockers << "Target Repository multiplicity must remain single; no multiplicity conversion is performed"
    end

    unless supported_formats.include?(field_format)
      blockers << "Target Repository type is #{field_format}; changing Target Repository field type is a separate decision"
    end

    if blockers.empty? && field_format == "list" && !values.include?(required_allowed_value)
      actions << {
        "action" => "append_target_repository_value",
        "append" => required_allowed_value,
        "before" => values,
        "after" => values + [required_allowed_value]
      }
    end

    { "blockers" => blockers, "actions" => actions, "preservedPossibleValues" => values }
  end
end
