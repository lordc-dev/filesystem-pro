import { describe, it, expect } from "vitest";
import { Semaphore } from "../src/utils/concurrency.js";

describe("Semaphore", () => {
  it("allows up to max concurrent acquisitions", async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    expect(sem.running).toBe(2);
    expect(sem.available).toBe(0);
    sem.release();
    sem.release();
    expect(sem.running).toBe(0);
  });

  it("queues excess acquires", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem.pending).toBe(0);
    const p = sem.acquire();
    expect(sem.pending).toBe(1);
    sem.release();
    await p;
    expect(sem.running).toBe(1);
    sem.release();
  });

  it("processes queue in FIFO order", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));
    sem.release();
    await p1;
    sem.release();
    await p2;
    expect(order).toEqual([1, 2]);
  });

  it("reports available slots correctly", () => {
    const sem = new Semaphore(3);
    expect(sem.available).toBe(3);
  });
});