import type { GatewayBill } from "../../src/types";
import { openPayload, sealPayload, ShamCashCryptoError } from "./crypto";

/**
 * Client for the ShamCash merchant API.
 *
 * Every call is POSTed to `{baseUrl}/api/ElectronicPayment/{action}` with an
 * encrypted `encData` token plus the merchant `agentKey`. ShamCash answers with
 * HTTP 200 and a `{ result, succeeded, message, data }` envelope, where business
 * failures (an invalid agent, an existing bill number) still use HTTP 200.
 */

const TOKEN_TTL_SECONDS = 300;
const WEBHOOK_CLOCK_SKEW_SECONDS = 30;

export const RESULT_SUCCESS = 2500;
export const RESULT_BILL_NO_ALREADY_EXISTS = 1704;

export const STATUS_PAID = 4;

const STATUS_NAMES: Record<number, string> = {
	1: "pending",
	2: "refund",
	3: "expired",
	4: "paid",
	5: "partly_refunded",
};

export const CURRENCY_IDS: Record<string, number> = { USD: 1, SYP: 2 };

export interface ShamCashSettings {
	baseUrl: string;
	agentKey: string;
	secretKey: string;
}

export interface CreateBillInput {
	billNo: string;
	amount: string;
	currencyId: number;
	note?: string;
	callbackUrl: string;
	redirectUrl: string;
}

export interface ShamCashWebhook {
	billNo: string;
	tranId: number | null;
	statusId: number;
}

export class ShamCashConfigError extends Error {}

export class ShamCashApiError extends Error {
	readonly result: number;

	constructor(result: number, message: string) {
		super(message);
		this.result = result;
	}
}

export { ShamCashCryptoError };

export function billStatusName(statusId: number): string {
	return STATUS_NAMES[statusId] ?? "unknown";
}

const SETTING_KEYS = [
	"SHAMCASH_BASE_URL",
	"SHAMCASH_AGENT_KEY",
	"SHAMCASH_SECRET_KEY",
] as const;

export function missingSettings(env: Env): string[] {
	return SETTING_KEYS.filter((key) => (env[key] ?? "").trim() === "");
}

/** Reads the merchant credentials, or null while they are still missing. */
export function readSettings(env: Env): ShamCashSettings | null {
	if (missingSettings(env).length > 0) return null;

	return {
		baseUrl: (env.SHAMCASH_BASE_URL ?? "").trim().replace(/\/+$/, ""),
		agentKey: (env.SHAMCASH_AGENT_KEY ?? "").trim(),
		secretKey: (env.SHAMCASH_SECRET_KEY ?? "").trim(),
	};
}

export async function createBill(
	settings: ShamCashSettings,
	input: CreateBillInput,
): Promise<GatewayBill> {
	const data = await call(
		settings,
		"createBill",
		{
			billNo: input.billNo,
			currencyId: input.currencyId,
			callbackUrl: input.callbackUrl,
			redirectUrl: input.redirectUrl,
			...(input.note ? { note: input.note } : {}),
		},
		input.amount,
	);

	return toBill(data, input.billNo);
}

export async function getBill(
	settings: ShamCashSettings,
	billNo: string,
): Promise<GatewayBill> {
	const data = await call(settings, "getBillInfo", { billNo });

	return toBill(data, billNo);
}

/**
 * Verifies a webhook body and returns the bill update it carries.
 *
 * The raw body must be passed untouched: ShamCash sends `{ "encData": "..." }`
 * and re-encoding the JSON would break the decryption.
 */
