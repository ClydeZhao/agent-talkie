import { z } from "zod";

export const supportedVersionsSchema = z
  .object({
    minVersion: z.number().int().positive(),
    maxVersion: z.number().int().positive(),
  })
  .superRefine((v, ctx) => {
    if (v.minVersion > v.maxVersion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minVersion must be <= maxVersion",
      });
    }
  });

export type SupportedVersions = z.infer<typeof supportedVersionsSchema>;

export function versionRangesOverlap(
  client: SupportedVersions,
  relay: SupportedVersions,
): boolean {
  return (
    client.maxVersion >= relay.minVersion &&
    client.minVersion <= relay.maxVersion
  );
}

export function agreeProtocolVersion(
  client: SupportedVersions,
  relay: SupportedVersions,
): number {
  if (!versionRangesOverlap(client, relay)) {
    throw new Error("No overlapping protocol version range");
  }
  return Math.min(relay.maxVersion, client.maxVersion);
}

export const versionNegotiationFailureSchema = z.object({
  error: z.literal("version_mismatch"),
  relay: supportedVersionsSchema,
  message: z.string().min(1),
});

export type VersionNegotiationFailure = z.infer<
  typeof versionNegotiationFailureSchema
>;

export function buildVersionMismatchFailure(
  relay: SupportedVersions,
  message = "Client protocol version range has no overlap with relay",
): VersionNegotiationFailure {
  return {
    error: "version_mismatch",
    relay,
    message,
  };
}
