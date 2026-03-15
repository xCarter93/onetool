---
status: diagnosed
trigger: "It doesn't seem like the csv importer recognizes any of the client contact or property fields"
created: 2026-03-14T00:00:00Z
updated: 2026-03-14T00:00:00Z
---

## Current Focus

hypothesis: CLIENT_SCHEMA_FIELDS only defines top-level client table fields; clientContacts and clientProperties table fields are entirely absent
test: Read the CLIENT_SCHEMA_FIELDS constant and compare to schema.ts
expecting: Contact/property fields missing from the constant
next_action: Report diagnosis

## Symptoms

expected: CSV columns like "contact name", "contact email", "contact phone", "property address", "property city" should be recognized and mapped by the AI import wizard
actual: These columns are not recognized; only top-level client fields (companyName, status, companyDescription, etc.) appear as mapping targets
errors: No runtime errors -- columns silently land in unmappedColumns
reproduction: Upload a CSV with contact or property columns; observe they appear as unmapped
started: Always broken -- fields were never added to the schema definition

## Eliminated

(none needed -- root cause found on first hypothesis)

## Evidence

- timestamp: 2026-03-14T00:01:00Z
  checked: apps/web/src/types/csv-import.ts -- CLIENT_SCHEMA_FIELDS constant (lines 71-104)
  found: Only defines 7 fields from the `clients` table: companyName, status, companyDescription, leadSource, communicationPreference, tags, notes. Zero fields from `clientContacts` or `clientProperties` tables.
  implication: The map-schema-tool iterates CLIENT_SCHEMA_FIELDS to find matches. Since contact/property fields don't exist in this object, they can never be matched.

- timestamp: 2026-03-14T00:02:00Z
  checked: packages/backend/convex/schema.ts -- clientContacts table (lines 165-183)
  found: clientContacts has fields: firstName, lastName, email, phone, jobTitle, isPrimary
  implication: These fields need representation in CLIENT_SCHEMA_FIELDS for the mapper to recognize them

- timestamp: 2026-03-14T00:03:00Z
  checked: packages/backend/convex/schema.ts -- clientProperties table (lines 186-215)
  found: clientProperties has fields: propertyName, propertyType, streetAddress, city, state, zipCode, country, isPrimary, latitude, longitude
  implication: These fields also need representation in CLIENT_SCHEMA_FIELDS

- timestamp: 2026-03-14T00:04:00Z
  checked: apps/web/src/mastra/tools/map-schema-tool.ts -- execute function (lines 44-167)
  found: Tool is purely deterministic string-matching against CLIENT_SCHEMA_FIELDS entries. No AI/LLM involved. If a field isn't in the schema constant, it literally cannot be mapped.
  implication: This is a data-completeness problem, not a logic problem

- timestamp: 2026-03-14T00:05:00Z
  checked: apps/web/src/app/(workspace)/clients/import/utils/transform-csv.ts -- buildImportRecords (lines 73-92)
  found: buildImportRecords produces flat key-value records and sends them to `api.clients.bulkCreate`. Even if contact/property fields were mapped, the import pipeline has no logic to split them into separate clientContacts/clientProperties mutations.
  implication: Fix requires TWO layers of changes: (1) schema field definitions, (2) import pipeline to handle multi-table records

## Resolution

root_cause: |
  CLIENT_SCHEMA_FIELDS in `apps/web/src/types/csv-import.ts` only contains fields from the top-level `clients` table (companyName, status, companyDescription, leadSource, communicationPreference, tags, notes). It completely omits all fields from the related `clientContacts` table (firstName, lastName, email, phone, jobTitle) and `clientProperties` table (propertyName, propertyType, streetAddress, city, state, zipCode, country). Since the map-schema-tool does deterministic string matching against this constant, contact and property CSV columns can never be recognized.

  Additionally, even if the fields were added to the schema constant, the import pipeline (buildImportRecords + bulkCreate) produces flat records for the clients table only. There is no logic to:
  1. Prefix/namespace contact vs property fields to avoid collisions (e.g., both contacts and properties have `isPrimary`)
  2. Split mapped fields into separate client, contact, and property records
  3. Call separate mutations to create clientContacts and clientProperties entries

fix: (not applied -- diagnosis only)
verification: (not applied -- diagnosis only)
files_changed: []
