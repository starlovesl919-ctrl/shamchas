/**
 * ShamCash encrypts every API payload and every webhook with a Direct JWE
 * (compact serialization, `dir` + `A256GCM`).
 *
 * - protected header is fixed: {"alg":"dir","enc":"A256GCM","cty":"json"}
 * - the encrypted-key segment is empty
 * - IV is 12 bytes, authentication tag is 16 bytes
 * - additional authenticated data is the ASCII protected-header segment
 * - the key is the Base64-decoded secretKey (32 bytes) ShamCash issues
 */

const PROTECTED_HEADER = '{"alg":"dir","enc":"A256GCM","cty":"json"}';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export class ShamCashCryptoError extends Error {}

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);

	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
	if (!BASE64URL_PATTERN.test(value)) {
		throw new ShamCashCryptoError("الرمز المشفّر يحتوي ترميز base64url غير صالح.");
	}

	const base64 =
		value.replace(/-/g, "+").replace(/_/g, "/") +
		"=".repeat((4 - (value.length % 4)) % 4);

	return toBytes(base64, "الرمز المشفّر يحتوي ترميز base64url غير صالح.");
}

function base64Decode(value: string): Uint8Array {
	const normalized = value.replace(/\s+/g, "");
	const base64 = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

	return toBytes(base64, "مفتاح شام كاش ليس بترميز Base64 صالح.");
}

function toBytes(base64: string, message: string): Uint8Array {
	let binary: string;
	try {
		binary = atob(base64);
	} catch {
		throw new ShamCashCryptoError(message);
	}

	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

async function importKey(secretKey: string): Promise<CryptoKey> {
	const raw = base64Decode(secretKey.trim());
	if (raw.length !== 32) {
		throw new ShamCashCryptoError("مفتاح شام كاش يجب أن يكون 32 بايت بترميز Base64.");
	}

	return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
		"encrypt",
		"decrypt",
	]);
}

/** Encrypts a JSON string into a ShamCash `encData` token. */
export async function sealPayload(
	secretKey: string,
	plaintext: string,
): Promise<string> {
	const key = await importKey(secretKey);
	const headerBytes = new TextEncoder().encode(PROTECTED_HEADER);
	const header = base64UrlEncode(headerBytes);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const sealed = new Uint8Array(
		await crypto.subtle.encrypt(
			{
				name: "AES-GCM",
				iv,
				additionalData: new TextEncoder().encode(header),
				tagLength: TAG_BYTES * 8,
			},
			key,
			new TextEncoder().encode(plaintext),
		),
	);

	return [
		header,
		"",
		base64UrlEncode(iv),
		base64UrlEncode(sealed.slice(0, sealed.length - TAG_BYTES)),
		base64UrlEncode(sealed.slice(sealed.length - TAG_BYTES)),
	].join(".");
}

/** Decrypts a ShamCash `encData` token and returns its JSON object. */
export async function openPayload(
	secretKey: string,
	token: string,
): Promise<Record<string, unknown>> {
	const parts = token.trim().split(".");
	if (parts.length !== 5 || parts[1] !== "") {
		throw new ShamCashCryptoError("الرمز المشفّر ليس بترميز JWE مباشر.");
	}

	const [header, , ivPart, ciphertextPart, tagPart] = parts;
	assertHeader(header);

	const iv = base64UrlDecode(ivPart);
	const ciphertext = base64UrlDecode(ciphertextPart);
	const tag = base64UrlDecode(tagPart);
	if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
		throw new ShamCashCryptoError("الرمز المشفّر يحتوي IV أو وسم مصادقة غير صالح.");
	}

	const data = new Uint8Array(ciphertext.length + tag.length);
	data.set(ciphertext);
	data.set(tag, ciphertext.length);

	const key = await importKey(secretKey);
	let plaintext: ArrayBuffer;
	try {
		plaintext = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv,
				additionalData: new TextEncoder().encode(header),
				tagLength: TAG_BYTES * 8,
			},
			key,
			data,
		);
	} catch {
		throw new ShamCashCryptoError("تعذّر فك تشفير الحمولة.");
	}

	let payload: unknown;
	try {
		payload = JSON.parse(new TextDecoder().decode(plaintext));
	} catch {
		throw new ShamCashCryptoError("الحمولة المفكوكة ليست JSON صالحاً.");
	}

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new ShamCashCryptoError("الحمولة المفكوكة يجب أن تكون كائناً JSON.");
	}

	return payload as Record<string, unknown>;
}

function assertHeader(header: string): void {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(header)));
	} catch {
		throw new ShamCashCryptoError("الرمز المشفّر يحتوي ترويسة غير صالحة.");
	}

	const keys = Object.keys(parsed);
	if (
		keys.length !== 3 ||
		parsed.alg !== "dir" ||
		parsed.enc !== "A256GCM" ||
		parsed.cty !== "json"
	) {
		throw new ShamCashCryptoError("الرمز المشفّر يجب أن يستخدم Direct A256GCM.");
	}
}
