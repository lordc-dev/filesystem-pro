import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupToolFactories, ANNOTATION_PRESETS, type ToolFactories } from "../src/utils/tool-factory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resetRateLimiter } from "../src/utils/rate-limiter.js";

describe("tool-factory", () => {
  let mockServer: { registerTool: ReturnType<typeof vi.fn> };
  let factories: ToolFactories;

  beforeEach(() => {
    mockServer = { registerTool: vi.fn() };
    factories = setupToolFactories(mockServer as unknown as McpServer);
    resetRateLimiter();
  });

  describe("setupToolFactories", () => {
    it("returns all 4 factory types", () => {
      expect(factories.readOnly).toBeTypeOf("function");
      expect(factories.destructive).toBeTypeOf("function");
      expect(factories.idempotent).toBeTypeOf("function");
      expect(factories.standard).toBeTypeOf("function");
    });

    it("readOnly factory sets readOnlyHint", () => {
      factories.readOnly("test_ro", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { result: z.string() },
      }, async () => ({ content: [{ type: "text", text: "ok" }] }));

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "test_ro",
        expect.objectContaining({
          annotations: expect.objectContaining({ readOnlyHint: true }),
        }),
        expect.any(Function),
      );
    });

    it("destructive factory sets destructiveHint", () => {
      factories.destructive("test_destruct", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { result: z.string() },
      }, async () => ({ content: [{ type: "text", text: "ok" }] }));

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "test_destruct",
        expect.objectContaining({
          annotations: expect.objectContaining({ destructiveHint: true, readOnlyHint: false }),
        }),
        expect.any(Function),
      );
    });

    it("idempotent factory sets idempotentHint", () => {
      factories.idempotent("test_idem", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { result: z.string() },
      }, async () => ({ content: [{ type: "text", text: "ok" }] }));

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "test_idem",
        expect.objectContaining({
          annotations: expect.objectContaining({ idempotentHint: true, readOnlyHint: false }),
        }),
        expect.any(Function),
      );
    });

    it("standard factory sets no special hints", () => {
      factories.standard("test_std", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { result: z.string() },
      }, async () => ({ content: [{ type: "text", text: "ok" }] }));

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "test_std",
        expect.objectContaining({
          annotations: {},
        }),
        expect.any(Function),
      );
    });

    it("config annotations override factory defaults", () => {
      factories.readOnly("test_override", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { result: z.string() },
        annotations: { longRunningHint: true },
      }, async () => ({ content: [{ type: "text", text: "ok" }] }));

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "test_override",
        expect.objectContaining({
          annotations: expect.objectContaining({ readOnlyHint: true, longRunningHint: true }),
        }),
        expect.any(Function),
      );
    });

    it("passes title, description, inputSchema, outputSchema to server", () => {
      const inputSchema = { path: z.string(), count: z.number() };
      const outputSchema = { result: z.boolean() };

      factories.readOnly("test_props", {
        title: "My Tool",
        description: "Does stuff",
        inputSchema,
        outputSchema,
      }, async () => ({ content: [{ type: "text", text: "ok" }] }));

      const call = mockServer.registerTool.mock.calls[0];
      expect(call[1].title).toBe("My Tool");
      expect(call[1].description).toBe("Does stuff");
      expect(call[1].inputSchema).toBe(inputSchema);
      expect(call[1].outputSchema).toBe(outputSchema);
    });
  });

  describe("wrapped handler", () => {
    it("calls handler and returns content", async () => {
      const handler = vi.fn(async () => ({
        content: [{ type: "text", text: "result" }],
      }));

      factories.readOnly("test_handler", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { result: z.string() },
      }, handler);

      const wrappedHandler = mockServer.registerTool.mock.calls[0][2];
      const result = await wrappedHandler({ x: "hello" });

      expect(handler).toHaveBeenCalledWith({ x: "hello" });
      expect(result.content[0].text).toBe("result");
    });

    it("returns error when rate limited", async () => {
      const { setRateLimiter, RateLimiter } = await import("../src/utils/rate-limiter.js");
      const handler = vi.fn(async () => ({
        content: [{ type: "text", text: "should not reach" }],
      }));

      factories.readOnly("test_ratelimit", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { result: z.string() },
      }, handler);

      const wrappedHandler = mockServer.registerTool.mock.calls[0][2];

      const strictLimiter = new RateLimiter();
      strictLimiter.setToolConfig("test_ratelimit", { maxTokens: 0, tokensPerMinute: 0 });
      setRateLimiter(strictLimiter);

      const result = await wrappedHandler({ x: "hello" });

      expect(handler).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      resetRateLimiter();
    });

    it("propagates handler errors", async () => {
      const handler = vi.fn(async () => {
        throw new Error("boom");
      });

      factories.readOnly("test_err", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { result: z.string() },
      }, handler);

      const wrappedHandler = mockServer.registerTool.mock.calls[0][2];
      await expect(wrappedHandler({ x: "hello" })).rejects.toThrow("boom");
    });

    it("logs warning on missing structuredContent keys", async () => {
      const handler = vi.fn(async () => ({
        content: [{ type: "text", text: "ok" }],
        structuredContent: { other: "value" },
      }));

      factories.readOnly("test_missing_keys", {
        title: "Test",
        description: "desc",
        inputSchema: { x: z.string() },
        outputSchema: { declared: z.string() },
      }, handler);

      const wrappedHandler = mockServer.registerTool.mock.calls[0][2];
      const { logger } = await import("../src/utils/logger.js");
      const errorSpy = vi.spyOn(logger, "error");

      await wrappedHandler({ x: "hello" });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("extra keys"),
      );
    });
  });

  describe("ANNOTATION_PRESETS", () => {
    it("READ_ONLY has readOnlyHint", () => {
      expect(ANNOTATION_PRESETS.READ_ONLY).toEqual({ readOnlyHint: true });
    });

    it("DESTRUCTIVE has destructiveHint", () => {
      expect(ANNOTATION_PRESETS.DESTRUCTIVE).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
      });
    });

    it("IDEMPOTENT has idempotentHint", () => {
      expect(ANNOTATION_PRESETS.IDEMPOTENT).toEqual({
        readOnlyHint: false,
        idempotentHint: true,
      });
    });

    it("LONG_RUNNING has longRunningHint", () => {
      expect(ANNOTATION_PRESETS.LONG_RUNNING).toEqual({ longRunningHint: true });
    });
  });
});