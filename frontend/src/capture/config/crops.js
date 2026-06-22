/**
 * Universal Capture Engine — CROPS config (WALKING SKELETON: one verb).
 *
 * Schema (Gate 1): VerticalConfig -> Verb -> Resolution -> EventSpec -> Field.
 * This is the PRESENTATION layer only. The backend events_registry.py stays the
 * truth for fields/validation/typed-event/target-table. Adding verbs or whole
 * verticals = edit config, never touch the engine.
 *
 * Skeleton scope: the "Crop Monitoring" verb, resolving to the /events-native,
 * audit-emitting CROP_HEALTH_OBSERVATION typed event. Proves engine -> /events
 * -> field_events + audit.events end to end. The other 7 verbs + 38 events get
 * added here (config) once the skeleton is verified on prod.
 */
export const cropsConfig = {
  vertical: "CROPS",
  verbs: [
    {
      id: "monitoring",
      label: "Crop Monitoring",
      descriptor: "scouting, crop health, growth stage",
      icon: "Eye",
      resolve: {
        primary: {
          event_type: "CROP_HEALTH_OBSERVATION",
          infer: { anchorsFromContext: true, disambiguateWhen: "multipleActiveCycles" },
          capture: [
            {
              name: "status",
              ask: "How does the crop look?",
              input: "choice",
              tier: "quick",
              required: false,
              options: [
                { value: "HEALTHY",  label: "Healthy" },
                { value: "STRESSED", label: "Stressed" },
                { value: "POOR",     label: "Poor" },
              ],
            },
            { name: "issue", ask: "What did you notice?", input: "text", tier: "detail" },
            { name: "notes", ask: "Anything else",        input: "text", tier: "detail" },
          ],
        },
      },
    },
  ],
};

export default cropsConfig;
