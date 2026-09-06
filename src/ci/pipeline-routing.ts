import {
  classifyChangedPaths,
  type CiChangeClassificationResult,
  type CiExecutionContext,
  type CiVerificationDomain,
} from "./change-classification.js";

export interface CiRoutingRequest {
  requestedExecutionContext?: CiExecutionContext;
  tag?: string;
  runReproducibility?: boolean;
}

export interface CiPipelinePlan {
  resolvedExecutionContext: CiExecutionContext;
  classification: CiChangeClassificationResult;
  runStatic: boolean;
  runUnit: boolean;
  runIntegration: boolean;
  runE2e: boolean;
  runContextBudget: boolean;
  runDocsOnly: boolean;
  runManualReproducibility: boolean;
  runFullReleaseGate: boolean;
}

function hasDomain(
  domains: readonly CiVerificationDomain[],
  domain: CiVerificationDomain,
): boolean {
  return domains.includes(domain);
}

function resolveExecutionContext(
  request: CiRoutingRequest,
): CiExecutionContext {
  if (request.tag && request.tag.trim().length > 0) {
    return "release";
  }

  return request.requestedExecutionContext ?? "normal";
}

export function planCiPipeline(
  changedPaths: readonly string[],
  request: CiRoutingRequest = {},
): CiPipelinePlan {
  const resolvedExecutionContext = resolveExecutionContext(request);
  const classification = classifyChangedPaths(
    changedPaths,
    resolvedExecutionContext,
  );

  if (classification.fullQualityGateRequired) {
    return {
      resolvedExecutionContext,
      classification,
      runStatic: false,
      runUnit: false,
      runIntegration: false,
      runE2e: false,
      runContextBudget: false,
      runDocsOnly: false,
      runManualReproducibility: false,
      runFullReleaseGate: true,
    };
  }

  const domains = classification.requiredVerificationDomains;

  return {
    resolvedExecutionContext,
    classification,
    runStatic: hasDomain(domains, "static"),
    runUnit: hasDomain(domains, "unit"),
    runIntegration: hasDomain(domains, "integration"),
    runE2e: hasDomain(domains, "e2e"),
    runContextBudget: hasDomain(domains, "context_budget"),
    runDocsOnly: domains.length === 0,
    runManualReproducibility: request.runReproducibility === true,
    runFullReleaseGate: false,
  };
}
