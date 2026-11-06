import { describe, expect, it } from "vitest";
import { openPayload, sealPayload, ShamCashCryptoError } from "../worker/shamcash/crypto";
import { parseWebhook } from "../worker/shamcash/client";

/** 32 random bytes, the shape ShamCash issues as its Base64 secretKey. */
function newSecret(): string {
	return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

function settingsFor(secretKey: string) {
	return {
		baseUrl: "https://shamcash.invalid/services",
		agentKey: "test-agent",
		secretKey,
	};
}

describe("Sham Cash Direct JWE", () => {
	it("round-trips a payload", async () => {
		const secretKey = newSecret();
		const token = await sealPayload(secretKey, JSON.stringify({ billNo: "SB-1" }));

		expect(token.split(".")).toHaveLength(5);
		expect(token.split(".")[1]).toBe("");
		await expect(openPayload(secretKey, token)).resolves.toEqual({ billNo: "SB-1" });
	});

	it("rejects a token encrypted with another key", async () => {
		const token = await sealPayload(newSecret(), JSON.stringify({ billNo: "SB-1" }));

		await expect(openPayload(newSecret(), token)).rejects.toBeInstanceOf(ShamCashCryptoError);
	});

	it("rejects a tampered ciphertext", async () => {
		const secretKey = newSecret();
		const parts = (await sealPayload(secretKey, JSON.stringify({ billNo: "SB-1" }))).split(".");
		const flipped = parts[3].startsWith("A") ? `B${parts[3].slice(1)}` : `A${parts[3].slice(1)}`;
		parts[3] = flipped;

		await expect(openPayload(secretKey, parts.join("."))).rejects.toBeInstanceOf(ShamCashCryptoError);
	});
});

describe("Sham Cash webhook", () => {
	const now = () => Math.floor(Date.now() / 1000);

	it("reads a paid notification", async () => {
		const secretKey = newSecret();
		const encData = await sealPayload(
			secretKey,
			JSON.stringify({ billNo: "SB-2", tranId: 91, statusId: 4, iat: now(), exp: now() + 300 }),
		);

		await expect(parseWebhook(settingsFor(secretKey), JSON.stringify({ encData }))).resolves.toEqual({
			billNo: "SB-2",
			tranId: 91,
			statusId: 4,
		});
	});

	it("rejects an expired token", async () => {
		const secretKey = newSecret();
		const encData = await sealPayload(
			secretKey,
			JSON.stringify({ billNo: "SB-3", tranId: 92, statusId: 4, iat: now() - 900, exp: now() - 600 }),
		);

		await expect(parseWebhook(settingsFor(secretKey), JSON.stringify({ encData }))).rejects.toBeInstanceOf(
			ShamCashCryptoError,
		);
	});

	it("rejects a body without encData", async () => {
		await expect(parseWebhook(settingsFor(newSecret()), JSON.stringify({}))).rejects.toBeInstanceOf(
			ShamCashCryptoError,
		);
	});
});
