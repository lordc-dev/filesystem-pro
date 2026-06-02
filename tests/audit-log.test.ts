import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auditLog, closeAuditLog } from "../src/utils/audit-log.js";

describe("AuditLog", () => {
  beforeEach(() => {
    delete process.env.MCP_AUDIT_LOG_PATH;
  });

  afterEach(() => {
    closeAuditLog();
    vi.restoreAllMocks();
  });

  it("logs audit entry without file path", () => {
    expect(() => auditLog("file_edit", "/tmp/test.ts", "edit_file")).not.toThrow();
  });

  it("logs audit entry with metadata", () => {
    expect(() =>
      auditLog("file_delete", "/tmp/old.ts", "delete_file", { recursive: true }),
    ).not.toThrow();
  });

  it("includes all operation types", () => {
    const operations = [
      "file_create",
      "file_write",
      "file_delete",
      "file_move",
      "file_edit",
      "directory_create",
      "directory_delete",
      "undo_apply",
      "undo_record",
      "backup_create",
      "backup_restore",
    ] as const;

    for (const op of operations) {
      expect(() => auditLog(op, "/tmp/test", "test_tool")).not.toThrow();
    }
  });

  it("includes counter for each operation", async () => {
    const { getMetrics } = await import("../src/utils/metrics.js");
    getMetrics();
    auditLog("file_write", "/tmp/test.ts", "write_file");
    const snapshot = getMetrics();
    const found = snapshot.counters.find(
      (c) => c.name === "audit_operations" && c.labels.operation === "file_write",
    );
    expect(found).toBeDefined();
    expect(found!.value).toBeGreaterThanOrEqual(1);
  });
});