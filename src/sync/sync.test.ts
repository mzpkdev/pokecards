// @vitest-environment node
// Node env: real WebCrypto (no polyfill) + a mocked global fetch. sync.ts touches no DOM/localStorage,
// so the round-trip below runs the genuine compress -> encrypt -> store -> decrypt -> inflate path end
// to end. CollectionsState is a type-only import, so useCollection is never loaded at runtime here.

import { afterEach, describe, it, expect, vi } from "vitest"
import type { CollectionsState } from "../useCollection"
import { generateCode } from "./crypto"
import { pull, push, syncEnabled } from "./sync"

// A representative payload: two named collections with several cardKey -> qty entries each.
const state = (): CollectionsState => ({
    activeId: "binder-vintage",
    collections: [
        { id: "binder-vintage", name: "Vintage", cards: { "base1-4": 2, "base1-58": 1, "cel25c-4": 3 } },
        { id: "binder-modern", name: "Modern", cards: { "sv1-1": 1, "sv3-125": 4 } }
    ]
})

describe("sync client", () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it("no-ops and never fetches when VITE_SYNC_URL is disabled", async () => {
        vi.stubEnv("VITE_SYNC_URL", "")
        const fetchSpy = vi.fn()
        vi.stubGlobal("fetch", fetchSpy)
        expect(syncEnabled()).toBe(false)
        expect(await pull("code")).toBeNull()
        expect(await push("code", state(), 1)).toEqual({ ok: true, version: 0 })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("round-trips push -> pull through the encrypted envelope, carrying the server version", async () => {
        vi.stubEnv("VITE_SYNC_URL", "https://sync.example/")
        const code = generateCode()
        let stored = ""
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === "PUT") {
                stored = init.body as string
                return new Response(null, { status: 204, headers: { "x-sync-version": "111" } })
            }
            return new Response(stored, { status: 200, headers: { "x-sync-version": "111" } })
        })
        vi.stubGlobal("fetch", fetchMock)

        expect(await push(code, state(), 999)).toEqual({ ok: true, version: 111 })
        // The stored body is opaque ciphertext, not the plaintext collection.
        expect(stored).not.toContain("Vintage")
        expect(stored).not.toContain("base1-4")

        const pulled = await pull(code)
        expect(pulled?.version).toBe(111)
        // Transport returns the decoded payload as parsed JSON (unknown); it deep-equals the original.
        expect(pulled?.data).toEqual(state())
    })

    it("returns null when the blob is absent (404)", async () => {
        vi.stubEnv("VITE_SYNC_URL", "https://sync.example")
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 404 }))
        )
        expect(await pull(generateCode())).toBeNull()
    })

    it("returns null when the stored blob can't be decrypted (wrong key / garbage)", async () => {
        vi.stubEnv("VITE_SYNC_URL", "https://sync.example")
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("this-is-not-a-valid-ciphertext", { status: 200 }))
        )
        expect(await pull(generateCode())).toBeNull()
    })

    it("throws on an unexpected server error during pull", async () => {
        vi.stubEnv("VITE_SYNC_URL", "https://sync.example")
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 500 }))
        )
        await expect(pull(generateCode())).rejects.toThrow()
    })

    it("classifies 429/5xx as retryable and 4xx as not", async () => {
        vi.stubEnv("VITE_SYNC_URL", "https://sync.example")
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 429 }))
        )
        expect(await push(generateCode(), state(), 1)).toEqual({ ok: false, status: 429, retryable: true })
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 400 }))
        )
        expect(await push(generateCode(), state(), 1)).toEqual({ ok: false, status: 400, retryable: false })
    })
})
