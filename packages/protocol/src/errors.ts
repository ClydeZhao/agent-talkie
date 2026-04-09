export const SCHEMA_VERSION_UNSUPPORTED_CODE = "SCHEMA_VERSION_UNSUPPORTED";

export type SchemaVersionUnsupported = {
  code: typeof SCHEMA_VERSION_UNSUPPORTED_CODE;
  supported_min: number;
  supported_max: number;
  upgrade_doc_url: string;
};

export function schemaVersionUnsupported(): SchemaVersionUnsupported {
  return {
    code: SCHEMA_VERSION_UNSUPPORTED_CODE,
    supported_min: 1,
    supported_max: 1,
    upgrade_doc_url: "docs/protocol-upgrades.md",
  };
}
