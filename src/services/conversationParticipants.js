import fs from "fs/promises";
import {
  getPersona,
  listPersonas,
  personaJsonPath,
  savePersona
} from "../../lib/storage.js";
import {
  adHocPersonaSchema,
  formatZodError,
  personaSchema
} from "../../lib/validators.js";
import { slugify } from "../../lib/utils.js";
import { selectPersonasForDebate } from "../../lib/personaSelector.js";

export async function resolveSelectedPersonas(selected) {
  const resolved = [];

  for (let i = 0; i < selected.length; i += 1) {
    const entry = selected[i];

    if (entry.type === "saved") {
      const persona = await getPersona(entry.id);
      resolved.push(persona);
      continue;
    }

    const adHocParsed = adHocPersonaSchema.safeParse(entry.persona);
    if (!adHocParsed.success) {
      const err = new Error("Invalid ad-hoc persona payload.");
      err.code = "VALIDATION_ERROR";
      err.details = formatZodError(adHocParsed.error);
      throw err;
    }

    const candidate = adHocParsed.data;
    const adHocId = candidate.id || `adhoc-${slugify(candidate.displayName)}-${i + 1}`;
    const persona = {
      ...candidate,
      id: adHocId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const parsedFull = personaSchema.safeParse(persona);
    if (!parsedFull.success) {
      const err = new Error("Invalid ad-hoc persona payload.");
      err.code = "VALIDATION_ERROR";
      err.details = formatZodError(parsedFull.error);
      throw err;
    }

    if (entry.savePersona) {
      try {
        await fs.access(personaJsonPath(persona.id));
        const err = new Error(`Persona id '${persona.id}' already exists.`);
        err.code = "DUPLICATE_ID";
        throw err;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await savePersona(persona, { withMarkdown: true });
    }

    resolved.push(persona);
  }

  return resolved;
}

export async function resolveDebatePersonas({ selectedPersonas, topic, context, model, maxCount = 3 }) {
  if (Array.isArray(selectedPersonas) && selectedPersonas.length) {
    const personas = await resolveSelectedPersonas(selectedPersonas);
    return {
      personas,
      selectionMeta: {
        mode: "manual",
        reasoning: "Used manually selected personas."
      }
    };
  }

  const { personas: savedPersonas } = await listPersonas();
  const dynamicSelection = await selectPersonasForDebate({
    topic,
    context,
    personas: savedPersonas,
    model,
    maxCount
  });
  return {
    personas: dynamicSelection.personas,
    selectionMeta: {
      mode: dynamicSelection.mode,
      reasoning: dynamicSelection.reasoning
    }
  };
}