export async function parseWebhook(
	settings: ShamCashSettings,
	rawBody: string,
): Promise<ShamCashWebhook> {
	let envelope: unknown;
	try {
		envelope = JSON.parse(rawBody);
	} catch {
		throw new ShamCashCryptoError("جسم الـ webhook يجب أن يكون JSON.");
	}

	if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
		throw new ShamCashCryptoError("جسم الـ webhook يجب أن يكون كائن JSON.");
	}

	const encData = (envelope as Record<string, unknown>).encData;
	if (typeof encData !== "string" || encData === "") {
		throw new ShamCashCryptoError("جسم الـ webhook يجب أن يحتوي encData.");
	}

	const payload = await openPayload(settings.secretKey, encData);
	const now = Math.floor(Date.now() / 1000);
	const issuedAt = toNumber(payload.iat);
	const expiresAt = toNumber(payload.exp);

	if (issuedAt > now + WEBHOOK_CLOCK_SKEW_SECONDS) {
		throw new ShamCashCryptoError("تاريخ إصدار الـ webhook في المستقبل.");
	}
	if (now > expiresAt + WEBHOOK_CLOCK_SKEW_SECONDS) {
		throw new ShamCashCryptoError("انتهت صلاحية الـ webhook.");
	}

	const billNo = typeof payload.billNo === "string" ? payload.billNo : "";
	if (billNo === "") {
		throw new ShamCashCryptoError("الـ webhook لا يحتوي رقم فاتورة.");
	}

	return {
		billNo,
		tranId: payload.tranId == null ? null : toNumber(payload.tranId),
		statusId: toNumber(payload.statusId),
	};
}

async function call(
	settings: ShamCashSettings,
	action: string,
	payload: Record<string, unknown>,
	amount?: string,
): Promise<Record<string, unknown>> {
	const now = Math.floor(Date.now() / 1000);
	const plaintext = buildPayload(payload, amount, now);
	const encData = await sealPayload(settings.secretKey, plaintext);

	let response: Response;
	try {
		response = await fetch(
			`${settings.baseUrl}/api/ElectronicPayment/${action}`,
			{
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ encData, agentKey: settings.agentKey }),
			},
		);
	} catch {
		throw new ShamCashApiError(-1, "تعذّر الوصول إلى شام كاش.");
	}

	if (response.status !== 200) {
		throw new ShamCashApiError(
			-1,
			`أعادت شام كاش حالة HTTP ${response.status}.`,
		);
	}

	let envelope: Record<string, unknown>;
	try {
		envelope = (await response.json()) as Record<string, unknown>;
	} catch {
		throw new ShamCashApiError(-1, "استجابة شام كاش ليست JSON صالحاً.");
	}

	const result = toNumber(envelope.result);
	if (envelope.succeeded !== true || result !== RESULT_SUCCESS) {
		throw new ShamCashApiError(
			result,
			typeof envelope.message === "string" && envelope.message !== ""
				? envelope.message
				: "رفضت شام كاش الطلب.",
		);
	}

	const data = envelope.data;
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new ShamCashApiError(result, "استجابة شام كاش لا تحتوي بيانات.");
	}

	return data as Record<string, unknown>;
}

/**
 * ShamCash takes the amount as a JSON number with at most two decimals, so it is
 * written as a bare literal instead of a quoted string.
 */
function buildPayload(
	payload: Record<string, unknown>,
	amount: string | undefined,
	issuedAt: number,
): string {
	const envelope: Record<string, unknown> = {
		...payload,
		iat: issuedAt,
		exp: issuedAt + TOKEN_TTL_SECONDS,
	};

	if (amount === undefined) return JSON.stringify(envelope);

	const marker = `__shamcash_amount_${issuedAt}_${Math.random()
		.toString(36)
		.slice(2, 8)}`;
	const json = JSON.stringify({ ...envelope, amount: marker });

	return json.replace(`"${marker}"`, amount);
}

function toBill(
	data: Record<string, unknown>,
	fallbackBillNo: string,
): GatewayBill {
	const statusId = toNumber(data.statusId);
	const now = Date.now();

	return {
		billNo:
			typeof data.billNo === "string" && data.billNo !== ""
				? data.billNo
				: fallbackBillNo,
		amount: data.amount == null ? "" : String(data.amount),
		currencyId: toNumber(data.currencyId),
		note: typeof data.rem === "string" && data.rem !== "" ? data.rem : null,
		statusId,
		statusName:
			typeof data.statusName === "string" && data.statusName !== ""
				? data.statusName
				: billStatusName(statusId),
		tranId: data.tranId == null ? null : toNumber(data.tranId),
		paymentUrl: typeof data.paymentUrl === "string" ? data.paymentUrl : "",
		createdAt: now,
		updatedAt: now,
		paidAt: statusId === STATUS_PAID ? now : null,
		source: "create",
	};
}

function toNumber(value: unknown): number {
	const number = typeof value === "number" ? value : Number(value);

	return Number.isFinite(number) ? number : 0;
}
