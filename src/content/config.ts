import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';

// Schema for incident updates
const incidentUpdateSchema = z.object({
  id: z.string(),
  status: z.string(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  display_at: z.string(),
  affected_components: z.array(z.object({
    code: z.string(),
    name: z.string(),
    old_status: z.string(),
    new_status: z.string(),
  })).nullable(),
});

// Schema for component status in incidents
const componentStatusSchema = z.object({
  code: z.string().optional(),
  name: z.string(),
  old_status: z.string().optional(),
  new_status: z.string().optional(),
});

// Main incidents collection schema
const incidents = defineCollection({
  loader: file("src/data/incidents-archive.json"),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['investigating', 'identified', 'monitoring', 'resolved', 'postmortem']),
    impact: z.enum(['none', 'minor', 'major', 'critical']),
    created_at: z.string(),
    updated_at: z.string(),
    monitoring_at: z.string().nullable().optional(),
    resolved_at: z.string().nullable(),
    impact_override: z.string().nullable().optional(),
    shortlink: z.string(),
    started_at: z.string(),
    page_id: z.string(),
    incident_updates: z.array(incidentUpdateSchema),
    components: z.array(componentStatusSchema),
    postmortem_body: z.string().nullable().optional(),
    postmortem_body_last_updated_at: z.string().nullable().optional(),
  }),
});

// Schema for GitHub components
const componentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['operational', 'degraded_performance', 'partial_outage', 'major_outage', 'under_maintenance']),
  created_at: z.string(),
  updated_at: z.string(),
  position: z.number(),
  description: z.string().nullable(),
  showcase: z.boolean().optional(),
  start_date: z.string().nullable().optional(),
  group_id: z.string().nullable(),
  page_id: z.string().optional(),
  group: z.boolean().optional(),
  only_show_if_degraded: z.boolean().optional(),
});

const components = defineCollection({
  loader: file("src/data/components.json"),
  schema: componentSchema,
});

export const collections = { incidents, components };

// Export types for use in other files
export type Incident = z.infer<typeof incidents.schema>;
export type Component = z.infer<typeof componentSchema>;
export type IncidentUpdate = z.infer<typeof incidentUpdateSchema>;
export type ComponentStatus = z.infer<typeof componentStatusSchema>;
