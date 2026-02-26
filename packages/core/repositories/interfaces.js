export class RunRepository {
  async upsert(_run) {
    throw new Error("RunRepository.upsert not implemented");
  }

  async getById(_runId) {
    throw new Error("RunRepository.getById not implemented");
  }

  async list(_opts = {}) {
    throw new Error("RunRepository.list not implemented");
  }
}

export class EventRepository {
  async append(_event) {
    throw new Error("EventRepository.append not implemented");
  }

  async listByRunId(_runId, _opts = {}) {
    throw new Error("EventRepository.listByRunId not implemented");
  }
}

export class PersonaRepository {
  async list(_opts = {}) {
    throw new Error("PersonaRepository.list not implemented");
  }

  async getById(_id) {
    throw new Error("PersonaRepository.getById not implemented");
  }

  async upsert(_persona) {
    throw new Error("PersonaRepository.upsert not implemented");
  }
}

export class WorkflowRepository {
  async list(_opts = {}) {
    throw new Error("WorkflowRepository.list not implemented");
  }

  async getById(_id) {
    throw new Error("WorkflowRepository.getById not implemented");
  }

  async upsert(_workflow) {
    throw new Error("WorkflowRepository.upsert not implemented");
  }
}
