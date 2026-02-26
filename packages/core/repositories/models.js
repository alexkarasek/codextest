/**
 * Canonical Phase 3 domain model shapes (JS typedefs).
 * These provide stable contracts across repository implementations.
 */

/**
 * @typedef {Object} Run
 * @property {string} id
 * @property {string|null} requestId
 * @property {string} kind
 * @property {string} status
 * @property {string|null} startedAt
 * @property {string|null} finishedAt
 * @property {number|null} durationMs
 * @property {{promptTokens:number, completionTokens:number, totalTokens:number}} tokens
 * @property {number} estimatedCostUsd
 * @property {Object|null} error
 * @property {Object} metadata
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} RunArtifact
 * @property {string} id
 * @property {string} runId
 * @property {string} type
 * @property {string} location
 * @property {Object} metadata
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Persona
 * @property {string} id
 * @property {string} displayName
 */

/**
 * @typedef {Object} Scenario
 * @property {string} id
 * @property {string} name
 * @property {Object} config
 */

/**
 * @typedef {Object} Workflow
 * @property {string} id
 * @property {string} name
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} WorkflowRun
 * @property {string} id
 * @property {string} workflowId
 * @property {string} status
 */

/**
 * @typedef {Object} Event
 * @property {string} eventType
 * @property {string} timestamp
 * @property {string|null} runId
 */

export const MODEL_NAMES = {
  Run: "Run",
  RunArtifact: "RunArtifact",
  Persona: "Persona",
  Scenario: "Scenario",
  Workflow: "Workflow",
  WorkflowRun: "WorkflowRun",
  Event: "Event"
};
