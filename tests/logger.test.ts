/**
 * Logger Tests
 *
 * Tests for the centralized logging utility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, createLogger } from "../src/utils/logger.js";

describe("Logger", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.DEBUG;
  });

  describe("logger.debug", () => {
    it("does not log when DEBUG is not set", () => {
      delete process.env.DEBUG;
      logger.debug("test message");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("logs when DEBUG=1", () => {
      process.env.DEBUG = "1";
      logger.debug("test message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("test message");
    });

    it("logs when DEBUG=true", () => {
      process.env.DEBUG = "true";
      logger.debug("test message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("test message");
    });

    it("does not log when DEBUG=0", () => {
      process.env.DEBUG = "0";
      logger.debug("test message");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("does not log when DEBUG=false", () => {
      process.env.DEBUG = "false";
      logger.debug("test message");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("logs with additional arguments when DEBUG=1", () => {
      process.env.DEBUG = "1";
      logger.debug("test message", { data: "value" });
      expect(consoleErrorSpy).toHaveBeenCalledWith("test message", { data: "value" });
    });

    it("logs multiple arguments when DEBUG=1", () => {
      process.env.DEBUG = "1";
      logger.debug("message", "arg1", "arg2", 123);
      expect(consoleErrorSpy).toHaveBeenCalledWith("message", "arg1", "arg2", 123);
    });
  });

  describe("logger.info", () => {
    it("logs message to stderr", () => {
      logger.info("info message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("info message");
    });

    it("logs with additional arguments", () => {
      logger.info("info message", { data: "value" });
      expect(consoleErrorSpy).toHaveBeenCalledWith("info message", { data: "value" });
    });

    it("logs multiple arguments", () => {
      logger.info("message", 1, 2, 3);
      expect(consoleErrorSpy).toHaveBeenCalledWith("message", 1, 2, 3);
    });
  });

  describe("logger.warn", () => {
    it("logs with [WARN] prefix", () => {
      logger.warn("warning message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[WARN] warning message");
    });

    it("logs with additional arguments", () => {
      logger.warn("warning message", { context: "test" });
      expect(consoleErrorSpy).toHaveBeenCalledWith("[WARN] warning message", {
        context: "test",
      });
    });
  });

  describe("logger.error", () => {
    it("logs with [ERROR] prefix", () => {
      logger.error("error message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[ERROR] error message");
    });

    it("logs with error object", () => {
      const error = new Error("test error");
      logger.error("error message", error);
      expect(consoleErrorSpy).toHaveBeenCalledWith("[ERROR] error message", error);
    });

    it("logs without error object", () => {
      logger.error("error message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[ERROR] error message");
    });

    it("handles non-Error objects", () => {
      logger.error("error message", { custom: "error" });
      expect(consoleErrorSpy).toHaveBeenCalledWith("[ERROR] error message", {
        custom: "error",
      });
    });

    it("handles string as error", () => {
      logger.error("error message", "string error");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[ERROR] error message", "string error");
    });
  });

  describe("createLogger", () => {
    it("creates logger with prefix", () => {
      const moduleLogger = createLogger("TestModule");
      moduleLogger.info("test");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[TestModule] test");
    });

    it("prefixes all log levels", () => {
      const moduleLogger = createLogger("MyModule");

      moduleLogger.info("info");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[MyModule] info");

      moduleLogger.warn("warn");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[WARN] [MyModule] warn");

      moduleLogger.error("error");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[ERROR] [MyModule] error");
    });

    it("prefixed debug respects DEBUG env var", () => {
      const moduleLogger = createLogger("Debug");

      delete process.env.DEBUG;
      moduleLogger.debug("test");
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      process.env.DEBUG = "1";
      moduleLogger.debug("test");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[Debug] test");
    });

    it("passes additional arguments with prefix", () => {
      const moduleLogger = createLogger("Mod");
      moduleLogger.info("message", { extra: "data" });
      expect(consoleErrorSpy).toHaveBeenCalledWith("[Mod] message", { extra: "data" });
    });

    it("passes error object with prefix", () => {
      const moduleLogger = createLogger("Mod");
      const error = new Error("test");
      moduleLogger.error("failed", error);
      expect(consoleErrorSpy).toHaveBeenCalledWith("[ERROR] [Mod] failed", error);
    });

    it("creates independent loggers", () => {
      const logger1 = createLogger("Module1");
      const logger2 = createLogger("Module2");

      logger1.info("from 1");
      logger2.info("from 2");

      expect(consoleErrorSpy).toHaveBeenNthCalledWith(1, "[Module1] from 1");
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, "[Module2] from 2");
    });
  });

  describe("output to stderr", () => {
    it("all methods use console.error (stderr)", () => {
      // This ensures MCP protocol compliance - stdout is for protocol messages
      const methods = ["info", "warn", "error"] as const;

      for (const method of methods) {
        consoleErrorSpy.mockClear();
        logger[method]("test");
        expect(consoleErrorSpy).toHaveBeenCalled();
      }
    });

    it("debug uses console.error when enabled", () => {
      process.env.DEBUG = "1";
      logger.debug("test");
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("handles empty messages", () => {
      logger.info("");
      expect(consoleErrorSpy).toHaveBeenCalledWith("");
    });

    it("handles undefined arguments", () => {
      logger.info("message", undefined);
      expect(consoleErrorSpy).toHaveBeenCalledWith("message", undefined);
    });

    it("handles null arguments", () => {
      logger.info("message", null);
      expect(consoleErrorSpy).toHaveBeenCalledWith("message", null);
    });

    it("handles unicode messages", () => {
      logger.info("日本語 café 🎉");
      expect(consoleErrorSpy).toHaveBeenCalledWith("日本語 café 🎉");
    });

    it("handles multiline messages", () => {
      logger.info("line1\nline2\nline3");
      expect(consoleErrorSpy).toHaveBeenCalledWith("line1\nline2\nline3");
    });
  });
});
