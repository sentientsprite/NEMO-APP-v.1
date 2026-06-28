import { z } from "zod";

import { WORKFLOW_TEMPLATES } from "@nemo/agents";

const templateIds = Object.keys(WORKFLOW_TEMPLATES) as [
  keyof typeof WORKFLOW_TEMPLATES,
  ...(keyof typeof WORKFLOW_TEMPLATES)[],
];

export const workflowTemplateIdSchema = z.enum(templateIds);

export const createWorkflowBodySchema = z.object({
  templateId: workflowTemplateIdSchema,
  title: z.string().trim().min(1, "Title required").max(500),
  prompt: z.string().trim().min(1, "Prompt required").max(10_000),
});

export const workflowActionBodySchema = z.object({
  action: z.enum(["approve", "reject", "run"]),
  reason: z.string().trim().max(2000).optional(),
});

export const memorySourceTypeSchema = z.enum(["note", "csv", "url"]);

export const createMemoryBodySchema = z
  .object({
    title: z.string().trim().max(500).optional(),
    content: z.string().trim().max(100_000).optional(),
    sourceType: memorySourceTypeSchema.default("note"),
    sourceUrl: z.string().trim().url().max(2048).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sourceType === "url") {
      if (!data.sourceUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL required for url source type",
          path: ["sourceUrl"],
        });
      }
      return;
    }
    if (!data.content?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Content required",
        path: ["content"],
      });
    }
  });

export const memorySearchQuerySchema = z.object({
  q: z.string().max(500).default(""),
});
