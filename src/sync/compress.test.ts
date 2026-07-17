// @vitest-environment node
// Node env for a real CompressionStream (jsdom has none), matching sync.test.
import { describe, it, expect } from "vitest"
import { deflate, inflate } from "./compress"

describe("compress", () => {
    it("round-trips text through deflate/inflate", async () => {
        const text = JSON.stringify({ greeting: "hello world", nums: Array.from({ length: 50 }, (_, i) => i) })
        expect(await inflate(await deflate(text))).toBe(text)
    })

    it("shrinks repetitive JSON well under a third", async () => {
        // A collections-shaped blob: many similar cardKey -> qty entries compress hard.
        const text = JSON.stringify(
            Array.from({ length: 200 }, (_, i) => ({ id: `sv1-${i}`, set: "Scarlet & Violet", qty: 1 }))
        )
        const bytes = await deflate(text)
        expect(bytes.length).toBeLessThan(text.length / 3)
    })
})
