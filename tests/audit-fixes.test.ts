import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    search: { maxOutputBytes: 10_000_000 },
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1_000_000, persistDir: null },
    stalenessGuard: { enabled: false },
    debug: false,
    templatesDir: undefined,
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

import { undoManager } from "../src/undo/undo-manager.js";
import { bulkRename } from "../src/operations/bulk-rename-operations.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";

let tempDir: string;

beforeEach(async () => {
  await treeSitterManager.initialize();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fixes-"));
  await undoManager.clear();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("audit fixes: undo integrity", () => {
  it("fix #3: undo of a deleted file restores its original mode (0600 stays 0600)", async () => {
    const fp = path.join(tempDir, "private.txt");
    await fs.writeFile(fp, "secret", "utf-8");
    await fs.chmod(fp, 0o600);

    await undoManager.record(fp, "delete_file");
    await fs.unlink(fp);

    const result = await undoManager.undo(1);
    expect(result.undone).toBe(1);

    const mode = (await fs.stat(fp)).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(await fs.readFile(fp, "utf-8")).toBe("secret");
  });

  it("fix #2: recordBatch with requireUndoable refuses a batch containing a binary file", async () => {
    const fp = path.join(tempDir, "binary.bin");
    // Bytes invalid in UTF-8 round trip → captureState marks notUndoable
    await fs.writeFile(fp, Buffer.from([0xff, 0x00, 0xfe]));

    await expect(
      undoManager.recordBatch([{ filePath: fp, description: "delete_directory" }], { requireUndoable: true }),
    ).rejects.toThrow(/undo not possible/);

    // Nothing was pushed — the file is untouched and the stack is empty
    expect(undoManager.size).toBe(0);
    expect(await fs.readFile(fp)).toEqual(Buffer.from([0xff, 0x00, 0xfe]));
  });

  it("fix #4: bulk_rename does not overwrite a target created concurrently (link is exclusive)", async () => {
    const src = path.join(tempDir, "a.txt");
    await fs.writeFile(src, "A", "utf-8");

    // Adversarial: create the target between planning and execution
    const victim = path.join(tempDir, "b.txt");
    await fs.writeFile(victim, "VICTIM", "utf-8");

    const { errors, renamed } = await bulkRename(tempDir, {
      pattern: "^a\\.txt$",
      replacement: "b.txt",
      dryRun: false,
    });

    expect(renamed).toHaveLength(0);
    expect(errors).toHaveLength(1);
    // The victim was NOT replaced
    expect(await fs.readFile(victim, "utf-8")).toBe("VICTIM");
    // The source is still there
    expect(await fs.readFile(src, "utf-8")).toBe("A");
  });

  it("fix #1: renameSymbol beforeWrite hook fires before each file is written", async () => {
    const { renameSymbol } = await import("../src/semantic/code-editor-rename.js");
    const fp = path.join(tempDir, "mod.ts");
    await fs.writeFile(fp, "const oldName = 1;\nexport { oldName };\n", "utf-8");

    const order: string[] = [];
    await renameSymbol(fp, await fs.readFile(fp, "utf-8"), "oldName", "newName", {
      dryRun: false,
      searchPath: tempDir,
      beforeWrite: async (f) => {
        // At hook time the file must still have the OLD content
        const c = await fs.readFile(f, "utf-8");
        order.push(c.includes("oldName") ? "pre-write" : "post-write");
      },
    });

    expect(order.length).toBeGreaterThan(0);
    expect(order.every(o => o === "pre-write")).toBe(true);
    expect(await fs.readFile(fp, "utf-8")).toContain("newName");
  });

  it("E2E: rename across two files then undo restores BOTH pre-rename contents", async () => {
    const { renameSymbol } = await import("../src/semantic/code-editor-rename.js");
    const def = path.join(tempDir, "def.ts");
    const usage = path.join(tempDir, "usage.ts");
    const defOriginal = "export function myFunc(): number {\n  return 1;\n}\n";
    const usageOriginal = "import { myFunc } from \"./def.js\";\nconsole.log(myFunc());\n";
    await fs.writeFile(def, defOriginal, "utf-8");
    await fs.writeFile(usage, usageOriginal, "utf-8");

    await renameSymbol(def, defOriginal, "myFunc", "renamedFunc", {
      dryRun: false,
      searchPath: tempDir,
      beforeWrite: async (f) => {
        await undoManager.record(f, "rename_symbol: myFunc -> renamedFunc");
      },
    });

    // Both files now carry the new name
    expect(await fs.readFile(def, "utf-8")).toContain("renamedFunc");
    expect(await fs.readFile(usage, "utf-8")).toContain("renamedFunc");

    // Undo the whole rename (2 entries: def + usage)
    const result = await undoManager.undo(2);
    expect(result.undone).toBe(2);
    expect(result.restored.every(r => r.success)).toBe(true);

    // Both files are back to pre-rename content — the OLD name
    expect(await fs.readFile(def, "utf-8")).toBe(defOriginal);
    expect(await fs.readFile(usage, "utf-8")).toBe(usageOriginal);
  });
});